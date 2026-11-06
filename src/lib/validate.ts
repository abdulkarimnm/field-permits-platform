// Shared between browser and server – no server-only imports here.
import { isValidSaPlate, parseSaPlate } from "./plates";

/* ───────── Types ───────── */

export type Person = { name: string; id_number: string; nationality?: string };
export type Vehicle = { plate: string; type: string; kind?: "sa" | "other" };
export type Equipment = { name: string; qty: number; kind?: string; serial?: string };

export type RequestInput = {
  org_name: string;
  cr_number?: string;
  rep_name: string;
  rep_phone: string;
  rep_id: string;
  purpose: string;
  valid_from: string; // ISO
  valid_to: string;
  zones: number[];
  slot_date?: string | null; // planned entry slot (capacity booking)
  slot_hour?: number | null;
  people: Person[];
  vehicles: Vehicle[];
  equipment: Equipment[];
  declaration: boolean;
};

export const LIMITS = { people: 100, vehicles: 50, equipment: 50 };

/* ───────── Validation ───────── */

export type FieldError = { field: string; ar: string; en: string };

export function validateRequest(r: RequestInput): FieldError[] {
  const e: FieldError[] = [];
  const err = (field: string, ar: string, en: string) => e.push({ field, ar, en });
  if (!r.org_name?.trim()) err("org_name", "اسم الجهة مطلوب", "Organization name is required");
  if (r.cr_number && !/^\d{10}$/.test(r.cr_number)) err("cr_number", "السجل التجاري 10 أرقام", "CR number must be 10 digits");
  if (!r.rep_name?.trim()) err("rep_name", "اسم الممثل مطلوب", "Representative name is required");
  if (!/^05\d{8}$/.test(r.rep_phone ?? "")) err("rep_phone", "جوال الممثل بصيغة 05XXXXXXXX", "Phone must be 05XXXXXXXX");
  if (!/^[12]\d{9}$/.test(r.rep_id ?? "")) err("rep_id", "رقم هوية الممثل 10 أرقام يبدأ بـ1 أو 2", "ID must be 10 digits starting with 1 or 2");
  if (!r.purpose?.trim() || r.purpose.trim().length < 10) err("purpose", "اكتب الغرض بوضوح (10 أحرف على الأقل)", "Describe the purpose (min 10 chars)");
  const from = new Date(r.valid_from);
  const to = new Date(r.valid_to);
  if (isNaN(+from) || isNaN(+to)) err("valid_from", "حدد بداية ونهاية الصلاحية", "Set validity start and end");
  else {
    if (to <= from) err("valid_to", "نهاية الصلاحية يجب أن تكون بعد البداية", "End must be after start");
    if (to.getTime() < Date.now()) err("valid_to", "نهاية الصلاحية في الماضي", "End date is in the past");
    if (to.getTime() - from.getTime() > 90 * 86400_000) err("valid_to", "أقصى مدة للتصريح 90 يومًا", "Maximum validity is 90 days");
  }
  if (!r.zones?.length) err("zones", "اختر منطقة واحدة على الأقل", "Select at least one zone");
  if (!r.people?.length) err("people", "أضف فردًا واحدًا على الأقل", "Add at least one person");
  if (r.people.length > LIMITS.people) err("people", `الحد الأقصى ${LIMITS.people} فرد`, `Max ${LIMITS.people} people`);
  if (r.vehicles.length > LIMITS.vehicles) err("vehicles", `الحد الأقصى ${LIMITS.vehicles} مركبة`, `Max ${LIMITS.vehicles} vehicles`);
  if (r.equipment.length > LIMITS.equipment) err("equipment", `الحد الأقصى ${LIMITS.equipment} معدة`, `Max ${LIMITS.equipment} equipment`);
  const ids = new Set<string>();
  r.people.forEach((p, i) => {
    if (!p.name?.trim()) err(`people.${i}.name`, `الفرد ${i + 1}: الاسم مطلوب`, `Person ${i + 1}: name required`);
    if (!/^[12]\d{9}$/.test(p.id_number ?? "")) err(`people.${i}.id_number`, `الفرد ${i + 1}: رقم الهوية غير صحيح`, `Person ${i + 1}: invalid ID`);
    if (ids.has(p.id_number)) err(`people.${i}.id_number`, `الفرد ${i + 1}: رقم هوية مكرر`, `Person ${i + 1}: duplicate ID`);
    ids.add(p.id_number);
  });
  const plates = new Set<string>();
  r.vehicles.forEach((v, i) => {
    if (v.kind === "sa") {
      const sp = parseSaPlate(v.plate ?? "");
      if (!sp || !isValidSaPlate(sp)) err(`vehicles.${i}.plate`, `المركبة ${i + 1}: اللوحة السعودية من 1–3 حروف معتمدة و1–4 أرقام`, `Vehicle ${i + 1}: Saudi plate needs 1–3 approved letters and 1–4 digits`);
    } else if (!v.plate?.trim() || v.plate.replace(/\s/g, "").length < 3) err(`vehicles.${i}.plate`, `المركبة ${i + 1}: رقم اللوحة غير صحيح`, `Vehicle ${i + 1}: invalid plate`);
    const k = normPlate(v.plate);
    if (plates.has(k)) err(`vehicles.${i}.plate`, `المركبة ${i + 1}: لوحة مكررة`, `Vehicle ${i + 1}: duplicate plate`);
    plates.add(k);
  });
  r.equipment.forEach((x, i) => {
    if (!x.name?.trim() || !(x.qty >= 1)) err(`equipment.${i}`, `المعدة ${i + 1}: الاسم والعدد مطلوبان`, `Equipment ${i + 1}: name and qty required`);
  });
  if (r.vehicles.length && (!r.slot_date || r.slot_hour == null))
    err("slot", "اختر موعد الدخول من جدول السعة", "Pick an entry slot from the capacity grid");
  if (!r.declaration) err("declaration", "يجب الإقرار بصحة البيانات", "You must accept the declaration");
  return e;
}

export const normPlate = (p: string) => p.replace(/[\s-]/g, "").toUpperCase();

