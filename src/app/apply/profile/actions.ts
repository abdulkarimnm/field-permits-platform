"use server";
import { revalidatePath } from "next/cache";
import { requireApplicant } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { saveOrg, saveTeamFrom, type OrgProfile, type Team } from "@/lib/org";
import { isValidSaPlate, parseSaPlate } from "@/lib/plates";
import type { Equipment, Person, Vehicle } from "@/lib/validate";

export type ProfileState = { ok?: boolean; errors: string[]; counts?: { people: number; vehicles: number; equipment: number; teams: number } };

const str = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
const ID_RE = /^[12]\d{9}$/;

function sanitize(raw: Partial<OrgProfile>) {
  const errors: string[] = [];
  const people: Person[] = (Array.isArray(raw.people) ? raw.people : []).slice(0, 300).map((p) => ({ name: str(p?.name, 120), id_number: str(p?.id_number, 10).replace(/\D/g, "") })).filter((p) => p.name || p.id_number);
  people.forEach((p, i) => {
    if (!p.name) errors.push(`الفرد ${i + 1}: الاسم مطلوب`);
    if (!ID_RE.test(p.id_number)) errors.push(`الفرد ${i + 1} (${p.name || "—"}): رقم الهوية 10 أرقام يبدأ بـ1 أو 2`);
  });
  const vehicles: Vehicle[] = (Array.isArray(raw.vehicles) ? raw.vehicles : []).slice(0, 150).map((v) => ({ plate: str(v?.plate, 20), type: str(v?.type, 60), kind: v?.kind === "other" ? "other" : "sa" } as Vehicle)).filter((v) => v.plate || v.type);
  vehicles.forEach((v, i) => {
    if (v.kind === "sa") { const sp = parseSaPlate(v.plate); if (!sp || !isValidSaPlate(sp)) errors.push(`المركبة ${i + 1}: اللوحة السعودية من 1–3 حروف معتمدة و1–4 أرقام`); }
    else if (v.plate.replace(/\s/g, "").length < 3) errors.push(`المركبة ${i + 1}: رقم اللوحة غير صحيح`);
  });
  const equipment: Equipment[] = (Array.isArray(raw.equipment) ? raw.equipment : []).slice(0, 150).map((x) => ({
    name: str(x?.name, 120), qty: Math.max(1, Math.min(999, Math.floor(Number(x?.qty) || 1))), ...(x?.kind ? { kind: str(x.kind, 20) } : {}), ...(x?.serial ? { serial: str(x.serial, 40) } : {}),
  })).filter((x) => x.name);
  const teams: Team[] = (Array.isArray(raw.teams) ? raw.teams : []).slice(0, 30).map((t) => ({
    id: str(t?.id, 60), name: str(t?.name, 60),
    people: (Array.isArray(t?.people) ? t.people : []).map((x) => str(x, 10)), vehicles: (Array.isArray(t?.vehicles) ? t.vehicles : []).map((x) => str(x, 20)), equipment: (Array.isArray(t?.equipment) ? t.equipment : []).map((x) => str(x, 120)),
    updated_at: t?.updated_at ? str(t.updated_at, 40) : undefined,
  }));
  teams.forEach((t, i) => !t.name && errors.push(`الفريق ${i + 1}: اسم الفريق مطلوب`));
  const org = { name: str(raw.name, 200), cr_number: str(raw.cr_number, 10).replace(/\D/g, ""), rep_name: str(raw.rep_name, 120), rep_phone: str(raw.rep_phone, 10).replace(/\D/g, ""), rep_id: str(raw.rep_id, 10).replace(/\D/g, "") };
  if (!org.name) errors.push("اسم الجهة مطلوب");
  if (org.cr_number && !/^\d{10}$/.test(org.cr_number)) errors.push("السجل التجاري 10 أرقام");
  if (org.rep_phone && !/^05\d{8}$/.test(org.rep_phone)) errors.push("جوال الممثل بصيغة 05XXXXXXXX");
  if (org.rep_id && !ID_RE.test(org.rep_id)) errors.push("هوية الممثل 10 أرقام تبدأ بـ1 أو 2");
  return { data: { ...org, people, vehicles, equipment, teams } as OrgProfile, errors };
}

export async function saveProfileAction(_: ProfileState, fd: FormData): Promise<ProfileState> {
  const contact = await requireApplicant();
  let raw: Partial<OrgProfile>;
  try { raw = JSON.parse(String(fd.get("payload") ?? "{}")); } catch { return { errors: ["تعذر قراءة البيانات"] }; }
  const { data, errors } = sanitize(raw);
  if (errors.length) return { errors: errors.slice(0, 8) };
  const counts = await saveOrg(contact, data);
  await audit(`applicant:${contact}`, "org.profile_saved", "org", contact, counts);
  revalidatePath("/apply/profile");
  return { ok: true, errors: [], counts };
}

/** From the request form: "save this list as a team". */
export async function saveTeamFromRequestAction(input: { name: string; people: Person[]; vehicles: Vehicle[]; equipment: Equipment[]; org: { name: string; cr_number?: string; rep_name: string; rep_phone: string; rep_id: string } }) {
  const contact = await requireApplicant();
  const name = str(input.name, 60);
  if (!name) return { ok: false as const, error: "اسم الفريق مطلوب" };
  const { data, errors } = sanitize({ people: input.people, vehicles: input.vehicles, equipment: input.equipment, name: input.org.name || "—" });
  const bad = errors.filter((e) => e.startsWith("الفرد") || e.startsWith("المركبة"));
  if (bad.length) return { ok: false as const, error: `صحّح القائمة أولًا: ${bad[0]}` };
  const team = await saveTeamFrom(contact, name, data, { name: input.org.name, cr_number: input.org.cr_number ?? "", rep_name: input.org.rep_name, rep_phone: input.org.rep_phone, rep_id: input.org.rep_id });
  await audit(`applicant:${contact}`, "org.team_saved", "org", contact, { team: team.name, people: team.people.length });
  return { ok: true as const, team };
}
