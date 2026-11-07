"use client";
import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { saveProfileAction, type ProfileState } from "./actions";
import { EquipmentInput, PlateInput } from "@/components/AssetInputs";
import SaudiPlate from "@/components/SaudiPlate";
import { Icon } from "@/components/icons";
import type { OrgProfile, Team } from "@/lib/org";
import { normPlate, type Equipment, type Person, type Vehicle } from "@/lib/validate";

const input = "w-full rounded-lg border border-line-strong bg-field px-3 py-2.5 text-[15px] text-ink outline-none transition placeholder:text-ink-soft/60 focus:border-focus focus:ring-2 focus:ring-focus/25 aria-[invalid=true]:border-bad";
const label = "mb-1.5 block text-sm font-medium text-ink";
const ID_RE = /^[12]\d{9}$/;
type Tab = "people" | "vehicles" | "equipment" | "teams";
const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now() + Math.random()));

export default function ProfileForm({ init, lang }: { init: OrgProfile; lang: "ar" | "en" }) {
  const t = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const [state, action, pending] = useActionState<ProfileState, FormData>(saveProfileAction, { errors: [] });
  const [org, setOrg] = useState({ name: init.name, cr_number: init.cr_number, rep_name: init.rep_name, rep_phone: init.rep_phone, rep_id: init.rep_id });
  const [people, setPeople] = useState<Person[]>(init.people);
  const [vehicles, setVehicles] = useState<Vehicle[]>(init.vehicles.map((v) => ({ ...v, kind: v.kind ?? undefined })));
  const [equipment, setEquipment] = useState<Equipment[]>(init.equipment);
  const [teams, setTeams] = useState<Team[]>(init.teams);
  const [tab, setTab] = useState<Tab>("people");
  const [editing, setEditing] = useState<Team | null>(null);
  const [paste, setPaste] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [filter, setFilter] = useState("");
  const payload = { ...org, people, vehicles, equipment, teams };
  const dirty = JSON.stringify(payload) !== JSON.stringify({ name: init.name, cr_number: init.cr_number, rep_name: init.rep_name, rep_phone: init.rep_phone, rep_id: init.rep_id, people: init.people, vehicles: init.vehicles, equipment: init.equipment, teams: init.teams });

  const inTeams = (key: string, k: "people" | "vehicles" | "equipment") => teams.filter((x) => x[k].includes(key)).length;
  const tabs: [Tab, string, number, "user" | "card" | "grid" | "list"][] = [
    ["people", t("الأفراد", "People"), people.length, "user"],
    ["vehicles", t("المركبات", "Vehicles"), vehicles.length, "card"],
    ["equipment", t("المعدات", "Equipment"), equipment.length, "grid"],
    ["teams", t("فرق العمل", "Teams"), teams.length, "list"],
  ];
  const shownPeople = useMemo(() => people.map((p, i) => ({ p, i })).filter(({ p }) => !filter || p.name.includes(filter) || p.id_number.includes(filter)), [people, filter]);

  function addPasted() {
    const rows = paste.split(/\r?\n/).map((l) => l.split(/\t|,|؛|;/).map((c) => c.trim())).filter((r) => r.some(Boolean));
    const add = rows.map(([a = "", b = ""]) => (/^\d{10}$/.test(a.replace(/\D/g, "")) && !/[^\d\s]/.test(a) ? { name: b, id_number: a.replace(/\D/g, "") } : { name: a, id_number: b.replace(/\D/g, "") }));
    setPeople([...people, ...add].slice(0, 300));
    setPaste("");
    setShowPaste(false);
  }

  return (
    <form action={action} className="space-y-5 pb-24">
      <input type="hidden" name="payload" value={JSON.stringify(payload)} />
      {state.ok && !dirty && (
        <p role="status" className="rounded-xl border border-ok/25 bg-ok-soft px-4 py-3 text-sm font-medium text-ok">
          ✓ {t("تم حفظ الملف.", "Profile saved.")} {state.counts && <span className="tabular-nums text-ok/80">({state.counts.people} {t("فرد", "people")} · {state.counts.vehicles} {t("مركبة", "vehicles")} · {state.counts.equipment} {t("معدة", "equipment")} · {state.counts.teams} {t("فريق", "teams")})</span>}
        </p>
      )}
      {state.errors.length > 0 && (
        <div role="alert" className="rounded-xl border border-bad/30 bg-bad-soft px-4 py-3 text-sm text-bad">
          <p className="font-semibold">{t("لم يُحفظ الملف — صحّح التالي:", "Not saved — fix the following:")}</p>
          <ul className="mt-1 list-inside list-disc">{state.errors.map((e) => <li key={e}>{e}</li>)}</ul>
        </div>
      )}

      {/* org + representative */}
      <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
        <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-ink"><span className="grid h-8 w-8 place-items-center rounded-lg bg-chip text-brand"><Icon name="user" size={17} /></span>{t("الجهة والممثل", "Organization & representative")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className={label} htmlFor="o-name">{t("اسم الجهة أو الشركة", "Organization name")} *</label><input id="o-name" className={input} value={org.name} onChange={(e) => setOrg({ ...org, name: e.target.value })} /></div>
          <div><label className={label} htmlFor="o-cr">{t("رقم السجل التجاري", "CR number")}</label><input id="o-cr" className={input} dir="ltr" inputMode="numeric" maxLength={10} value={org.cr_number} onChange={(e) => setOrg({ ...org, cr_number: e.target.value.replace(/\D/g, "") })} /></div>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div><label className={label} htmlFor="o-rn">{t("اسم الممثل", "Representative")}</label><input id="o-rn" className={input} value={org.rep_name} onChange={(e) => setOrg({ ...org, rep_name: e.target.value })} /></div>
          <div><label className={label} htmlFor="o-rp">{t("جوال الممثل", "Mobile")}</label><input id="o-rp" className={input} dir="ltr" inputMode="tel" maxLength={10} placeholder="05XXXXXXXX" value={org.rep_phone} onChange={(e) => setOrg({ ...org, rep_phone: e.target.value.replace(/\D/g, "") })} /></div>
          <div><label className={label} htmlFor="o-ri">{t("هوية الممثل", "Representative ID")}</label><input id="o-ri" className={input} dir="ltr" inputMode="numeric" maxLength={10} value={org.rep_id} onChange={(e) => setOrg({ ...org, rep_id: e.target.value.replace(/\D/g, "") })} /></div>
        </div>
      </section>

      {/* roster tabs */}
      <section className="overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="flex gap-1 overflow-x-auto border-b border-line bg-panel px-2 pt-2" role="tablist">
          {tabs.map(([k, l, n, icon]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => { setTab(k); setEditing(null); }}
              className={`flex min-h-11 shrink-0 items-center gap-2 rounded-t-xl px-4 text-sm font-semibold transition ${tab === k ? "bg-surface text-brand shadow-[0_-1px_0_var(--color-line),1px_0_0_var(--color-line),-1px_0_0_var(--color-line)]" : "text-ink-soft hover:text-ink"}`}>
              <Icon name={icon} size={16} />{l}<span className={`num rounded-full px-1.5 text-[11px] ${tab === k ? "bg-chip text-brand" : "bg-mist"}`}>{n}</span>
            </button>
          ))}
        </div>

        <div className="space-y-3 p-4 sm:p-5">
          {tab === "people" && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-ink-soft">{t("الأفراد المعتادون لدى الجهة. تُبنى منهم فرق العمل.", "Your usual people. Teams are built from this list.")}</p>
                {people.length > 8 && <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t("بحث بالاسم أو الهوية", "Search name or ID")} className="min-h-10 w-56 rounded-lg border border-line px-3 text-sm" aria-label={t("بحث", "Search")} />}
              </div>
              {people.length === 0 && <p className="rounded-xl bg-panel px-4 py-6 text-center text-sm text-ink-soft">{t("لا يوجد أفراد بعد — أضفهم أو الصقهم من Excel.", "No people yet — add or paste from Excel.")}</p>}
              <ul className="space-y-2">
                {shownPeople.map(({ p, i }) => {
                  const bad = !!p.id_number && !ID_RE.test(p.id_number);
                  const n = inTeams(p.id_number, "people");
                  return (
                    <li key={i} className="grid grid-cols-[1fr_auto] items-center gap-2 sm:grid-cols-[2rem_1fr_12rem_auto_auto]">
                      <span className="num hidden text-center text-xs text-ink-soft sm:block">{i + 1}</span>
                      <input aria-label={t(`اسم الفرد ${i + 1}`, `Person ${i + 1} name`)} className={`${input} col-span-2 sm:col-span-1`} placeholder={t("الاسم الكامل", "Full name")} value={p.name} onChange={(e) => setPeople(people.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                      <input aria-label={t(`هوية الفرد ${i + 1}`, `Person ${i + 1} ID`)} aria-invalid={bad} className={input} dir="ltr" inputMode="numeric" maxLength={10} placeholder={t("رقم الهوية", "ID number")} value={p.id_number} onChange={(e) => setPeople(people.map((x, j) => (j === i ? { ...x, id_number: e.target.value.replace(/\D/g, "") } : x)))} />
                      <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${n ? "bg-chip text-brand" : "text-ink-soft/60"}`}>{n ? t(`في ${n} فريق`, `in ${n} team(s)`) : t("خارج الفرق", "no team")}</span>
                      <button type="button" aria-label={t(`حذف الفرد ${i + 1}`, `Remove person ${i + 1}`)} onClick={() => setPeople(people.filter((_, j) => j !== i))} className="grid h-11 w-11 place-items-center rounded-lg text-ink-soft hover:bg-bad-soft hover:text-bad">✕</button>
                    </li>
                  );
                })}
              </ul>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setPeople([...people, { name: "", id_number: "" }])} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line px-4 text-sm font-semibold hover:border-gold"><Icon name="plus" size={16} />{t("إضافة فرد", "Add person")}</button>
                <button type="button" onClick={() => setShowPaste(!showPaste)} className="min-h-11 px-3 text-sm font-semibold text-brand">{t("لصق قائمة من Excel", "Paste from Excel")}</button>
              </div>
              {showPaste && (
                <div className="rounded-xl border border-line bg-panel p-3">
                  <p className="text-xs text-ink-soft">{t("عمودان: الاسم ورقم الهوية بأي ترتيب — سطر لكل فرد.", "Two columns: name and ID in any order — one per line.")}</p>
                  <textarea rows={5} dir="auto" value={paste} onChange={(e) => setPaste(e.target.value)} className={`${input} mt-2 font-mono text-sm`} />
                  <button type="button" onClick={addPasted} disabled={!paste.trim()} className="mt-2 min-h-10 rounded-lg bg-brand px-4 text-sm font-semibold text-white disabled:opacity-50">{t("إضافة", "Add")}</button>
                </div>
              )}
            </>
          )}

          {tab === "vehicles" && (
            <>
              <p className="text-sm text-ink-soft">{t("مركبات الجهة المعتادة. اللوحة السعودية تُكتب بالعربي أو كما تظهر بالإنجليزي.", "Your usual vehicles. Type Saudi plates in Arabic or as shown in English.")}</p>
              {vehicles.map((v, i) => (
                <PlateInput key={i} value={v} index={i} t={t} lang={lang} onChange={(nv) => setVehicles(vehicles.map((x, j) => (j === i ? nv : x)))} onRemove={() => setVehicles(vehicles.filter((_, j) => j !== i))} />
              ))}
              <button type="button" onClick={() => setVehicles([...vehicles, { plate: "", type: "", kind: "sa" }])} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line px-4 text-sm font-semibold hover:border-gold"><Icon name="plus" size={16} />{t("إضافة مركبة", "Add vehicle")}</button>
            </>
          )}

          {tab === "equipment" && (
            <>
              <p className="text-sm text-ink-soft">{t("المعدات المعتادة بفئتها وعددها، والرقم التسلسلي اختياري لتسهيل المطابقة عند البوابة.", "Usual equipment with category and quantity; the serial is optional and helps matching at the gate.")}</p>
              {equipment.map((x, i) => (
                <EquipmentInput key={i} value={x} index={i} t={t} onChange={(nx) => setEquipment(equipment.map((y, j) => (j === i ? nx : y)))} onRemove={() => setEquipment(equipment.filter((_, j) => j !== i))} />
              ))}
              <button type="button" onClick={() => setEquipment([...equipment, { name: "", qty: 1 }])} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line px-4 text-sm font-semibold hover:border-gold"><Icon name="plus" size={16} />{t("إضافة معدة", "Add equipment")}</button>
            </>
          )}

          {tab === "teams" && !editing && (
            <>
              <p className="text-sm text-ink-soft">{t("فرق العمل قوائم جاهزة من أفراد الجهة ومركباتها ومعداتها. عند طلب تصريح لاحقًا اختر الفريق بضغطة، ثم أضف أو عدّل أو احذف أي شخص لذلك الطلب.", "Teams are ready-made lists from your people, vehicles and equipment. In a later request pick a team in one tap, then add, edit or remove anyone for that request.")}</p>
              {teams.length === 0 && <p className="rounded-xl bg-panel px-4 py-6 text-center text-sm text-ink-soft">{t("لا توجد فرق بعد.", "No teams yet.")}</p>}
              <div className="grid gap-3 md:grid-cols-2">
                {teams.map((tm) => {
                  const names = tm.people.map((id) => people.find((p) => p.id_number === id)?.name).filter(Boolean) as string[];
                  return (
                    <article key={tm.id} className="rounded-2xl border border-line p-4 transition hover:border-gold">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-display text-base font-bold text-ink">{tm.name}</h3>
                          <p className="mt-0.5 text-xs tabular-nums text-ink-soft">{tm.people.length} {t("فرد", "people")} · {tm.vehicles.length} {t("مركبة", "vehicles")} · {tm.equipment.length} {t("معدة", "equipment")}</p>
                        </div>
                        <div className="flex gap-1">
                          <button type="button" onClick={() => setEditing({ ...tm })} className="min-h-9 rounded-lg border border-line px-3 text-xs font-semibold hover:border-gold">{t("تعديل", "Edit")}</button>
                          <button type="button" onClick={() => setTeams([...teams, { ...tm, id: newId(), name: `${tm.name} (${t("نسخة", "copy")})` }])} className="min-h-9 rounded-lg border border-line px-3 text-xs font-semibold hover:border-gold">{t("نسخ", "Duplicate")}</button>
                          <button type="button" onClick={() => setTeams(teams.filter((x) => x.id !== tm.id))} aria-label={t(`حذف ${tm.name}`, `Delete ${tm.name}`)} className="grid h-9 w-9 place-items-center rounded-lg text-ink-soft hover:bg-bad-soft hover:text-bad">✕</button>
                        </div>
                      </div>
                      <p className="mt-2 line-clamp-2 text-sm text-ink">{names.join("، ") || "—"}</p>
                      {tm.vehicles.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {tm.vehicles.slice(0, 3).map((k) => { const v = vehicles.find((x) => normPlate(x.plate) === k); return v ? <SaudiPlate key={k} plate={v.plate} kind={v.kind} size="sm" /> : null; })}
                        </div>
                      )}
                      {!dirty && init.teams.some((x) => x.id === tm.id) && (
                        <Link href={`/apply/new?team=${encodeURIComponent(tm.id)}`} className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-brand px-3 text-xs font-semibold text-white hover:bg-brand-deep">{t("طلب تصريح بهذا الفريق", "Request a permit with this team")} ←</Link>
                      )}
                    </article>
                  );
                })}
              </div>
              <button type="button" disabled={!people.length} onClick={() => setEditing({ id: newId(), name: "", people: [], vehicles: [], equipment: [] })} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-gradient-to-b from-brand to-brand-deep px-4 text-sm font-semibold text-white disabled:opacity-50"><Icon name="plus" size={16} />{t("فريق جديد", "New team")}</button>
              {!people.length && <p className="text-xs text-ink-soft">{t("أضف الأفراد أولًا من تبويب «الأفراد».", "Add people first in the People tab.")}</p>}
            </>
          )}

          {tab === "teams" && editing && <TeamEditor team={editing} people={people} vehicles={vehicles} equipment={equipment} t={t}
            onCancel={() => setEditing(null)}
            onSave={(tm) => { setTeams(teams.some((x) => x.id === tm.id) ? teams.map((x) => (x.id === tm.id ? { ...tm, updated_at: new Date().toISOString() } : x)) : [...teams, tm]); setEditing(null); }} />}
        </div>
      </section>

      {/* sticky save bar */}
      <div className="sticky bottom-[calc(4.6rem+env(safe-area-inset-bottom))] z-10 flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface/95 px-4 py-3 shadow-[0_-8px_24px_-18px_rgba(61,42,36,.4)] backdrop-blur md:bottom-3">
        <p className="text-xs text-ink-soft">{dirty ? <span className="font-semibold text-hold">● {t("تغييرات غير محفوظة", "Unsaved changes")}</span> : t("التغييرات لا تُحفظ إلا بالضغط على حفظ.", "Changes are saved only when you press Save.")}</p>
        <button disabled={pending || !!editing} className="min-h-11 rounded-xl bg-gradient-to-b from-brand to-brand-deep px-6 text-sm font-bold text-white shadow-[0_8px_20px_-10px_rgba(118,59,48,.8)] disabled:opacity-50">{pending ? t("جارٍ الحفظ…", "Saving…") : t("حفظ الملف", "Save profile")}</button>
      </div>
    </form>
  );
}

function TeamEditor({ team, people, vehicles, equipment, t, onCancel, onSave }: {
  team: Team; people: Person[]; vehicles: Vehicle[]; equipment: Equipment[]; t: (a: string, e: string) => string; onCancel: () => void; onSave: (t: Team) => void;
}) {
  const [tm, setTm] = useState(team);
  const [q, setQ] = useState("");
  const toggle = (k: "people" | "vehicles" | "equipment", key: string) => setTm({ ...tm, [k]: tm[k].includes(key) ? tm[k].filter((x) => x !== key) : [...tm[k], key] });
  const valid = people.filter((p) => ID_RE.test(p.id_number) && p.name);
  const shown = valid.filter((p) => !q || p.name.includes(q) || p.id_number.includes(q));
  const allOn = shown.length > 0 && shown.every((p) => tm.people.includes(p.id_number));
  return (
    <div className="space-y-4 rounded-2xl border border-gold/50 bg-chip/30 p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <label className={label} htmlFor="tm-name">{t("اسم الفريق", "Team name")} *</label>
          <input id="tm-name" autoFocus className={input} placeholder={t("مثل: فريق الصيانة الليلية", "e.g. Night maintenance crew")} value={tm.name} onChange={(e) => setTm({ ...tm, name: e.target.value.slice(0, 60) })} />
        </div>
        <p className="pb-3 text-sm font-semibold tabular-nums text-brand">{tm.people.length} {t("فرد", "people")} · {tm.vehicles.length} {t("مركبة", "veh.")} · {tm.equipment.length} {t("معدة", "equip.")}</p>
      </div>

      <fieldset>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <legend className="text-sm font-semibold text-ink">{t("الأفراد", "People")}</legend>
          <div className="flex items-center gap-2">
            {valid.length > 8 && <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("بحث", "Search")} className="min-h-9 w-40 rounded-lg border border-line px-2 text-sm" aria-label={t("بحث في الأفراد", "Search people")} />}
            <button type="button" onClick={() => setTm({ ...tm, people: allOn ? tm.people.filter((x) => !shown.some((p) => p.id_number === x)) : [...new Set([...tm.people, ...shown.map((p) => p.id_number)])] })} className="text-xs font-semibold text-brand">{allOn ? t("إلغاء تحديد الكل", "Clear all") : t("تحديد الكل", "Select all")}</button>
          </div>
        </div>
        <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((p) => {
            const on = tm.people.includes(p.id_number);
            return (
              <label key={p.id_number} className={`flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl border px-3 text-sm transition ${on ? "border-brand bg-surface" : "border-line bg-surface/60 hover:border-rose"}`}>
                <input type="checkbox" checked={on} onChange={() => toggle("people", p.id_number)} className="h-4 w-4 accent-brand" />
                <span className="flex-1 truncate">{p.name}</span>
                <span className="num text-[11px] text-ink-soft">••{p.id_number.slice(-4)}</span>
              </label>
            );
          })}
        </div>
        {valid.length < people.length && <p className="mt-1 text-xs text-hold">{t("بعض الأفراد لا يظهرون لأن بياناتهم غير مكتملة.", "Some people are hidden because their data is incomplete.")}</p>}
      </fieldset>

      {vehicles.length > 0 && (
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-ink">{t("المركبات", "Vehicles")}</legend>
          <div className="flex flex-wrap gap-2">
            {vehicles.filter((v) => v.plate).map((v) => {
              const k = normPlate(v.plate);
              const on = tm.vehicles.includes(k);
              return (
                <button key={k} type="button" aria-pressed={on} onClick={() => toggle("vehicles", k)} className={`flex items-center gap-2 rounded-xl border p-1.5 pe-3 transition ${on ? "border-brand bg-surface ring-2 ring-focus/25" : "border-line bg-surface/60 opacity-75 hover:opacity-100"}`}>
                  <SaudiPlate plate={v.plate} kind={v.kind} size="sm" />
                  <span className="text-xs text-ink-soft">{v.type}</span>
                  <span className={`grid h-5 w-5 place-items-center rounded text-[11px] ${on ? "bg-brand text-white" : "border border-line"}`}>{on ? "✓" : ""}</span>
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      {equipment.length > 0 && (
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-ink">{t("المعدات", "Equipment")}</legend>
          <div className="flex flex-wrap gap-2">
            {equipment.filter((x) => x.name).map((x) => {
              const on = tm.equipment.includes(x.name.trim());
              return (
                <button key={x.name} type="button" aria-pressed={on} onClick={() => toggle("equipment", x.name.trim())} className={`min-h-10 rounded-xl border px-3 text-sm transition ${on ? "border-brand bg-surface font-semibold text-brand" : "border-line bg-surface/60 text-ink"}`}>
                  {on ? "✓ " : ""}{x.name} <span className="num text-xs text-ink-soft">×{x.qty}</span>
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      <div className="flex justify-end gap-2 border-t border-line pt-3">
        <button type="button" onClick={onCancel} className="min-h-11 rounded-xl border border-line px-4 text-sm font-semibold">{t("إلغاء", "Cancel")}</button>
        <button type="button" disabled={!tm.name.trim() || !tm.people.length} onClick={() => onSave({ ...tm, name: tm.name.trim() })} className="min-h-11 rounded-xl bg-brand px-5 text-sm font-semibold text-white disabled:opacity-50">{t("اعتماد الفريق", "Apply team")}</button>
      </div>
      <p className="text-xs text-ink-soft">{t("بعد «اعتماد الفريق» اضغط «حفظ الملف» بالأسفل لحفظ التغييرات.", "After “Apply team”, press “Save profile” below to keep the changes.")}</p>
    </div>
  );
}
