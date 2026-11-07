"use client";
import Link from "next/link";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { submitAction, type SubmitState } from "./actions";
import CapacityPicker from "./CapacityPicker";
import RosterImport from "./RosterImport";
import { useOverlay } from "@/components/useOverlay";
import { Icon } from "@/components/icons";
import { btn, input, label } from "@/components/ui";
import { LIMITS, normPlate, validateRequest, type Equipment, type Person, type RequestInput, type Vehicle } from "@/lib/validate";
import { EquipmentInput, PlateInput } from "@/components/AssetInputs";
import { saveTeamFromRequestAction } from "../profile/actions";
import type { Team } from "@/lib/org";

type ZoneOpt = { id: number; name_ar: string; name_en: string; sensitive: boolean; capacity_per_hour: number };
export type SavedTeam = { people: Person[]; vehicles: Vehicle[]; equipment: Equipment[]; teams?: Team[] };

export type FormInit = Partial<RequestInput> & { mode: "new" | "resubmit" | "amend"; id?: number; permitId?: number; reason?: string | null; title?: string };

/* Asia/Riyadh is UTC+3 with no DST, so local <-> ISO is a fixed offset */
const toLocal = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(+d)) return "";
  return new Date(d.getTime() + 3 * 3600_000).toISOString().slice(0, 16);
};
const fromLocal = (v: string) => (v ? new Date(`${v}:00+03:00`).toISOString() : "");
const addHours = (local: string, h: number) => toLocal(new Date(new Date(fromLocal(local)).getTime() + h * 3600_000).toISOString());
/** Tomorrow 07:00 Riyadh — the most common start for field work */
const tomorrow7 = () => toLocal(new Date(Date.now() + 86400_000).toISOString()).slice(0, 10) + "T07:00";

const MAX_FILE = 5 * 1024 * 1024;
const OK_TYPES = ["application/pdf", "image/jpeg", "image/png"];
const ID_RE = /^[12]\d{9}$/;


function Sec({ n, title, children, hint, done }: { n: number; title: string; children: React.ReactNode; hint?: React.ReactNode; done?: boolean }) {
  return (
    <section id={`s${n}`} className="scroll-mt-28 rounded-2xl border border-line bg-surface">
      <header className="flex items-center gap-3 border-b border-line px-4 py-3 sm:px-5">
        <span
          className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-bold transition ${done ? "bg-ok text-white" : "bg-chip text-brand"}`}
          aria-label={done ? `${n} ✓` : String(n)}
        >
          {done ? "✓" : n}
        </span>
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {hint && <span className="ms-auto text-xs text-ink-soft">{hint}</span>}
      </header>
      <div className="space-y-4 p-4 sm:p-5">{children}</div>
    </section>
  );
}

const fmtSize = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export default function RequestForm({ init, zones, lang, saved, teamId }: { init: FormInit; zones: ZoneOpt[]; lang: "ar" | "en"; saved?: SavedTeam; teamId?: string }) {
  const t = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const [state, action, pending] = useActionState<SubmitState, FormData>(submitAction, { errors: [] });
  const formRef = useRef<HTMLFormElement>(null);
  const confirmed = useRef(false);

  const [f, setF] = useState({
    org_name: init.org_name ?? "",
    cr_number: init.cr_number ?? "",
    rep_name: init.rep_name ?? "",
    rep_phone: init.rep_phone ?? "",
    rep_id: init.rep_id ?? "",
    purpose: init.purpose ?? "",
    from: toLocal(init.valid_from),
    to: toLocal(init.valid_to),
  });
  const [zoneIds, setZoneIds] = useState<number[]>(init.zones ?? []);
  const [people, setPeople] = useState<Person[]>(init.people?.length ? init.people : [{ name: "", id_number: "" }]);
  const [vehicles, setVehicles] = useState<Vehicle[]>(init.vehicles ?? []);
  const [equipment, setEquipment] = useState<Equipment[]>(init.equipment ?? []);
  const [slot, setSlot] = useState<{ date: string | null; hour: number | null }>({ date: init.slot_date ?? null, hour: init.slot_hour ?? null });
  const [declaration, setDeclaration] = useState(false);
  const [files, setFiles] = useState<{ key: number; label: string; name?: string; size?: number; err?: string }[]>([{ key: 1, label: "" }]);
  const [paste, setPaste] = useState<null | "people" | "vehicles">(null);
  const [touched, setTouched] = useState(false);
  const [review, setReview] = useState(false);
  useOverlay(review, () => setReview(false));

  /* ───── Draft: kept in this tab only (sessionStorage) so ID numbers never persist on a shared device ───── */
  const draftKey = `vp_draft:${init.mode}:${init.id ?? init.permitId ?? "new"}`;
  const [draft, setDraft] = useState<null | { at: number; data: Record<string, unknown> }>(null);
  const [draftReady, setDraftReady] = useState(false);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(draftKey);
      if (raw) setDraft(JSON.parse(raw));
    } catch {}
    setDraftReady(true);
  }, [draftKey]);
  const snapshot = { f, zoneIds, people, vehicles, equipment, slot };
  const snapKey = JSON.stringify(snapshot);
  const initKey = useRef(snapKey);
  useEffect(() => {
    if (!draftReady || draft || snapKey === initKey.current) return;
    const h = setTimeout(() => {
      try { sessionStorage.setItem(draftKey, JSON.stringify({ at: Date.now(), data: snapshot })); } catch {}
    }, 600);
    return () => clearTimeout(h);
  }, [snapKey, draftReady, draft]); // eslint-disable-line react-hooks/exhaustive-deps
  function restoreDraft() {
    const d = draft?.data as typeof snapshot | undefined;
    if (d) {
      setF(d.f); setZoneIds(d.zoneIds); setPeople(d.people); setVehicles(d.vehicles); setEquipment(d.equipment); setSlot(d.slot);
    }
    setDraft(null);
  }
  function discardDraft() {
    try { sessionStorage.removeItem(draftKey); } catch {}
    setDraft(null);
  }

  const payload: RequestInput = {
    org_name: f.org_name, cr_number: f.cr_number || undefined, rep_name: f.rep_name, rep_phone: f.rep_phone, rep_id: f.rep_id, purpose: f.purpose,
    valid_from: fromLocal(f.from), valid_to: fromLocal(f.to), zones: zoneIds,
    slot_date: vehicles.length ? slot.date : null, slot_hour: vehicles.length ? slot.hour : null,
    people, vehicles, equipment, declaration,
  };
  const liveErrors = useMemo(() => validateRequest(payload), [JSON.stringify(payload)]); // eslint-disable-line react-hooks/exhaustive-deps
  const errors = touched ? liveErrors : state.errors;
  const errOf = (field: string) => errors.find((e) => e.field === field || e.field.startsWith(field + "."));
  const fieldMsg = (field: string) => {
    const e = errOf(field);
    return e ? <p className="mt-1 text-xs text-bad" role="alert">{t(e.ar, e.en)}</p> : null;
  };
  const fromDate = (f.from || new Date(Date.now() + 3 * 3600_000).toISOString()).slice(0, 10);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  /* ───── Sections & progress (computed from the same rules the server applies) ───── */
  const sections = [
    t("الجهة", "Organization"), t("الممثل", "Representative"), t("الغرض والفترة والمناطق", "Purpose, period & zones"),
    t("الأفراد", "People"), t("المركبات وموعد الدخول", "Vehicles & entry slot"), t("المعدات", "Equipment"), t("المرفقات", "Attachments"), t("الإقرار", "Declaration"),
  ];
  const secKeys = [["org_name", "cr_number"], ["rep_"], ["purpose", "valid_", "zones"], ["people"], ["vehicles", "slot"], ["equipment"], ["__files"], ["declaration"]];
  const fileBad = files.some((x) => x.err);
  const secBad = secKeys.map((keys) => liveErrors.some((e) => keys.some((k) => e.field.startsWith(k))) || (keys[0] === "__files" && fileBad));
  const secDone = secBad.map((b, i) => !b && (i !== 0 || !!f.org_name.trim()));
  const doneCount = secDone.filter(Boolean).length;
  const nextIdx = secDone.findIndex((d) => !d);
  const go = (field: string) => {
    const el = document.querySelector<HTMLElement>(`[data-field="${field}"]`) ?? document.getElementById(field);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => el?.querySelector<HTMLElement>("input,textarea,select,button")?.focus({ preventScroll: true }), 350);
  };

  /* ───── Saved team from the organization profile (requirement: profile keeps people, vehicles & equipment) ───── */
  const haveIds = new Set(people.map((p) => p.id_number));
  const havePlates = new Set(vehicles.map((v) => normPlate(v.plate)));
  const savedPeople = (saved?.people ?? []).filter((p) => p.id_number && !haveIds.has(p.id_number));
  const savedVehicles = (saved?.vehicles ?? []).filter((v) => v.plate && !havePlates.has(normPlate(v.plate)));
  const savedEquipment = (saved?.equipment ?? []).filter((x) => x.name && !equipment.some((y) => y.name.trim() === x.name.trim()));
  const addPeople = (add: Person[]) => setPeople([...people.filter((p) => p.name || p.id_number), ...add].slice(0, LIMITS.people));
  const addVehicles = (add: Vehicle[]) => setVehicles([...vehicles, ...add].slice(0, LIMITS.vehicles));

  /* ───── Work teams (from the org profile): one tap fills people, vehicles & equipment ───── */
  const [teams, setTeams] = useState<Team[]>(saved?.teams ?? []);
  const [activeTeam, setActiveTeam] = useState<string | null>(teamId ?? null);
  const [undo, setUndo] = useState<null | { people: Person[]; vehicles: Vehicle[]; equipment: Equipment[] }>(null);
  const [teamSave, setTeamSave] = useState<{ open: boolean; name: string; msg?: string; ok?: boolean }>({ open: false, name: "" });
  function teamMembers(tm: Team) {
    const P = (saved?.people ?? []).filter((p) => tm.people.includes(p.id_number));
    const V = (saved?.vehicles ?? []).filter((v) => tm.vehicles.includes(normPlate(v.plate)));
    const E = (saved?.equipment ?? []).filter((x) => tm.equipment.includes(x.name.trim()));
    return { people: P, vehicles: V, equipment: E };
  }
  function applyTeam(tm: Team) {
    const m = teamMembers(tm);
    setUndo({ people, vehicles, equipment });
    setPeople(m.people.length ? m.people.slice(0, LIMITS.people) : [{ name: "", id_number: "" }]);
    setVehicles(m.vehicles.slice(0, LIMITS.vehicles));
    setEquipment(m.equipment.slice(0, LIMITS.equipment));
    setActiveTeam(tm.id);
  }
  const teamApplied = useRef(false);
  useEffect(() => {
    // ?team=<id> from the profile page pre-applies that team once
    if (teamApplied.current || !teamId) return;
    const tm = teams.find((x) => x.id === teamId);
    if (tm) { teamApplied.current = true; applyTeam(tm); setUndo(null); }
  }, [teamId]); // eslint-disable-line react-hooks/exhaustive-deps
  async function saveAsTeam() {
    const name = teamSave.name.trim();
    if (!name) return;
    const r = await saveTeamFromRequestAction({ name, people: people.filter((p) => p.name || p.id_number), vehicles, equipment, org: { name: f.org_name, cr_number: f.cr_number, rep_name: f.rep_name, rep_phone: f.rep_phone, rep_id: f.rep_id } });
    if (r.ok) {
      setTeams((ts) => [...ts.filter((x) => x.id !== r.team.id), r.team]);
      setActiveTeam(r.team.id);
      setTeamSave({ open: false, name: "", ok: true, msg: t(`حُفظ الفريق «${r.team.name}» في ملف الجهة`, `Team “${r.team.name}” saved to your profile`) });
    } else setTeamSave({ ...teamSave, ok: false, msg: r.error });
  }

  /* ───── Period presets ───── */
  const durations: [string, string, number][] = [
    ["يوم", "1 day", 24], ["3 أيام", "3 days", 72], ["أسبوع", "1 week", 168], ["شهر", "1 month", 720],
  ];
  function setDuration(hours: number) {
    const from = f.from || tomorrow7();
    setF({ ...f, from, to: addHours(from, hours) });
  }
  const spanHours = f.from && f.to ? Math.round((+new Date(fromLocal(f.to)) - +new Date(fromLocal(f.from))) / 3600_000) : null;


  const zoneName = (id: number) => { const z = zones.find((x) => x.id === id); return z ? t(z.name_ar, z.name_en) : String(id); };
  const filledPeople = people.filter((p) => p.name || p.id_number).length;
  const chosenFiles = files.filter((x) => x.name && !x.err);

  return (
    <form
      ref={formRef}
      action={action}
      onSubmit={(e) => {
        setTouched(true);
        if (liveErrors.length || fileBad) {
          e.preventDefault();
          const first = liveErrors[0]?.field.split(".")[0];
          if (first) go(first);
          return;
        }
        if (!confirmed.current) {
          e.preventDefault();
          setReview(true);
          return;
        }
        confirmed.current = false;
        try { sessionStorage.removeItem(draftKey); } catch {}
      }}
      className="grid gap-5 lg:grid-cols-[1fr_16rem]"
    >
      <input type="hidden" name="payload" value={JSON.stringify(payload)} />
      <input type="hidden" name="mode" value={init.mode} />
      {init.id && <input type="hidden" name="id" value={init.id} />}
      {init.permitId && <input type="hidden" name="permitId" value={init.permitId} />}

      <div className="min-w-0 space-y-5">
        {/* Mobile progress — the desktop version lives in the side panel */}
        <div className="sticky top-0 z-20 -mx-4 border-b border-line bg-paper/95 px-4 py-2.5 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="font-semibold text-ink">
              {t("اكتمل", "Done")} <span className="num">{doneCount}</span> {t("من", "of")} <span className="num">8</span>
            </span>
            {nextIdx >= 0 ? (
              <a href={`#s${nextIdx + 1}`} className="truncate font-semibold text-brand">{t("التالي:", "Next:")} {sections[nextIdx]} ←</a>
            ) : (
              <span className="font-semibold text-ok">{t("جاهز للتقديم", "Ready to submit")} ✓</span>
            )}
          </div>
          <div className="mt-2 grid grid-cols-8 gap-1" aria-hidden>
            {secDone.map((d, i) => (
              <a key={i} href={`#s${i + 1}`} tabIndex={-1} title={sections[i]} className={`h-1.5 rounded-full transition-colors ${d ? "bg-ok" : touched && secBad[i] ? "bg-bad" : "bg-line"}`} />
            ))}
          </div>
        </div>

        {draft && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gold/40 bg-chip/60 px-4 py-3 text-sm" role="status">
            <span className="flex-1 text-ink">
              {t("لديك مسودة غير مرسلة من هذه الجلسة", "You have an unsent draft from this session")}{" "}
              <span className="text-ink-soft num">({new Date(draft.at).toLocaleTimeString(lang === "ar" ? "ar-SA" : "en-GB", { hour: "2-digit", minute: "2-digit" })})</span>
            </span>
            <button type="button" className={`${btn.primary} min-h-9 px-3 py-1.5`} onClick={restoreDraft}>{t("استعادة المسودة", "Restore draft")}</button>
            <button type="button" className={btn.ghost} onClick={discardDraft}>{t("تجاهل", "Discard")}</button>
          </div>
        )}

        {init.reason && (
          <div className="rounded-xl border border-hold/30 bg-hold-soft px-4 py-3 text-sm text-hold">
            <strong>{t("مطلوب للاستكمال: ", "Requested changes: ")}</strong>
            {init.reason}
            <p className="mt-1 text-xs text-hold/80">{t("بياناتك السابقة معبأة. عدّل المطلوب فقط ثم أعد التقديم، ويعود الطلب إلى المراجعة الأولية.", "Your previous data is filled in. Change only what's requested; the request returns to initial review.")}</p>
          </div>
        )}
        {init.mode === "amend" && (
          <div className="rounded-xl bg-chip px-4 py-3 text-sm text-brand">
            {t(
              "طلب التعديل يحصل على رقم مرجعي جديد ويمر بالمرحلتين. يبقى التصريح الحالي ساريًا ببياناته المعتمدة حتى اعتماد التعديل.",
              "An amendment gets a new reference and goes through both stages. The current permit stays valid with its approved data until then.",
            )}
          </div>
        )}

        <Sec n={1} title={sections[0]} done={secDone[0]} hint={init.org_name && init.mode === "new" ? t("معبأ من ملف جهتك", "From your profile") : undefined}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div data-field="org_name">
              <label className={label} htmlFor="org">{t("اسم الجهة أو الشركة", "Organization name")} *</label>
              <input id="org" className={input} autoComplete="organization" value={f.org_name} onChange={set("org_name")} aria-invalid={!!errOf("org_name")} />
              {fieldMsg("org_name")}
            </div>
            <div data-field="cr_number">
              <label className={label} htmlFor="cr">{t("رقم السجل التجاري (اختياري)", "CR number (optional)")}</label>
              <input id="cr" className={input} dir="ltr" inputMode="numeric" maxLength={10} value={f.cr_number} onChange={(e) => setF({ ...f, cr_number: e.target.value.replace(/\D/g, "") })} aria-invalid={!!errOf("cr_number")} />
              {fieldMsg("cr_number")}
            </div>
          </div>
        </Sec>

        <Sec n={2} title={sections[1]} done={secDone[1]} hint={t("يُرسل له رمز التحقق عند البوابة", "Receives the gate code")}>
          <div className="grid gap-4 sm:grid-cols-3">
            <div data-field="rep_name">
              <label className={label} htmlFor="rn">{t("الاسم الكامل", "Full name")} *</label>
              <input id="rn" className={input} autoComplete="name" value={f.rep_name} onChange={set("rep_name")} aria-invalid={!!errOf("rep_name")} />
              {fieldMsg("rep_name")}
            </div>
            <div data-field="rep_phone">
              <label className={label} htmlFor="rp">{t("رقم الجوال", "Mobile")} *</label>
              <input id="rp" className={input} dir="ltr" inputMode="tel" autoComplete="tel-national" placeholder="05XXXXXXXX" maxLength={10} value={f.rep_phone} onChange={(e) => setF({ ...f, rep_phone: e.target.value.replace(/\D/g, "") })} aria-invalid={!!errOf("rep_phone")} />
              {fieldMsg("rep_phone")}
            </div>
            <div data-field="rep_id">
              <label className={label} htmlFor="ri">{t("رقم الهوية / الإقامة", "National ID / Iqama")} *</label>
              <input id="ri" className={input} dir="ltr" inputMode="numeric" maxLength={10} value={f.rep_id} onChange={(e) => setF({ ...f, rep_id: e.target.value.replace(/\D/g, "") })} aria-invalid={!!errOf("rep_id")} />
              {fieldMsg("rep_id")}
            </div>
          </div>
          {f.rep_name && f.rep_id && ID_RE.test(f.rep_id) && !people.some((p) => p.id_number === f.rep_id) && people.length < LIMITS.people && (
            <button type="button" className={btn.ghost} onClick={() => addPeople([{ name: f.rep_name, id_number: f.rep_id }])}>
              + {t("أضف الممثل إلى قائمة الأفراد", "Add the representative to the people list")}
            </button>
          )}
        </Sec>

        <Sec n={3} title={sections[2]} done={secDone[2]}>
          <div data-field="purpose">
            <label className={label} htmlFor="pu">{t("الغرض من الدخول", "Purpose of entry")} *</label>
            <textarea id="pu" rows={3} className={input} value={f.purpose} onChange={set("purpose")} aria-invalid={!!errOf("purpose")} aria-describedby="pu-h"
              placeholder={t("مثال: صيانة شبكة الإنارة في الساحة الرئيسية", "e.g. Maintenance of the lighting network in the main square")} />
            <p id="pu-h" className="mt-1 text-xs text-ink-soft">{t("اذكر العمل والمكان بوضوح — يختصر وقت المراجعة.", "State the work and place clearly — it shortens review.")}</p>
            {fieldMsg("purpose")}
          </div>
          <div>
            <p className={label}>{t("مدة التصريح", "Permit duration")} *</p>
            <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label={t("اختيار سريع للمدة", "Quick duration")}>
              {durations.map(([ar, en, h]) => (
                <button key={h} type="button" onClick={() => setDuration(h)} aria-pressed={spanHours === h}
                  className={`min-h-10 rounded-full border px-4 text-sm font-semibold transition ${spanHours === h ? "border-brand bg-brand text-white" : "border-line bg-surface text-ink hover:border-gold"}`}>
                  {t(ar, en)}
                </button>
              ))}
              <span className="self-center text-xs text-ink-soft">{t("أو حدّد التاريخين يدويًا · الحد الأقصى 90 يومًا", "or set both dates · max 90 days")}</span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div data-field="valid_from">
                <label className={label} htmlFor="vf">{t("بداية الصلاحية", "Valid from")}</label>
                <input id="vf" type="datetime-local" className={input} value={f.from}
                  onChange={(e) => {
                    const from = e.target.value;
                    // keep the chosen duration when the start moves
                    setF({ ...f, from, to: f.to && spanHours && spanHours > 0 && from ? addHours(from, spanHours) : f.to });
                  }}
                  aria-invalid={!!errOf("valid_from")} />
                {fieldMsg("valid_from")}
              </div>
              <div data-field="valid_to">
                <label className={label} htmlFor="vt">{t("نهاية الصلاحية", "Valid to")}</label>
                <input id="vt" type="datetime-local" className={input} value={f.to} min={f.from} onChange={set("to")} aria-invalid={!!errOf("valid_to")} />
                {fieldMsg("valid_to")}
              </div>
            </div>
          </div>
          <fieldset data-field="zones">
            <legend className={label}>{t("المناطق المطلوبة", "Requested zones")} *</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {zones.map((z) => {
                const on = zoneIds.includes(z.id);
                return (
                  <label key={z.id} className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition ${on ? "border-brand bg-chip/50" : "border-line hover:border-rose"}`}>
                    <input type="checkbox" className="h-4 w-4 accent-brand" checked={on} onChange={() => setZoneIds(on ? zoneIds.filter((x) => x !== z.id) : [...zoneIds, z.id])} />
                    <span className="flex-1 text-sm font-medium">{t(z.name_ar, z.name_en)}</span>
                    {z.sensitive && <span className="rounded-full bg-hold-soft px-2 py-0.5 text-[11px] font-semibold text-hold">{t("حساسة · مراجعة أدق", "Sensitive · closer review")}</span>}
                  </label>
                );
              })}
            </div>
            {fieldMsg("zones")}
          </fieldset>
        </Sec>

        <Sec n={4} title={sections[3]} done={secDone[3]} hint={<span className="num">{filledPeople}/{LIMITS.people}</span>}>
          <div data-field="people" className="space-y-2">
            {teams.length > 0 && (
              <div className="rounded-2xl border border-gold/40 bg-gradient-to-b from-chip/70 to-surface p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-bold text-ink">{t("اختر فريق عمل من ملف الجهة", "Pick a work team from your profile")}</p>
                  <Link href="/apply/profile" className="text-xs font-semibold text-brand">{t("إدارة الفرق", "Manage teams")}</Link>
                </div>
                <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label={t("فرق العمل", "Work teams")}>
                  {teams.map((tm) => {
                    const on = activeTeam === tm.id;
                    return (
                      <button key={tm.id} type="button" role="radio" aria-checked={on} onClick={() => applyTeam(tm)}
                        className={`min-h-11 rounded-xl border px-3.5 text-start transition ${on ? "border-brand bg-brand text-white shadow-[0_8px_20px_-12px_rgba(118,59,48,.9)]" : "border-line bg-surface text-ink hover:border-gold"}`}>
                        <span className="block text-sm font-bold">{on ? "✓ " : ""}{tm.name}</span>
                        <span className={`block text-[11px] tabular-nums ${on ? "text-white/80" : "text-ink-soft"}`}>{tm.people.length} {t("فرد", "ppl")} · {tm.vehicles.length} {t("مركبة", "veh")} · {tm.equipment.length} {t("معدة", "equip")}</span>
                      </button>
                    );
                  })}
                </div>
                {activeTeam && (
                  <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-soft">
                    {t("طُبّق الفريق على الأفراد والمركبات والمعدات — عدّل أو احذف أو أضف من تشاء لهذا الطلب فقط.", "Team applied to people, vehicles and equipment — edit, remove or add anyone for this request only.")}
                    {undo && <button type="button" className="font-semibold text-brand" onClick={() => { setPeople(undo.people); setVehicles(undo.vehicles); setEquipment(undo.equipment); setUndo(null); setActiveTeam(null); }}>{t("تراجع", "Undo")}</button>}
                  </p>
                )}
              </div>
            )}
            {savedPeople.length > 0 && people.length < LIMITS.people && (
              <div className="rounded-xl border border-gold/40 bg-chip/40 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-ink">{t("من فريقك المحفوظ", "From your saved team")} <span className="num text-ink-soft">({savedPeople.length})</span></p>
                  <button type="button" className={`${btn.secondary} min-h-9 px-3 py-1.5`} onClick={() => addPeople(savedPeople)}>{t("إضافة الكل", "Add all")}</button>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {savedPeople.slice(0, 24).map((p) => (
                    <button key={p.id_number} type="button" onClick={() => addPeople([p])}
                      className="min-h-9 rounded-full border border-line bg-surface px-3 text-xs font-medium text-ink transition hover:border-brand hover:text-brand">
                      + {p.name} <span className="num text-ink-soft">••{p.id_number.slice(-4)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {people.map((p, i) => (
              <div key={i} className="grid grid-cols-[1fr_auto] items-start gap-2 sm:grid-cols-[2rem_1fr_11rem_auto]">
                <span className="hidden pt-3 text-center text-xs text-ink-soft sm:block num">{i + 1}</span>
                <div className="col-span-2 grid gap-2 sm:col-span-2 sm:grid-cols-[1fr_11rem]">
                  <input aria-label={t(`اسم الفرد ${i + 1}`, `Person ${i + 1} name`)} placeholder={t("الاسم الكامل", "Full name")} className={input} value={p.name} aria-invalid={!!errOf(`people.${i}.name`)}
                    onChange={(e) => setPeople(people.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                  <div className="flex gap-2">
                    <input aria-label={t(`هوية الفرد ${i + 1}`, `Person ${i + 1} ID`)} placeholder={t("رقم الهوية", "ID number")} dir="ltr" inputMode="numeric" maxLength={10} className={input} value={p.id_number} aria-invalid={!!errOf(`people.${i}.id_number`)}
                      onChange={(e) => setPeople(people.map((x, j) => (j === i ? { ...x, id_number: e.target.value.replace(/\D/g, "") } : x)))}
                      onKeyDown={(e) => {
                        // Enter on the last ID adds a new row — fast keyboard entry for long lists
                        if (e.key === "Enter" && i === people.length - 1 && people.length < LIMITS.people) {
                          e.preventDefault();
                          setPeople([...people, { name: "", id_number: "" }]);
                          setTimeout(() => document.querySelector<HTMLInputElement>(`[aria-label="${t(`اسم الفرد ${i + 2}`, `Person ${i + 2} name`)}"]`)?.focus(), 30);
                        }
                      }} />
                    <button type="button" className="grid min-h-11 min-w-11 shrink-0 place-items-center rounded-lg text-ink-soft hover:bg-bad-soft hover:text-bad" aria-label={t(`حذف الفرد ${i + 1}`, `Remove person ${i + 1}`)} onClick={() => setPeople(people.filter((_, j) => j !== i))}>✕</button>
                  </div>
                </div>
              </div>
            ))}
            {errors.filter((e) => e.field.startsWith("people")).slice(0, 3).map((e, i) => (
              <p key={i} className="text-xs text-bad">{t(e.ar, e.en)}</p>
            ))}
            <div className="flex flex-wrap gap-2 pt-1">
              <button type="button" className={btn.secondary} disabled={people.length >= LIMITS.people} onClick={() => setPeople([...people, { name: "", id_number: "" }])}>+ {t("إضافة فرد", "Add person")}</button>
              <button type="button" className={btn.ghost} onClick={() => setPaste("people")}><Icon name="sheet" size={16} /> {t("استيراد من Excel", "Import from Excel")}</button>
              {filledPeople > 0 && <button type="button" className={btn.ghost} onClick={() => setTeamSave({ open: !teamSave.open, name: teams.find((x) => x.id === activeTeam)?.name ?? "" })}>{t("حفظ القائمة كفريق", "Save list as a team")}</button>}
            </div>
            {teamSave.open && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-panel p-3">
                <input aria-label={t("اسم الفريق", "Team name")} autoFocus className={`${input} max-w-xs`} placeholder={t("اسم الفريق", "Team name")} value={teamSave.name} onChange={(e) => setTeamSave({ ...teamSave, name: e.target.value.slice(0, 60) })}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); saveAsTeam(); } }} />
                <button type="button" className={`${btn.primary} min-h-10`} disabled={!teamSave.name.trim()} onClick={saveAsTeam}>{t("حفظ في ملف الجهة", "Save to profile")}</button>
                <span className="text-xs text-ink-soft">{t("يحفظ الأفراد والمركبات والمعدات الحالية؛ الاسم نفسه يحدّث الفريق الموجود.", "Saves the current people, vehicles and equipment; the same name updates the existing team.")}</span>
              </div>
            )}
            {teamSave.msg && <p role="status" className={`text-xs font-semibold ${teamSave.ok ? "text-ok" : "text-bad"}`}>{teamSave.ok ? "✓ " : ""}{teamSave.msg}</p>}
          </div>
        </Sec>

        <Sec n={5} title={sections[4]} done={secDone[4]} hint={<span className="num">{vehicles.length}/{LIMITS.vehicles}</span>}>
          <div data-field="vehicles" className="space-y-2">
            {vehicles.length === 0 && <p className="text-sm text-ink-soft">{t("لا توجد مركبات؟ تجاوز هذا القسم.", "No vehicles? Skip this section.")}</p>}
            {savedVehicles.length > 0 && vehicles.length < LIMITS.vehicles && (
              <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-gold/40 bg-chip/40 p-3">
                <span className="me-1 text-sm font-semibold text-ink">{t("مركباتك المحفوظة:", "Saved vehicles:")}</span>
                {savedVehicles.slice(0, 16).map((v) => (
                  <button key={v.plate} type="button" onClick={() => addVehicles([v])} className="min-h-9 rounded-full border border-line bg-surface px-3 text-xs font-medium hover:border-brand hover:text-brand">
                    + <span className="num">{v.plate}</span> {v.type && <span className="text-ink-soft">· {v.type}</span>}
                  </button>
                ))}
                {savedVehicles.length > 1 && <button type="button" className={btn.ghost} onClick={() => addVehicles(savedVehicles)}>{t("إضافة الكل", "Add all")}</button>}
              </div>
            )}
            {vehicles.map((v, i) => (
              <PlateInput key={`${i}-${vehicles.length}-${activeTeam ?? ""}`} value={v} index={i} t={t} lang={lang} invalid={!!errOf(`vehicles.${i}`)}
                onChange={(nv) => setVehicles(vehicles.map((x, j) => (j === i ? nv : x)))} onRemove={() => setVehicles(vehicles.filter((_, j) => j !== i))} />
            ))}
            {errors.filter((e) => e.field.startsWith("vehicles")).slice(0, 3).map((e, i) => (
              <p key={i} className="text-xs text-bad">{t(e.ar, e.en)}</p>
            ))}
            <div className="flex flex-wrap gap-2 pt-1">
              <button type="button" className={btn.secondary} disabled={vehicles.length >= LIMITS.vehicles} onClick={() => setVehicles([...vehicles, { plate: "", type: "", kind: "sa" }])}>+ {t("إضافة مركبة", "Add vehicle")}</button>
              <button type="button" className={btn.ghost} disabled={vehicles.length >= LIMITS.vehicles} onClick={() => setPaste("vehicles")}><Icon name="sheet" size={16} /> {t("استيراد من Excel", "Import from Excel")}</button>
            </div>
          </div>
          {vehicles.length > 0 && (
            <div data-field="slot" className="rounded-xl border border-line bg-panel p-3 sm:p-4">
              <h3 className="mb-1 font-sans text-sm font-semibold text-ink">{t("احجز موعد دخول المركبات", "Book the vehicles' entry slot")}</h3>
              <p className="mb-3 text-xs text-ink-soft">
                {zoneIds.length
                  ? t("لكل منطقة سعة محددة في الساعة لمنع الازدحام عند المداخل. الخانات الخضراء متاحة لعدد مركباتك.", "Each zone has an hourly capacity. Green slots fit your vehicles.")
                  : t("اختر المناطق في القسم 3 أولًا ليظهر جدول السعة.", "Pick zones in section 3 first to see the capacity grid.")}
              </p>
              <CapacityPicker zones={zoneIds} fromDate={fromDate} need={vehicles.length} value={slot} onChange={setSlot} excludeId={init.mode === "resubmit" ? init.id : undefined} t={t} lang={lang} />
              {fieldMsg("slot")}
            </div>
          )}
        </Sec>

        <Sec n={6} title={sections[5]} done={secDone[5]} hint={<span className="num">{equipment.length}/{LIMITS.equipment}</span>}>
          <div data-field="equipment" className="space-y-2">
            {equipment.length === 0 && <p className="text-sm text-ink-soft">{t("لا توجد معدات؟ تجاوز هذا القسم.", "No equipment? Skip this section.")}</p>}
            {savedEquipment.length > 0 && equipment.length < LIMITS.equipment && (
              <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-gold/40 bg-chip/40 p-3">
                <span className="me-1 text-sm font-semibold text-ink">{t("معداتك المحفوظة:", "Saved equipment:")}</span>
                {savedEquipment.slice(0, 16).map((x) => (
                  <button key={x.name} type="button" onClick={() => setEquipment([...equipment, x].slice(0, LIMITS.equipment))} className="min-h-9 rounded-full border border-line bg-surface px-3 text-xs font-medium hover:border-brand hover:text-brand">
                    + {x.name} <span className="num text-ink-soft">×{x.qty}</span>
                  </button>
                ))}
              </div>
            )}
            {equipment.map((x, i) => (
              <EquipmentInput key={i} value={x} index={i} t={t} invalid={!!errOf(`equipment.${i}`)}
                onChange={(nx) => setEquipment(equipment.map((y, j) => (j === i ? nx : y)))} onRemove={() => setEquipment(equipment.filter((_, j) => j !== i))} />
            ))}
            {errors.filter((e) => e.field.startsWith("equipment")).slice(0, 3).map((e, i) => (
              <p key={i} className="text-xs text-bad">{t(e.ar, e.en)}</p>
            ))}
            <button type="button" className={btn.secondary} disabled={equipment.length >= LIMITS.equipment} onClick={() => setEquipment([...equipment, { name: "", qty: 1 }])}>+ {t("إضافة معدة", "Add equipment")}</button>
          </div>
        </Sec>

        <Sec n={7} title={sections[6]} done={secDone[6]} hint={t("اختياري · PDF أو JPG أو PNG حتى 5MB", "Optional · PDF, JPG or PNG up to 5MB")}>
          <p className="text-xs text-ink-soft">{t("مثل خطاب التكليف أو العقد. إرفاقها من البداية يقلل احتمال إعادة الطلب للاستكمال.", "e.g. assignment letter or contract. Attaching them up front reduces the chance of a return.")}</p>
          <div className="space-y-3">
            {files.map((fl, i) => (
              <div key={fl.key} className="grid gap-2 sm:grid-cols-[12rem_1fr]">
                <input name="labels" aria-label={t(`وصف المرفق ${i + 1}`, `File ${i + 1} label`)} placeholder={t("وصف المرفق (مثل: خطاب التكليف)", "Label (e.g. assignment letter)")} className={input} value={fl.label}
                  onChange={(e) => setFiles(files.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                <div>
                  <input name="files" type="file" aria-label={t(`ملف المرفق ${i + 1}`, `File ${i + 1}`)} accept="application/pdf,image/jpeg,image/png"
                    className="block w-full text-sm file:me-3 file:min-h-10 file:rounded-lg file:border-0 file:bg-chip file:px-3 file:py-2 file:font-semibold file:text-brand"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      let err: string | undefined;
                      if (file && !OK_TYPES.includes(file.type)) err = t("نوع غير مسموح — PDF أو JPG أو PNG فقط", "Type not allowed — PDF, JPG or PNG only");
                      else if (file && file.size > MAX_FILE) err = t(`الحجم ${fmtSize(file.size)} يتجاوز 5MB`, `Size ${fmtSize(file.size)} exceeds 5MB`);
                      if (err) e.target.value = "";
                      setFiles(files.map((x, j) => (j === i ? { ...x, name: err ? undefined : file?.name, size: file?.size, err, label: x.label || (file && !err ? file.name.replace(/\.[^.]+$/, "") : x.label) } : x)));
                    }} />
                  {fl.err ? <p className="mt-1 text-xs text-bad" role="alert">{fl.err}</p> : fl.name && <p className="mt-1 text-xs text-ok">✓ <span dir="ltr">{fl.name}</span> · <span className="num">{fmtSize(fl.size ?? 0)}</span></p>}
                </div>
              </div>
            ))}
            {files.length < 10 && (
              <button type="button" className={btn.ghost} onClick={() => setFiles([...files, { key: Date.now(), label: "" }])}>+ {t("مرفق آخر", "Another file")}</button>
            )}
          </div>
        </Sec>

        <Sec n={8} title={sections[7]} done={secDone[7]}>
          <label data-field="declaration" className="flex min-h-11 cursor-pointer items-start gap-3">
            <input type="checkbox" className="mt-1 h-5 w-5 accent-brand" checked={declaration} onChange={(e) => setDeclaration(e.target.checked)} />
            <span className="text-sm leading-relaxed">
              {t(
                "أقر بصحة جميع البيانات المقدمة، وبأن الدخول يقتصر على المنطقة والفترة والأسماء والمعدات والمركبات المعتمدة في التصريح، وأتحمل المسؤولية عن أي مخالفة.",
                "I confirm all data is correct, that entry is limited to the approved zone, period, names, equipment and vehicles, and I accept responsibility for any violation.",
              )}
            </span>
          </label>
          {fieldMsg("declaration")}
        </Sec>

        {/* Error summary: every problem in one place, each one jumps to its field */}
        {touched && (liveErrors.length > 0 || fileBad) && (
          <div className="rounded-2xl border border-bad/30 bg-bad-soft p-4" role="alert" aria-live="polite">
            <p className="text-sm font-semibold text-bad">
              {t(`قبل التقديم: ${liveErrors.length + (fileBad ? 1 : 0)} ملاحظة تحتاج تصحيح`, `Before submitting: ${liveErrors.length + (fileBad ? 1 : 0)} item(s) to fix`)}
            </p>
            <ul className="mt-2 space-y-1">
              {liveErrors.slice(0, 8).map((e, i) => (
                <li key={i}>
                  <button type="button" onClick={() => go(e.field.split(".")[0])} className="text-start text-sm text-bad underline decoration-bad/40 underline-offset-4 hover:decoration-bad">
                    {t(e.ar, e.en)}
                  </button>
                </li>
              ))}
              {fileBad && <li className="text-sm text-bad">{t("أحد المرفقات غير مقبول — راجع القسم 7", "An attachment was rejected — see section 7")}</li>}
              {liveErrors.length > 8 && <li className="text-xs text-bad/80 num">+{liveErrors.length - 8}</li>}
            </ul>
          </div>
        )}

        {state.errors.some((e) => e.field === "form") && (
          <p role="alert" className="text-sm text-bad">{t(state.errors[0].ar, state.errors[0].en)}</p>
        )}
        <div className="sticky bottom-[calc(4.6rem+env(safe-area-inset-bottom))] z-10 -mx-4 border-t border-line bg-paper/95 px-4 py-3 backdrop-blur md:bottom-0 lg:hidden">
          <button className={`${btn.primary} w-full`} disabled={pending}>{pending ? t("جارٍ الإرسال…", "Submitting…") : t("مراجعة وتقديم الطلب", "Review & submit")}</button>
        </div>
      </div>

      <aside className="hidden lg:block">
        <div className="sticky top-4 space-y-3 rounded-2xl border border-line bg-surface p-4">
          <div>
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-ink">{t("التقدم", "Progress")}</span>
              <span className="num text-ink-soft">{doneCount}/8</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
              <div className="h-full rounded-full bg-gradient-to-l from-ok to-ok-bright transition-[width] duration-500" style={{ width: `${(doneCount / 8) * 100}%` }} />
            </div>
          </div>
          <ol className="space-y-1 text-sm">
            {sections.map((s, i) => (
              <li key={s}>
                <a href={`#s${i + 1}`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-chip/50">
                  <span className={`grid h-4 w-4 place-items-center rounded-full text-[9px] font-bold text-white ${secDone[i] ? "bg-ok" : touched && secBad[i] ? "bg-bad" : "bg-rose-soft"}`}>{secDone[i] ? "✓" : ""}</span>
                  <span className={secDone[i] ? "text-ink-soft" : "text-ink"}>{s}</span>
                </a>
              </li>
            ))}
          </ol>
          <button className={`${btn.primary} w-full`} disabled={pending}>{pending ? t("جارٍ الإرسال…", "Submitting…") : t("مراجعة وتقديم الطلب", "Review & submit")}</button>
          {touched && liveErrors.length > 0 && <p className="text-xs text-bad">{t(`${liveErrors.length} حقل يحتاج تصحيح`, `${liveErrors.length} field(s) need attention`)}</p>}
          <p className="text-[11px] leading-relaxed text-ink-soft">{t("تُحفظ مسودتك تلقائيًا في هذه الجلسة.", "Your draft is saved automatically for this session.")}</p>
        </div>
      </aside>

      {/* Review sheet: one look at what will be sent — fewer returns for completion */}
      {review && (
        <div className="fixed inset-0 z-[90] grid place-items-end bg-noir/60 p-0 sm:place-items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="rv-h" onClick={() => setReview(false)}>
          <div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-3xl bg-surface p-5 pb-0 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <h3 id="rv-h" className="font-sans text-lg font-bold text-ink">{t("راجع طلبك قبل الإرسال", "Review before sending")}</h3>
            <p className="mt-1 text-xs text-ink-soft">{t("بعد الإرسال يمر الطلب بالمراجعة الأولية ثم الاعتماد النهائي.", "After sending, it goes to initial review then final approval.")}</p>
            <dl className="mt-4 divide-y divide-line rounded-2xl border border-line text-sm">
              {[
                [t("الجهة", "Organization"), f.org_name, 1],
                [t("الممثل", "Representative"), `${f.rep_name} · ${f.rep_phone}`, 2],
                [t("الفترة", "Period"), `${f.from.replace("T", " ")} ← ${f.to.replace("T", " ")}`, 3],
                [t("المناطق", "Zones"), zoneIds.map(zoneName).join("، "), 3],
                [t("الأفراد", "People"), String(filledPeople), 4],
                [t("المركبات", "Vehicles"), vehicles.length ? `${vehicles.length}${slot.date ? ` · ${slot.date} ${String(slot.hour).padStart(2, "0")}:00` : ""}` : t("لا يوجد", "None"), 5],
                [t("المعدات", "Equipment"), equipment.length ? String(equipment.reduce((s, x) => s + (x.qty || 0), 0)) : t("لا يوجد", "None"), 6],
                [t("المرفقات", "Attachments"), chosenFiles.length ? String(chosenFiles.length) : t("لا يوجد", "None"), 7],
              ].map(([k, v, n]) => (
                <div key={String(k)} className="flex items-start gap-3 px-4 py-2.5">
                  <dt className="w-20 shrink-0 text-ink-soft">{k}</dt>
                  <dd className="min-w-0 flex-1 break-words font-medium text-ink">{v}</dd>
                  <button type="button" className="shrink-0 text-xs font-semibold text-brand" onClick={() => { setReview(false); setTimeout(() => document.getElementById(`s${n}`)?.scrollIntoView({ behavior: "smooth" }), 50); }}>
                    {t("تعديل", "Edit")}
                  </button>
                </div>
              ))}
            </dl>
            <div className="sticky bottom-0 -mx-5 mt-5 grid grid-cols-[1fr_2fr] gap-2 border-t border-line bg-surface px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-3">
              <button type="button" className={btn.secondary} onClick={() => setReview(false)}>{t("رجوع", "Back")}</button>
              <button
                type="button"
                autoFocus
                className={btn.primary}
                disabled={pending}
                onClick={() => { confirmed.current = true; setReview(false); formRef.current?.requestSubmit(); }}
              >
                {t("تأكيد وإرسال الطلب", "Confirm & send")}
              </button>
            </div>
          </div>
        </div>
      )}

      {paste && (
        <RosterImport
          kind={paste}
          t={t}
          room={paste === "people" ? LIMITS.people - filledPeople : LIMITS.vehicles - vehicles.length}
          onClose={() => setPaste(null)}
          onAdd={(rows) => { if (paste === "people") addPeople(rows as Person[]); else addVehicles(rows as Vehicle[]); setPaste(null); }}
        />
      )}
    </form>
  );
}
