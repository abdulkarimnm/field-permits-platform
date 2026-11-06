"use client";
import { useState } from "react";
import SaudiPlate from "./SaudiPlate";
import { cleanDigits, cleanLetters, EQUIPMENT_KINDS, formatSaPlate, parseSaPlate, PLATE_LETTERS } from "@/lib/plates";
import type { Equipment, Vehicle } from "@/lib/validate";

const field = "w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-[15px] text-ink outline-none transition placeholder:text-ink-soft/60 focus:border-brand focus:ring-2 focus:ring-brand/15 aria-[invalid=true]:border-bad";
const VEHICLE_TYPES: [string, string][] = [["سيارة صغيرة", "Car"], ["بيك أب", "Pickup"], ["فان", "Van"], ["شاحنة نقل خفيفة", "Light truck"], ["شاحنة", "Truck"], ["رافعة", "Crane"], ["حافلة", "Bus"], ["مركبة خدمات", "Service vehicle"]];

/* ───────── Vehicle: Saudi plate (letters + digits with live plate) or any other plate ───────── */
export function PlateInput({ value, onChange, onRemove, index, t, lang, invalid }: {
  value: Vehicle; onChange: (v: Vehicle) => void; onRemove: () => void; index: number;
  t: (a: string, e: string) => string; lang: "ar" | "en"; invalid?: boolean;
}) {
  const kind = value.kind ?? (value.plate && !parseSaPlate(value.plate) ? "other" : "sa");
  const parsed = parseSaPlate(value.plate);
  const [letters, setLetters] = useState(parsed ? parsed.letters.join(" ") : "");
  const [digits, setDigits] = useState(parsed?.digits ?? "");
  const [pad, setPad] = useState(false);

  const emit = (l: string, d: string) => {
    const L = cleanLetters(l);
    onChange({ ...value, kind: "sa", plate: L.length || d ? formatSaPlate({ letters: L, digits: d }) : "" });
  };
  const n = index + 1;
  return (
    <div className="rounded-2xl border border-line bg-surface p-3 sm:p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-ink-soft">{t(`المركبة ${n}`, `Vehicle ${n}`)}</p>
        <button type="button" onClick={onRemove} aria-label={t(`حذف المركبة ${n}`, `Remove vehicle ${n}`)} className="grid min-h-9 min-w-9 place-items-center rounded-lg text-ink-soft hover:bg-bad-soft hover:text-bad">✕</button>
      </div>
      <div className="grid gap-3 md:grid-cols-[1fr_14rem] md:items-end">
        <div>
          <div className="mb-2 flex gap-1.5" role="radiogroup" aria-label={t("نوع اللوحة", "Plate type")}>
            {(["sa", "other"] as const).map((k) => (
              <button key={k} type="button" role="radio" aria-checked={kind === k}
                onClick={() => (k === "sa" ? emit(letters, digits) : onChange({ ...value, kind: "other", plate: kind === "other" ? value.plate : "" }))}
                className={`min-h-8 rounded-full border px-3 text-xs font-semibold transition ${kind === k ? "border-brand bg-brand text-white" : "border-line text-ink-soft hover:border-gold"}`}>
                {k === "sa" ? t("لوحة سعودية", "Saudi plate") : t("لوحة أخرى (أجنبية أو مؤقتة)", "Other (foreign / temporary)")}
              </button>
            ))}
          </div>
          {kind === "sa" ? (
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex overflow-hidden rounded-lg border border-line focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/15" dir="rtl">
                <input aria-label={t(`حروف لوحة المركبة ${n}`, `Vehicle ${n} plate letters`)} placeholder={t("ر ك ن", "R K N")} value={letters} aria-invalid={invalid}
                  onFocus={() => setPad(true)}
                  onChange={(e) => { const L = cleanLetters(e.target.value); const s = L.join(" "); setLetters(s); emit(s, digits); }}
                  className="w-28 border-e border-line bg-surface px-3 py-2.5 text-center text-[17px] font-bold tracking-[.25em] text-ink outline-none" />
                <input aria-label={t(`أرقام لوحة المركبة ${n}`, `Vehicle ${n} plate digits`)} placeholder="1234" inputMode="numeric" dir="ltr" value={digits} aria-invalid={invalid}
                  onChange={(e) => { const d = cleanDigits(e.target.value); setDigits(d); emit(letters, d); }}
                  className="w-24 bg-surface px-3 py-2.5 text-center font-mono text-[17px] font-bold tracking-[.2em] text-ink outline-none" />
              </div>
              <SaudiPlate plate={value.plate || "ا 0"} size="md" className={value.plate ? "" : "opacity-30"} />
            </div>
          ) : (
            <input aria-label={t(`رقم لوحة المركبة ${n}`, `Vehicle ${n} plate`)} placeholder={t("مثل: DXB 12345 أو لوحة مؤقتة", "e.g. DXB 12345 or temporary")} dir="ltr" value={value.plate} aria-invalid={invalid}
              onChange={(e) => onChange({ ...value, kind: "other", plate: e.target.value.toUpperCase().slice(0, 20) })} className={`${field} max-w-xs font-mono`} />
          )}
          {kind === "sa" && pad && (
            <div className="mt-2 rounded-xl border border-line bg-paper p-2">
              <div className="mb-1 flex items-center justify-between text-[11px] text-ink-soft">
                <span>{t("الحروف المعتمدة في اللوحات — اضغط للإضافة، أو اكتب بالعربي أو الإنجليزي", "Approved plate letters — tap to add, or type Arabic/English")}</span>
                <button type="button" className="font-semibold text-brand" onClick={() => setPad(false)}>{t("إخفاء", "Hide")}</button>
              </div>
              <div className="grid grid-cols-9 gap-1" dir="rtl">
                {PLATE_LETTERS.map(([a, e]) => (
                  <button key={a} type="button" disabled={cleanLetters(letters).length >= 3}
                    onClick={() => { const s = [...cleanLetters(letters), a].join(" "); setLetters(s); emit(s, digits); }}
                    className="flex min-h-10 flex-col items-center justify-center rounded-lg border border-line bg-surface text-ink transition hover:border-brand disabled:opacity-40">
                    <span className="text-[15px] font-bold leading-none">{a}</span>
                    <span className="mt-0.5 font-mono text-[9px] leading-none text-ink-soft">{e}</span>
                  </button>
                ))}
                <button type="button" onClick={() => { const L = cleanLetters(letters).slice(0, -1).join(" "); setLetters(L); emit(L, digits); }}
                  className="col-span-1 min-h-10 rounded-lg border border-line bg-surface text-xs font-semibold text-ink-soft hover:border-bad hover:text-bad" aria-label={t("حذف آخر حرف", "Delete last letter")}>⌫</button>
              </div>
            </div>
          )}
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-soft" htmlFor={`vt-${index}`}>{t("نوع المركبة", "Vehicle type")}</label>
          <input id={`vt-${index}`} list="vehicle-types-x" className={field} placeholder={t("اختر أو اكتب", "Pick or type")} value={value.type} onChange={(e) => onChange({ ...value, type: e.target.value.slice(0, 60) })} />
          <datalist id="vehicle-types-x">{VEHICLE_TYPES.map(([a, e]) => <option key={a} value={lang === "ar" ? a : e} />)}</datalist>
        </div>
      </div>
    </div>
  );
}

/* ───────── Equipment: asset-tag card (category · name · quantity stepper · optional serial) ───────── */
export function EquipmentInput({ value, onChange, onRemove, index, t, invalid }: {
  value: Equipment; onChange: (v: Equipment) => void; onRemove: () => void; index: number; t: (a: string, e: string) => string; invalid?: boolean;
}) {
  const n = index + 1;
  const qty = value.qty || 0;
  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-surface ps-4">
      <span className="absolute inset-y-0 start-0 w-1.5 bg-gradient-to-b from-gold to-brand" aria-hidden />
      <div className="grid gap-3 p-3 sm:grid-cols-[11rem_1fr_auto] sm:items-end sm:p-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-soft" htmlFor={`ek-${index}`}>{t("الفئة", "Category")}</label>
          <select id={`ek-${index}`} className={field} value={value.kind ?? ""} onChange={(e) => onChange({ ...value, kind: e.target.value || undefined })}>
            <option value="">{t("اختر الفئة", "Pick category")}</option>
            {EQUIPMENT_KINDS.map((k) => <option key={k.id} value={k.id}>{t(k.ar, k.en)}</option>)}
          </select>
        </div>
        <div className="grid gap-2 sm:grid-cols-[1fr_9rem]">
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-soft" htmlFor={`en-${index}`}>{t(`اسم المعدة ${n}`, `Equipment ${n}`)}</label>
            <input id={`en-${index}`} className={field} placeholder={t("مثل: مولد كهربائي 5 كيلوواط", "e.g. 5 kW generator")} value={value.name} aria-invalid={invalid} onChange={(e) => onChange({ ...value, name: e.target.value.slice(0, 120) })} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-soft" htmlFor={`es-${index}`}>{t("الرقم التسلسلي (اختياري)", "Serial (optional)")}</label>
            <input id={`es-${index}`} className={`${field} font-mono`} dir="ltr" value={value.serial ?? ""} onChange={(e) => onChange({ ...value, serial: e.target.value.slice(0, 40) || undefined })} />
          </div>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <p className="mb-1 text-xs font-medium text-ink-soft">{t("العدد", "Qty")}</p>
            <div className="flex items-center overflow-hidden rounded-lg border border-line" dir="ltr">
              <button type="button" aria-label={t("إنقاص", "Decrease")} onClick={() => onChange({ ...value, qty: Math.max(1, qty - 1) })} className="grid h-11 w-10 place-items-center text-lg text-ink hover:bg-chip">−</button>
              <input aria-label={t(`عدد المعدة ${n}`, `Equipment ${n} quantity`)} inputMode="numeric" value={qty || ""} onChange={(e) => onChange({ ...value, qty: Math.min(999, Number(e.target.value.replace(/\D/g, "")) || 0) })} className="h-11 w-12 border-x border-line text-center font-mono font-bold outline-none" />
              <button type="button" aria-label={t("زيادة", "Increase")} onClick={() => onChange({ ...value, qty: Math.min(999, qty + 1) })} className="grid h-11 w-10 place-items-center text-lg text-ink hover:bg-chip">+</button>
            </div>
          </div>
          <button type="button" onClick={onRemove} aria-label={t(`حذف المعدة ${n}`, `Remove equipment ${n}`)} className="grid h-11 w-11 place-items-center rounded-lg text-ink-soft hover:bg-bad-soft hover:text-bad">✕</button>
        </div>
      </div>
    </div>
  );
}

/** Compact read-only equipment tag (lists, verification, permit). */
export function EquipmentTag({ e, t }: { e: Equipment; t: (a: string, b: string) => string }) {
  const k = EQUIPMENT_KINDS.find((x) => x.id === e.kind);
  return (
    <span className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface py-1 pe-2.5 ps-1">
      <span className="num grid h-7 min-w-7 place-items-center rounded-md bg-brand px-1.5 text-xs font-bold text-white">×{e.qty}</span>
      <span className="text-sm font-medium text-ink">{e.name}</span>
      {k && <span className="text-[11px] text-ink-soft">· {t(k.ar, k.en)}</span>}
      {e.serial && <span className="font-mono text-[11px] text-ink-soft" dir="ltr">#{e.serial}</span>}
    </span>
  );
}
