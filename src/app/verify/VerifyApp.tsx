"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Scanner from "./Scanner";
import SaudiPlate from "@/components/SaudiPlate";
import { downloadSnapshot, enqueue, flushQueue, loadSnapshot, offlineLookup, queued, type Gate, type Snapshot } from "./offline";
import { btn, input } from "@/components/ui";

type Result = {
  found: true;
  offline?: boolean;
  checkId?: number;
  codeType: "static" | "rotating" | "manual";
  status: string;
  number: string;
  version: number;
  printedVersion: number | null;
  pendingAmendment: string | null;
  statusReason: string | null;
  org: string;
  purpose: string;
  validFrom: string;
  validTo: string;
  zones: { id: number; name_ar: string; name_en: string; atGate: boolean }[];
  inScope: boolean;
  people: { name: string; id: string }[];
  vehicles: { plate: string; type: string }[];
  equipment: { name: string; qty: number }[];
  repName: string;
  repPhoneMasked: string;
  canAllow: boolean;
  insidePeople?: number[];
  snapshotAt?: string;
};
type ExitRes =
  | { found: false; reason: string }
  | { found: true; exited: false; reason: "none_inside"; number: string; org: string }
  | { found: true; exited: true; checkId: number; number: string; org: string; status: string; people: { name: string; id: string }[]; vehicles: { plate: string; type: string }[]; equipment: { name: string; qty: number }[]; since: string | null; overstay: boolean };
type Miss = { found: false; reason: string; checkId?: number; offline?: boolean };

const STATUS: Record<string, { ar: string; en: string; cls: string }> = {
  valid: { ar: "ساري", en: "VALID", cls: "bg-ok" },
  not_started: { ar: "لم تبدأ صلاحيته", en: "NOT YET VALID", cls: "bg-wait" },
  expired: { ar: "منتهي", en: "EXPIRED", cls: "bg-off" },
  suspended: { ar: "موقوف", en: "SUSPENDED", cls: "bg-hold" },
  revoked: { ar: "ملغي", en: "REVOKED", cls: "bg-bad" },
};
const MISS: Record<string, [string, string]> = {
  not_found: ["غير موجود — الرمز لا يطابق أي تصريح في النظام", "NOT FOUND — this code matches no permit"],
  invalid: ["رمز غير معروف — ليس رمز تصريح رسمي", "UNKNOWN CODE — not an official permit code"],
  rotating_expired: ["رمز منتهي — صورة شاشة أو رمز قديم. اطلب فتح البطاقة الحية", "STALE CODE — screenshot or old code. Ask for the live pass"],
  snapshot_expired: ["النسخة دون اتصال منتهية — اتصل بالشبكة لتحديثها", "Offline snapshot expired — reconnect to refresh"],
  bad_snapshot: ["توقيع النسخة دون اتصال غير صحيح", "Offline snapshot signature invalid"],
  no_snapshot: ["لا يوجد اتصال ولا نسخة محفوظة للتحقق دون اتصال", "No network and no offline snapshot"],
};

export default function VerifyApp({ lang, gates, initialCode, repOtpMode }: { lang: "ar" | "en"; gates: Gate[]; initialCode: string | null; repOtpMode: "off" | "optional" | "required" }) {
  const t = useCallback((ar: string, en: string) => (lang === "ar" ? ar : en), [lang]);
  const [gateId, setGateId] = useState<number | null>(null);
  const [online, setOnline] = useState(true);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [pending, setPending] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [manual, setManual] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | Miss | null>(null);
  const [matched, setMatched] = useState<{ people: Set<number>; vehicles: Set<number>; equipment: Set<number> }>({ people: new Set(), vehicles: new Set(), equipment: new Set() });
  const [revealed, setRevealed] = useState<Record<number, string>>({});
  const [otp, setOtp] = useState<{ sent: boolean; code: string; state: "idle" | "verified" | "failed"; msg?: string }>({ sent: false, code: "", state: "idle" });
  const [deny, setDeny] = useState("");
  const [flash, setFlash] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [dir, setDir] = useState<"in" | "out">("in");
  const [exitRes, setExitRes] = useState<ExitRes | null>(null);
  const [undone, setUndone] = useState<"idle" | "done" | "late">("idle");

  useEffect(() => {
    try {
      const g = Number(localStorage.getItem("vp_gate"));
      if (gates.some((x) => x.id === g)) setGateId(g);
      if (localStorage.getItem("vp_dir") === "out") setDir("out");
    } catch {}
    setSnap(loadSnapshot());
    setPending(queued().length);
    const upd = () => setOnline(navigator.onLine);
    upd();
    window.addEventListener("online", upd);
    window.addEventListener("offline", upd);
    return () => {
      window.removeEventListener("online", upd);
      window.removeEventListener("offline", upd);
    };
  }, [gates]);

  // Keep the offline snapshot fresh and flush queued offline decisions when online.
  useEffect(() => {
    if (!online) return;
    const run = async () => {
      try {
        setSnap(await downloadSnapshot());
        await flushQueue();
        setPending(queued().length);
      } catch {}
    };
    run();
    const id = setInterval(run, 5 * 60_000);
    return () => clearInterval(id);
  }, [online]);

  const gate = gates.find((g) => g.id === gateId);

  const check = useCallback(
    async (payload: string) => {
      if (!gateId) return;
      setScanning(false);
      setBusy(true);
      setRes(null);
      setMatched({ people: new Set(), vehicles: new Set(), equipment: new Set() });
      setRevealed({});
      setOtp({ sent: false, code: "", state: "idle" });
      setDeny("");
      setFlash(null);
      setExitRes(null);
      setUndone("idle");
      try {
        if (dir === "out") {
          // Exit: one scan records everyone still inside under this permit — no name picking.
          if (!navigator.onLine) {
            setExitRes({ found: false, reason: "offline_exit" });
            return;
          }
          const r = await fetch("/api/verify/exit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ payload, gateId }) });
          if (r.status === 401) location.href = "/staff/login?next=/verify";
          const out: ExitRes = await r.json();
          setExitRes(out);
          try { navigator.vibrate?.(out.found && out.exited ? 60 : [80, 60, 80]); } catch {}
          return;
        }
        if (navigator.onLine) {
          const r = await fetch("/api/verify/lookup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ payload, gateId }) });
          if (r.status === 401) location.href = "/staff/login?next=/verify";
          setRes(await r.json());
        } else {
          const s = loadSnapshot();
          if (!s) setRes({ found: false, reason: "no_snapshot", offline: true });
          else {
            const out = await offlineLookup(payload, gate, s);
            setRes(out as Result | Miss);
            if (!out.found)
              enqueue({ clientId: crypto.randomUUID(), number: ("number" in out && out.number) || null, codeType: out.reason === "rotating_expired" ? "rotating_expired" : "invalid", status: out.reason, gateId, at: new Date().toISOString(), decision: null });
          }
        }
      } catch {
        setRes({ found: false, reason: "not_found" });
      } finally {
        setBusy(false);
      }
    },
    [gateId, gate, dir],
  );

  const autoChecked = useRef(false);
  useEffect(() => {
    if (initialCode && gateId && !autoChecked.current) {
      autoChecked.current = true;
      check(initialCode);
    }
  }, [initialCode, gateId, check]);

  const toggle = (k: "people" | "vehicles" | "equipment", i: number) =>
    setMatched((m) => {
      const s = new Set(m[k]);
      if (s.has(i)) s.delete(i);
      else s.add(i);
      return { ...m, [k]: s };
    });

  async function post(op: string, body: unknown) {
    const r = await fetch(`/api/verify/${op}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return r.json();
  }

  async function decide(decision: "allowed" | "denied") {
    if (!res || !res.found) return;
    const m = { people: [...matched.people], vehicles: [...matched.vehicles], equipment: [...matched.equipment] };
    if (res.offline || !navigator.onLine) {
      enqueue({ clientId: crypto.randomUUID(), number: res.number, codeType: res.codeType, status: res.status, gateId: gateId!, at: new Date().toISOString(), decision, denyReason: deny || undefined, matched: m });
      setPending(queued().length);
      setFlash({ tone: decision === "allowed" ? "ok" : "bad", text: t("سُجّلت النتيجة محليًا وستُرفع عند عودة الاتصال", "Saved locally; will sync when back online") });
      return;
    }
    const r = await post("decision", { checkId: res.checkId, decision, matched: m, denyReason: deny || undefined });
    const ERR: Record<string, [string, string]> = {
      permit_not_valid: ["لا يمكن السماح: التصريح غير سارٍ", "Cannot allow: permit not valid"],
      out_of_scope: ["لا يمكن السماح: هذه البوابة خارج نطاق التصريح", "Cannot allow: gate outside permit scope"],
      rep_otp_required: ["رمز الممثل إلزامي قبل السماح", "Representative code required"],
      no_people_matched: ["أشّر على الأفراد الموجودين فعليًا", "Tick the people actually present"],
      reason_required: ["اكتب سبب منع الدخول", "Enter the denial reason"],
      already_decided: ["سُجلت نتيجة هذا التحقق مسبقًا", "Already recorded"],
    };
    if (r.error) setFlash({ tone: "bad", text: t(...(ERR[r.error] ?? ["تعذر التسجيل", "Failed"])) });
    else setFlash({ tone: decision === "allowed" ? "ok" : "bad", text: decision === "allowed" ? t("تم تسجيل السماح بالدخول", "Entry allowed — recorded") : t("تم تسجيل منع الدخول", "Entry denied — recorded") });
  }

  const ok = res?.found ? res : null;
  const st = ok ? STATUS[ok.status] : null;
  // the server raises the mode to "required" for a typed permit number
  const otpMode = ok && "repOtpMode" in ok && ok.repOtpMode ? ok.repOtpMode : repOtpMode;
  const otpNeeded = otpMode === "required" && !ok?.offline;
  const allowDisabled = !ok?.canAllow || matched.people.size === 0 || (otpNeeded && otp.state !== "verified") || !!flash;
  const fmt = (d: string) => new Intl.DateTimeFormat(lang === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(new Date(d));

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {/* Status row */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold ${online ? "bg-ok-soft text-ok" : "bg-hold-soft text-hold"}`}>
          <span className={`h-2 w-2 rounded-full ${online ? "bg-ok" : "bg-hold"}`} />
          {online ? t("متصل", "Online") : t("دون اتصال", "Offline")}
        </span>
        <span className="rounded-full bg-mist px-2.5 py-1 text-ink-soft">
          {snap ? t(`نسخة دون اتصال: ${fmt(snap.savedAt)}`, `Offline copy: ${fmt(snap.savedAt)}`) : t("لا توجد نسخة دون اتصال", "No offline copy")}
          {snap?.verified === true && " ✓"}
        </span>
        {pending > 0 && <span className="rounded-full bg-wait-soft px-2.5 py-1 font-semibold text-wait">{t(`${pending} بانتظار الرفع`, `${pending} pending sync`)}</span>}
      </div>

      {/* Gate */}
      <div className="rounded-2xl border border-line bg-surface p-4">
        <label htmlFor="gate" className="mb-1.5 block text-sm font-medium">{t("نقطة الدخول", "Entry point")}</label>
        <select
          id="gate"
          className={input}
          value={gateId ?? ""}
          onChange={(e) => {
            const v = Number(e.target.value);
            setGateId(v);
            try { localStorage.setItem("vp_gate", String(v)); } catch {}
          }}
        >
          <option value="" disabled>{t("اختر البوابة", "Select gate")}</option>
          {gates.map((g) => <option key={g.id} value={g.id}>{t(g.name_ar, g.name_en)}</option>)}
        </select>
        <div className="mt-3 grid grid-cols-2 gap-1 rounded-xl bg-mist p-1" role="radiogroup" aria-label={t("نوع العملية", "Operation")}>
          {(["in", "out"] as const).map((d) => (
            <button key={d} type="button" role="radio" aria-checked={dir === d}
              onClick={() => { setDir(d); setRes(null); setExitRes(null); try { localStorage.setItem("vp_dir", d); } catch {} }}
              className={`min-h-11 rounded-lg text-sm font-bold transition ${dir === d ? (d === "in" ? "bg-ok text-white shadow" : "bg-[#2b6f93] text-white shadow") : "text-ink-soft hover:text-ink"}`}>
              {d === "in" ? t("↓ دخول", "↓ Entry") : t("↑ خروج", "↑ Exit")}
            </button>
          ))}
        </div>
        {dir === "out" && <p className="mt-2 text-xs text-ink-soft">{t("امسح رمز التصريح فقط — يُسجَّل خروج كل من دخل به ولم يخرج بعد، دون تحديد الأسماء.", "Just scan the permit — everyone who entered with it and hasn't left is checked out, no name picking.")}</p>}
      </div>

      {gateId && !res && !exitRes && (
        <div className="space-y-3">
          {scanning ? (
            <>
              <Scanner onResult={check} t={t} />
              <button className={`${btn.secondary} w-full`} onClick={() => setScanning(false)}>{t("إيقاف الكاميرا", "Stop camera")}</button>
            </>
          ) : (
            <button className={`${btn.primary} w-full py-5 text-base`} onClick={() => setScanning(true)} disabled={busy}>
              {busy ? t("جارٍ التحقق…", "Checking…") : dir === "out" ? t("مسح رمز الخروج", "Scan to exit") : t("مسح رمز التصريح", "Scan permit code")}
            </button>
          )}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (manual.trim()) check(manual.trim());
            }}
          >
            <input className={input} dir="ltr" value={manual} onChange={(e) => setManual(e.target.value)} placeholder={t("أو اكتب رقم التصريح: PRM-2026-000002", "Or type the permit number: PRM-2026-000002")} aria-label={t("الرمز", "Code")} />
            <button className={btn.secondary}>{dir === "out" ? t("خروج", "Exit") : t("تحقق", "Check")}</button>
          </form>
          <p className="text-center text-xs text-ink-soft">{t("الماسح لا يفتح أي رابط داخل الرمز؛ يبحث عن المعرّف في النظام فقط.", "The scanner never opens links inside the code; it only looks up the identifier.")}</p>
        </div>
      )}

      {exitRes && (
        exitRes.found && exitRes.exited ? (
          <div className="overflow-hidden rounded-2xl border border-[#2b6f93]/30 bg-surface shadow-[0_24px_60px_-30px_rgba(43,111,147,.5)]">
            <div className={`${undone === "done" ? "bg-off" : "bg-[#2b6f93]"} px-5 py-5 text-center text-white`}>
              <p className="font-display text-3xl font-bold">{undone === "done" ? t("أُلغي الخروج", "Exit undone") : t("تم تسجيل الخروج", "Exit recorded")}</p>
              <p className="num mt-1 text-sm opacity-90">{exitRes.number} · {exitRes.org}</p>
              <p className="mt-2 text-sm font-semibold">
                <span className="num">{exitRes.people.length}</span> {t("فرد", "people")}
                {exitRes.vehicles.length > 0 && <> · <span className="num">{exitRes.vehicles.length}</span> {t("مركبة", "vehicles")}</>}
                {exitRes.since && <> · {t("داخل منذ", "inside since")} <span className="num">{new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Riyadh" }).format(new Date(exitRes.since))}</span></>}
              </p>
            </div>
            {exitRes.overstay && <div className="p-4 pb-0"><Banner tone="hold">{t(`خروج بعد انتهاء صلاحية التصريح أو إيقافه — سُجّل للمتابعة.`, `Exit after the permit expired or was suspended — logged for follow-up.`)}</Banner></div>}
            <div className="grid gap-4 p-4 sm:grid-cols-2">
              <div>
                <p className="mb-1.5 text-xs font-semibold text-ink-soft">{t("الأفراد الخارجون", "People out")}</p>
                <ul className="max-h-60 space-y-1 overflow-y-auto text-sm">
                  {exitRes.people.map((p, i) => <li key={i} className="flex items-center gap-2 rounded-lg bg-paper px-3 py-1.5"><span className="text-[#2b6f93]">↑</span><span className="flex-1">{p.name}</span><span className="num text-xs text-ink-soft">{p.id}</span></li>)}
                </ul>
              </div>
              {(exitRes.vehicles.length > 0 || exitRes.equipment.length > 0) && (
                <div>
                  <p className="mb-1.5 text-xs font-semibold text-ink-soft">{t("المركبات والمعدات", "Vehicles & equipment")}</p>
                  <ul className="space-y-1 text-sm">
                    {exitRes.vehicles.map((v, i) => <li key={`v${i}`} className="flex items-center gap-2 rounded-lg bg-paper px-3 py-1.5"><SaudiPlate plate={v.plate} size="sm" /> <span className="text-xs text-ink-soft">{v.type}</span></li>)}
                    {exitRes.equipment.map((x, i) => <li key={`e${i}`} className="rounded-lg bg-paper px-3 py-1.5">{x.name} <span className="num text-xs text-ink-soft">×{x.qty}</span></li>)}
                  </ul>
                </div>
              )}
            </div>
            <div className="space-y-2 border-t border-line bg-paper p-4">
              <button autoFocus className={`${btn.primary} w-full py-4 text-base`} onClick={() => { setExitRes(null); setScanning(true); }}>{t("مسح الخروج التالي", "Scan next exit")}</button>
              {undone === "idle" && (
                <button className={`${btn.ghost} w-full justify-center text-ink-soft`}
                  onClick={async () => { const r = await post("exit-undo", { checkId: exitRes.checkId }); setUndone(r.ok ? "done" : "late"); }}>
                  {t("تراجع عن هذا الخروج (خلال دقيقتين)", "Undo this exit (within 2 min)")}
                </button>
              )}
              {undone === "late" && <p className="text-center text-xs text-bad">{t("انتهت مهلة التراجع", "Undo window has passed")}</p>}
            </div>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-line bg-surface">
            <div className={`${exitRes.found ? "bg-wait" : "bg-bad"} px-5 py-6 text-center text-white`}>
              <p className="font-display text-2xl font-bold">{exitRes.found ? t("لا يوجد دخول مسجّل", "No recorded entry") : t("مرفوض", "REJECTED")}</p>
              <p className="mt-1 text-sm">
                {exitRes.found
                  ? t(`لا يوجد أحد داخل الميدان بالتصريح ${exitRes.number} — ربما سُجّل خروجهم مسبقًا.`, `Nobody is inside under ${exitRes.number} — they may have already exited.`)
                  : exitRes.reason === "offline_exit"
                    ? t("تسجيل الخروج يحتاج اتصالًا بالشبكة لمعرفة من بالداخل", "Recording an exit needs a connection to know who is inside")
                    : t(...(MISS[exitRes.reason] ?? MISS.not_found))}
              </p>
            </div>
            <div className="p-4">
              <p className="text-xs text-ink-soft">{t("سُجّلت المحاولة في سجل العمليات.", "This attempt was logged.")}</p>
              <button className={`${btn.primary} mt-3 w-full`} onClick={() => setExitRes(null)}>{t("مسح جديد", "New scan")}</button>
            </div>
          </div>
        )
      )}

      {res && !res.found && (
        <div className="overflow-hidden rounded-2xl border border-bad/30 bg-surface">
          <div className="bg-bad px-5 py-6 text-center text-white">
            <p className="font-display text-2xl font-bold">{t("مرفوض", "REJECTED")}</p>
            <p className="mt-1 text-sm">{t(...(MISS[res.reason] ?? MISS.not_found))}</p>
          </div>
          <div className="p-4">
            <p className="text-xs text-ink-soft">{t("سُجلت محاولة الاستعلام في سجل العمليات.", "This lookup was logged.")}</p>
            <button className={`${btn.primary} mt-3 w-full`} onClick={() => setRes(null)}>{t("تحقق جديد", "New check")}</button>
          </div>
        </div>
      )}

      {ok && st && (
        <div className="beam overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_24px_60px_-30px_rgba(61,42,36,.45)]" style={{ ["--beam" as string]: ok.status === "valid" ? "#5fd39a" : ok.status === "not_started" ? "#e9cfa6" : "#ff8a80" }}>
          <div className={`${st.cls} px-5 py-5 text-center text-white`}>
            <p className="font-display text-4xl font-bold tracking-wide">{t(st.ar, st.en)}</p>
            <p className="num mt-1 text-sm opacity-90">{ok.number} · v{ok.version} · {ok.codeType === "rotating" ? t("رمز متغير حي", "Live rotating code") : ok.codeType === "manual" ? t("رقم مُدخل يدويًا", "Typed permit number") : t("رمز مطبوع", "Printed code")}</p>
            {ok.statusReason && <p className="mt-1 text-sm">{ok.statusReason}</p>}
          </div>

          <div className="space-y-2 p-4">
            {ok.offline && <Banner tone="hold">{t(`تحقق دون اتصال من نسخة ${fmt(ok.snapshotAt!)} — أي إيقاف لاحق لن يظهر حتى عودة الاتصال.`, `Offline check from copy of ${fmt(ok.snapshotAt!)} — later suspensions won't show until reconnect.`)}</Banner>}
            {!ok.inScope && <Banner tone="bad">{t("هذه البوابة خارج نطاق مناطق التصريح", "This gate is outside the permit's zones")}</Banner>}
            {ok.printedVersion != null && ok.printedVersion < ok.version && (
              <Banner tone="wait">{t(`النسخة المطبوعة قديمة (إصدار ${ok.printedVersion}). المعتمد الحالي إصدار ${ok.version} — اعتمد البيانات أدناه.`, `Printed copy is outdated (v${ok.printedVersion}). Current is v${ok.version} — rely on the data below.`)}</Banner>
            )}
            {ok.pendingAmendment && <Banner tone="wait">{t(`يوجد طلب تعديل قيد المراجعة (${ok.pendingAmendment}). البيانات المعروضة هي المعتمدة حاليًا.`, `Amendment ${ok.pendingAmendment} under review. Data shown is currently approved.`)}</Banner>}
          </div>

          <dl className="grid grid-cols-2 gap-3 border-t border-line px-4 py-4 text-sm">
            <div className="col-span-2"><dt className="text-xs text-ink-soft">{t("الجهة", "Organization")}</dt><dd className="font-semibold">{ok.org}</dd></div>
            {ok.purpose && <div className="col-span-2"><dt className="text-xs text-ink-soft">{t("الغرض", "Purpose")}</dt><dd>{ok.purpose}</dd></div>}
            <div><dt className="text-xs text-ink-soft">{t("من", "From")}</dt><dd className="font-medium">{fmt(ok.validFrom)}</dd></div>
            <div><dt className="text-xs text-ink-soft">{t("إلى", "To")}</dt><dd className="font-medium">{fmt(ok.validTo)}</dd></div>
            <div className="col-span-2">
              <dt className="text-xs text-ink-soft">{t("المناطق", "Zones")}</dt>
              <dd className="mt-1 flex flex-wrap gap-1.5">
                {ok.zones.map((z) => (
                  <span key={z.id} className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${z.atGate ? "bg-ok-soft text-ok" : "bg-mist text-ink-soft"}`}>
                    {z.atGate ? "✓ " : ""}{t(z.name_ar, z.name_en)}
                  </span>
                ))}
              </dd>
            </div>
          </dl>

          <MatchList title={t("الأفراد — أشّر على الموجودين", "People — tick those present")} count={ok.people.length} done={matched.people.size}>
            {ok.people.map((p, i) => (
              <Check key={i} on={matched.people.has(i)} onClick={() => toggle("people", i)}>
                <span className="flex-1">{p.name}</span>
                {ok.insidePeople?.includes(i) && <span className="rounded-full bg-[#e3f0f6] px-2 py-0.5 text-[11px] font-semibold text-[#2b6f93]">{t("بالداخل الآن", "Inside now")}</span>}
                <span className="num text-xs text-ink-soft">{revealed[i] ?? p.id}</span>
                {!ok.offline && !revealed[i] && (
                  <button
                    type="button"
                    className="text-xs text-brand underline"
                    onClick={async (e) => {
                      e.stopPropagation();
                      const r = await post("reveal", { checkId: ok.checkId, index: i });
                      if (r.id) setRevealed((x) => ({ ...x, [i]: r.id }));
                    }}
                  >
                    {t("إظهار", "Show")}
                  </button>
                )}
              </Check>
            ))}
          </MatchList>
          {ok.vehicles.length > 0 && (
            <MatchList title={t("المركبات", "Vehicles")} count={ok.vehicles.length} done={matched.vehicles.size}>
              {ok.vehicles.map((v, i) => (
                <Check key={i} on={matched.vehicles.has(i)} onClick={() => toggle("vehicles", i)}>
                  <span className="flex-1"><SaudiPlate plate={v.plate} size="sm" /></span>
                  <span className="text-xs text-ink-soft">{v.type}</span>
                </Check>
              ))}
            </MatchList>
          )}
          {ok.equipment.length > 0 && (
            <MatchList title={t("المعدات", "Equipment")} count={ok.equipment.length} done={matched.equipment.size}>
              {ok.equipment.map((x, i) => (
                <Check key={i} on={matched.equipment.has(i)} onClick={() => toggle("equipment", i)}>
                  <span className="flex-1">{x.name}</span>
                  <span className="num text-xs text-ink-soft">×{x.qty}</span>
                </Check>
              ))}
            </MatchList>
          )}

          {otpMode !== "off" && !ok.offline && ok.canAllow && (
            <div className="border-t border-line p-4">
              <p className="text-sm font-semibold">
                {t("رمز الممثل المؤقت", "Representative's temporary code")}{" "}
                <span className="text-xs font-normal text-ink-soft">({otpMode === "required" ? t("إلزامي", "required") : t("اختياري", "optional")}){ok.codeType === "manual" && <span className="ms-1 text-xs font-normal text-hold">{t("· لأن الرقم كُتب يدويًا", "· because the number was typed")}</span>}</span>
              </p>
              <p className="mt-0.5 text-xs text-ink-soft">{t(`يُرسل إلى جوال ${ok.repName} المسجل في التصريح (${ok.repPhoneMasked}) — يثبت أن الحامل هو الممثل نفسه.`, `Sent to ${ok.repName}'s registered phone (${ok.repPhoneMasked}) — proves the holder is the representative.`)}</p>
              {otp.state === "verified" ? (
                <p className="mt-2 rounded-lg bg-ok-soft px-3 py-2 text-sm font-semibold text-ok">✓ {t("تم التحقق من الممثل", "Representative verified")}</p>
              ) : !otp.sent ? (
                <button
                  className={`${btn.secondary} mt-2 w-full`}
                  onClick={async () => {
                    const r = await post("otp-send", { checkId: ok.checkId });
                    setOtp((o) => ({ ...o, sent: !!r.ok || r.error === "cooldown", msg: r.ok ? undefined : r.error === "cooldown" ? t("أُرسل رمز قبل قليل — أدخله أو انتظر 30 ثانية لطلب رمز جديد", "A code was just sent — enter it or wait 30s for a new one") : t("تعذر الإرسال", "Could not send") }));
                  }}
                >
                  {t("إرسال رمز للممثل (صالح 5 دقائق)", "Send code to representative (5 min)")}
                </button>
              ) : (
                <form
                  className="mt-2 flex gap-2"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const r = await post("otp-check", { checkId: ok.checkId, code: otp.code });
                    setOtp((o) => ({ ...o, state: r.ok ? "verified" : "failed", msg: r.ok ? undefined : r.error === "too_many" ? t("تجاوز المحاولات", "Too many attempts") : r.error === "expired" ? t("انتهى الرمز", "Code expired") : t("رمز غير صحيح", "Wrong code") }));
                  }}
                >
                  <input className={`${input} text-center tracking-[0.4em]`} dir="ltr" inputMode="numeric" maxLength={6} value={otp.code} onChange={(e) => setOtp({ ...otp, code: e.target.value })} placeholder="••••••" aria-label={t("رمز الممثل", "Representative code")} />
                  <button className={btn.primary}>{t("تحقق", "Verify")}</button>
                </form>
              )}
              {otp.msg && <p className="mt-1.5 text-xs text-bad">{otp.msg}</p>}
            </div>
          )}

          <div className="space-y-3 border-t border-line bg-paper p-4">
            {flash ? (
              <>
                <p className={`rounded-xl px-4 py-3 text-center text-sm font-semibold ${flash.tone === "ok" ? "bg-ok-soft text-ok" : "bg-bad-soft text-bad"}`}>{flash.text}</p>
                <button className={`${btn.primary} w-full`} onClick={() => setRes(null)}>{t("تحقق جديد", "New check")}</button>
              </>
            ) : (
              <>
                <button className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-[#24915c] to-ok text-base font-bold text-white shadow-[0_10px_24px_-12px_rgba(31,122,77,.9)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:from-off-soft disabled:to-off-soft disabled:text-off disabled:shadow-none" disabled={allowDisabled} onClick={() => decide("allowed")}>
                  {t("السماح بالدخول", "Allow entry")} {ok.canAllow && <span className="num text-sm opacity-80">({matched.people.size}/{ok.people.length})</span>}
                </button>
                {!ok.canAllow && <p className="text-center text-xs text-bad">{t("النظام يمنع السماح: التصريح غير سارٍ أو خارج نطاق هذه البوابة.", "Blocked: permit not valid or outside this gate's scope.")}</p>}
                <div className="flex gap-2">
                  <input className={input} value={deny} onChange={(e) => setDeny(e.target.value)} placeholder={t("سبب منع الدخول", "Denial reason")} aria-label={t("سبب منع الدخول", "Denial reason")} />
                  <button className={btn.danger} disabled={!deny.trim()} onClick={() => decide("denied")}>{t("منع", "Deny")}</button>
                </div>
                <button className={`${btn.ghost} w-full justify-center`} onClick={() => setRes(null)}>{t("إلغاء والعودة", "Cancel")}</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Banner({ tone, children }: { tone: "bad" | "wait" | "hold"; children: React.ReactNode }) {
  const cls = { bad: "bg-bad-soft text-bad", wait: "bg-wait-soft text-wait", hold: "bg-hold-soft text-hold" }[tone];
  return <p className={`rounded-xl px-3 py-2 text-sm font-medium ${cls}`}>{children}</p>;
}

function MatchList({ title, count, done, children }: { title: string; count: number; done: number; children: React.ReactNode }) {
  return (
    <div className="border-t border-line p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold">{title}</p>
        <span className="num text-xs text-ink-soft">{done}/{count}</span>
      </div>
      <ul className="max-h-72 space-y-1 overflow-y-auto">{children}</ul>
    </div>
  );
}

function Check({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <li>
      <div role="checkbox" aria-checked={on} tabIndex={0} onClick={onClick} onKeyDown={(e) => (e.key === " " || e.key === "Enter") && (e.preventDefault(), onClick())}
        className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition ${on ? "border-ok bg-ok-soft" : "border-line hover:border-rose"}`}>
        <span className={`grid h-5 w-5 shrink-0 place-items-center rounded border text-xs ${on ? "border-ok bg-ok text-white" : "border-line"}`}>{on ? "✓" : ""}</span>
        {children}
      </div>
    </li>
  );
}
