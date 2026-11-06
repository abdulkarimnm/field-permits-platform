import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import QRCode from "qrcode";
import { getPermit, liveStatus, LIVE_LABEL, maskId, staticQrPayload } from "@/lib/permits";
import { baseUrl, canViewPermit } from "@/lib/access";
import { listZones } from "@/lib/settings";
import { audit } from "@/lib/audit";
import PrintButton, { BackButton } from "./PrintButton";

const fmt = (d: Date | string, lang: "ar" | "en") =>
  new Intl.DateTimeFormat(lang === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(new Date(d));

export default async function PermitDoc({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await getPermit(Number(id));
  if (!p) notFound();
  const access = await canViewPermit(p);
  if (!access) redirect("/apply/login");
  await audit(access.who, "permit.document_viewed", "permit", p.id, { version: p.version });

  const zones = (await listZones(true)).filter((z) => p.zones.includes(z.id));
  const qr = await QRCode.toDataURL(staticQrPayload(await baseUrl(), p), { errorCorrectionLevel: "M", margin: 1, width: 360, color: { dark: "#3d2a24", light: "#ffffff" } });
  const d = p.data;
  const status = liveStatus(p);
  const dense = d.people.length > 40;

  const Row = ({ ar, en, children }: { ar: string; en: string; children: React.ReactNode }) => (
    <tr className="border-b border-rose-soft/70 last:border-0">
      <th className="w-[28%] bg-mist px-3 py-2 text-start align-top text-[11px] font-semibold text-brand">
        {ar}
        <span className="block text-[9px] font-medium text-ink-soft" dir="ltr">{en}</span>
      </th>
      <td className="px-3 py-2 align-top text-[12px] text-ink">{children}</td>
    </tr>
  );

  return (
    <div className="min-h-dvh bg-mist py-6 print:bg-white print:py-0" dir="rtl" lang="ar">
      <div className="no-print mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center justify-between gap-2 px-4">
        <BackButton />
        <PrintButton />
      </div>

      <article className="mx-auto flex h-[297mm] w-[210mm] max-w-full flex-col overflow-hidden bg-white px-[14mm] py-[12mm] shadow-sm print:shadow-none">
        {/* Header */}
        <header className="flex items-center justify-between gap-4 border-b-2 border-brand pb-3">
          <Image src="/brand/logo.png" alt="سيد الشهداء" width={200} height={47} className="h-11 w-auto" priority />
          <div className="text-start">
            <h1 className="font-display text-[19px] font-bold text-brand">تصريح دخول ميدان سيد الشهداء</h1>
            <p className="text-[11px] text-ink-soft" dir="ltr">Sayyid Alshuhada Field — Entry Permit</p>
          </div>
        </header>

        {status !== "valid" && status !== "not_started" && (
          <p className="mt-2 rounded bg-bad-soft px-3 py-1 text-center text-[11px] font-bold text-bad">
            حالة التصريح الحالية: {LIVE_LABEL[status][0]} — {LIVE_LABEL[status][1]}
          </p>
        )}

        {/* Number strip */}
        <div className="mt-3 grid grid-cols-3 overflow-hidden rounded-lg border border-rose-soft text-center">
          {[
            ["رقم التصريح", "Permit No.", <span key="n" className="num">{p.number}</span>],
            ["تاريخ الإصدار", "Issued", fmt(p.issued_at, "ar")],
            ["رقم الإصدار", "Version", <span key="v" className="num">{p.version}</span>],
          ].map(([a, e, v], i) => (
            <div key={i} className={`bg-cream/60 px-2 py-2 ${i ? "border-s border-rose-soft" : ""}`}>
              <p className="text-[10px] text-ink-soft">{a} · <span dir="ltr">{e}</span></p>
              <p className="mt-0.5 text-[14px] font-bold text-brand">{v}</p>
            </div>
          ))}
        </div>

        <table className="mt-3 w-full overflow-hidden rounded-lg border border-rose-soft">
          <tbody>
            <Row ar="الجهة المصرح لها" en="Authorized organization">{p.org_name}{d.cr_number ? <span className="num text-ink-soft"> · س.ت {d.cr_number}</span> : null}</Row>
            <Row ar="الممثل" en="Representative">{d.rep_name} · <span className="num">{maskId(d.rep_phone)}</span></Row>
            <Row ar="الغرض من الدخول" en="Purpose">{d.purpose}</Row>
          </tbody>
        </table>

        <h2 className="mt-3 text-[12px] font-bold text-brand">نطاق التصريح <span className="font-medium text-ink-soft" dir="ltr">· Scope</span></h2>
        <table className="mt-1 w-full overflow-hidden rounded-lg border border-rose-soft">
          <tbody>
            <Row ar="المنطقة المعتمدة" en="Approved zones">{zones.map((z) => `${z.name_ar} (${z.name_en})`).join("، ")}</Row>
            <Row ar="بداية الصلاحية" en="Valid from">{fmt(p.valid_from, "ar")} <span className="text-ink-soft" dir="ltr">· {fmt(p.valid_from, "en")}</span></Row>
            <Row ar="نهاية الصلاحية" en="Valid to">{fmt(p.valid_to, "ar")} <span className="text-ink-soft" dir="ltr">· {fmt(p.valid_to, "en")}</span></Row>
          </tbody>
        </table>

        <h2 className="mt-3 text-[12px] font-bold text-brand">الأفراد والمعدات والمركبات المصرح بها <span className="font-medium text-ink-soft" dir="ltr">· Authorized people, equipment & vehicles</span></h2>
        <div className="mt-1 min-h-0 flex-1 overflow-hidden rounded-lg border border-rose-soft">
          <table className="w-full">
            <thead>
              <tr className="bg-brand text-white">
                <th className="w-[18%] px-3 py-1.5 text-start text-[11px]">الفئة · Category</th>
                <th className="px-3 py-1.5 text-start text-[11px]">البيانات المعتمدة · Approved data</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-rose-soft/70">
                <th className="bg-mist px-3 py-2 text-start align-top text-[11px] text-brand">الأفراد <span className="num block text-ink-soft">({d.people.length})</span></th>
                <td className="px-3 py-1.5">
                  <ol className={`${dense ? "columns-3 text-[8.5px] leading-[1.35]" : "columns-2 text-[10.5px] leading-normal"} gap-4`}>
                    {d.people.map((x, i) => (
                      <li key={i} className="break-inside-avoid">
                        <span className="num text-ink-soft">{i + 1}.</span> {x.name} <span className="num text-ink-soft">{maskId(x.id_number)}</span>
                      </li>
                    ))}
                  </ol>
                </td>
              </tr>
              <tr className="border-b border-rose-soft/70">
                <th className="bg-mist px-3 py-2 text-start align-top text-[11px] text-brand">المعدات</th>
                <td className="px-3 py-1.5 text-[10.5px]">{d.equipment.length ? d.equipment.map((x) => `${x.name} ×${x.qty}`).join("، ") : "لا يوجد · None"}</td>
              </tr>
              <tr>
                <th className="bg-mist px-3 py-2 text-start align-top text-[11px] text-brand">المركبات</th>
                <td className="px-3 py-1.5 text-[10.5px]">
                  {d.vehicles.length ? <span className="num">{d.vehicles.map((v) => v.plate).join(" · ")}</span> : "لا يوجد · None"}
                  {d.slot_date && <span className="block text-ink-soft">موعد الدخول المحجوز: <span className="num">{d.slot_date} {String(d.slot_hour).padStart(2, "0")}:00</span></span>}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Verification */}
        <section className="mt-3 grid grid-cols-[1fr_40mm] items-center gap-4 rounded-lg border border-rose-soft bg-cream/40 p-3">
          <div>
            <h2 className="text-[12px] font-bold text-brand">التحقق عند الدخول <span className="font-medium text-ink-soft" dir="ltr">· Verification at entry</span></h2>
            <p className="mt-1 text-[10.5px] leading-relaxed">
              <strong>الجهة المختصة في الميدان:</strong> يُمسح رمز QR عبر بوابة التحقق الرسمية لعرض حالة التصريح ومطابقة المنطقة والفترة والأفراد والمعدات والمركبات قبل السماح بالدخول.
            </p>
            <p className="mt-1 text-[9.5px] leading-relaxed text-ink-soft" dir="ltr">
              Scan through the official verification portal. The live record in the system — not this paper — is authoritative.
            </p>
          </div>
          <div className="text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="QR" className="mx-auto h-[36mm] w-[36mm]" />
            <p className="num mt-0.5 text-[9px] text-ink-soft">{p.number} · v{p.version}</p>
          </div>
        </section>

        <footer className="mt-2 border-t border-rose-soft pt-2 text-center text-[10px] text-ink-soft">
          يقتصر الدخول على المنطقة والفترة والأسماء والمعدات والمركبات المعتمدة في التصريح.
          <span className="block" dir="ltr">Entry is limited to the approved zones, period, names, equipment and vehicles.</span>
        </footer>
      </article>
    </div>
  );
}
