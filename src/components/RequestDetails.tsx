import SaudiPlate from "./SaudiPlate";
import { Card, KV } from "@/components/ui";
import { i18n } from "@/lib/i18n";
import { listZones } from "@/lib/settings";
import { q } from "@/lib/db";
import { maskId, type RequestRow } from "@/lib/permits";

export async function RequestDetails({ r, mask = false }: { r: RequestRow; mask?: boolean }) {
  const { t, fmtDate } = await i18n();
  const zones = await listZones(true);
  const files = await q<{ id: number; original_name: string; label: string | null; size: number; mime: string }>(
    `SELECT id,original_name,label,size,mime FROM attachments WHERE request_id=$1 ORDER BY id`,
    [r.id],
  );
  const zn = zones.filter((z) => r.zones.includes(z.id));
  return (
    <div className="space-y-5">
      <Card title={t("الجهة والممثل", "Organization & representative")}>
        <dl className="grid gap-4 sm:grid-cols-3">
          <KV k={t("الجهة", "Organization")} v={r.org_name} />
          <KV k={t("السجل التجاري", "CR")} v={<span className="num">{r.cr_number}</span>} />
          <KV k={t("الممثل", "Representative")} v={r.rep_name} />
          <KV k={t("جوال الممثل", "Mobile")} v={<span className="num">{r.rep_phone}</span>} />
          <KV k={t("هوية الممثل", "ID")} v={<span className="num">{mask ? maskId(r.rep_id) : r.rep_id}</span>} />
        </dl>
      </Card>
      <Card title={t("الغرض والفترة والمناطق", "Purpose, period & zones")}>
        <p className="text-sm leading-relaxed">{r.purpose}</p>
        <dl className="mt-4 grid gap-4 sm:grid-cols-3">
          <KV k={t("بداية الصلاحية", "From")} v={fmtDate(r.valid_from)} />
          <KV k={t("نهاية الصلاحية", "To")} v={fmtDate(r.valid_to)} />
          <KV k={t("موعد دخول المركبات", "Vehicle entry slot")} v={r.slot_date ? <span className="num">{r.slot_date} · {String(r.slot_hour).padStart(2, "0")}:00</span> : "—"} />
        </dl>
        <div className="mt-4 flex flex-wrap gap-2">
          {zn.map((z) => (
            <span key={z.id} className={`rounded-full px-3 py-1 text-xs font-semibold ${z.sensitive ? "bg-hold-soft text-hold" : "bg-chip text-brand"}`}>
              {t(z.name_ar, z.name_en)}
            </span>
          ))}
        </div>
      </Card>
      <Card title={<>{t("الأفراد", "People")} <span className="num text-ink-soft">({r.people.length})</span></>}>
        <ol className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
          {r.people.map((p, i) => (
            <li key={i} className="flex justify-between gap-3 border-b border-line/60 py-1 text-sm">
              <span className="truncate"><span className="num me-2 text-xs text-ink-soft">{i + 1}</span>{p.name}</span>
              <span className="num shrink-0 text-ink-soft">{mask ? maskId(p.id_number) : p.id_number}</span>
            </li>
          ))}
        </ol>
      </Card>
      <div className="grid gap-5 sm:grid-cols-2">
        <Card title={<>{t("المركبات", "Vehicles")} <span className="num text-ink-soft">({r.vehicles.length})</span></>}>
          {r.vehicles.length ? (
            <ul className="space-y-1.5 text-sm">
              {r.vehicles.map((v, i) => (
                <li key={i} className="flex items-center justify-between gap-2"><SaudiPlate plate={v.plate} kind={v.kind} size="sm" /><span className="text-ink-soft">{v.type}</span></li>
              ))}
            </ul>
          ) : <p className="text-sm text-ink-soft">{t("لا يوجد", "None")}</p>}
        </Card>
        <Card title={<>{t("المعدات", "Equipment")} <span className="num text-ink-soft">({r.equipment.length})</span></>}>
          {r.equipment.length ? (
            <ul className="space-y-1.5 text-sm">
              {r.equipment.map((x, i) => (
                <li key={i} className="flex justify-between gap-2"><span>{x.name}</span><span className="num text-ink-soft">×{x.qty}</span></li>
              ))}
            </ul>
          ) : <p className="text-sm text-ink-soft">{t("لا يوجد", "None")}</p>}
        </Card>
      </div>
      <Card title={t("المرفقات", "Attachments")}>
        {files.length ? (
          <ul className="space-y-2">
            {files.map((f) => (
              <li key={f.id}>
                <a href={`/api/attachments/${f.id}`} target="_blank" className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2 text-sm hover:border-rose">
                  <span className="truncate">{f.label || f.original_name}</span>
                  <span className="num shrink-0 text-xs text-ink-soft">{f.mime.split("/")[1].toUpperCase()} · {Math.ceil(f.size / 1024)}KB</span>
                </a>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-ink-soft">{t("لا توجد مرفقات", "No attachments")}</p>}
        <p className="mt-3 text-xs text-ink-soft">{t("كل اطلاع على مرفق يُسجَّل في سجل العمليات.", "Every attachment view is logged.")}</p>
      </Card>
      <p className="text-xs text-ink-soft">{t("تاريخ التقديم", "Submitted")}: {fmtDate(r.submitted_at)}</p>
    </div>
  );
}
