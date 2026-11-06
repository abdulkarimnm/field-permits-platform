import "server-only";
import { randomUUID } from "node:crypto";
import { q1 } from "./db";
import { normPlate, type Equipment, type Person, type Vehicle } from "./validate";

/* Organization profile ("ملف الجهة"): the org's usual people, vehicles and equipment (the roster),
   plus named work teams built from that roster. A team is a reusable selection:
   pick it in a new request, then add / edit / remove anyone for that request only. */

export type Team = { id: string; name: string; people: string[]; vehicles: string[]; equipment: string[]; updated_at?: string };
export type OrgProfile = {
  name: string; cr_number: string; rep_name: string; rep_phone: string; rep_id: string;
  people: Person[]; vehicles: Vehicle[]; equipment: Equipment[]; teams: Team[];
};

type Exec = { query: <T>(sql: string, params?: unknown[]) => Promise<T[]> };

export async function getOrg(contact: string): Promise<OrgProfile | null> {
  const r = await q1<OrgProfile & { cr_number: string | null }>(`SELECT * FROM orgs WHERE contact=$1`, [contact]);
  if (!r) return null;
  return { ...r, cr_number: r.cr_number ?? "", people: r.people ?? [], vehicles: r.vehicles ?? [], equipment: r.equipment ?? [], teams: r.teams ?? [] };
}

const keyP = (p: Person) => p.id_number;
const keyV = (v: Vehicle) => normPlate(v.plate);
const keyE = (e: Equipment) => e.name.trim();

function uniq<T>(list: T[], key: (x: T) => string) {
  const m = new Map<string, T>();
  for (const x of list) if (key(x)) m.set(key(x), x);
  return [...m.values()];
}

/** Teams only reference members that still exist in the roster. */
function cleanTeams(teams: Team[], o: Pick<OrgProfile, "people" | "vehicles" | "equipment">): Team[] {
  const P = new Set(o.people.map(keyP)), V = new Set(o.vehicles.map(keyV)), E = new Set(o.equipment.map(keyE));
  return teams
    .filter((t) => t.name?.trim())
    .slice(0, 30)
    .map((t) => ({
      id: t.id || randomUUID(), name: t.name.trim().slice(0, 60),
      people: [...new Set(t.people)].filter((x) => P.has(x)), vehicles: [...new Set(t.vehicles)].filter((x) => V.has(x)), equipment: [...new Set(t.equipment)].filter((x) => E.has(x)),
      updated_at: t.updated_at ?? new Date().toISOString(),
    }));
}

export async function saveOrg(contact: string, o: OrgProfile) {
  const people = uniq(o.people, keyP).slice(0, 300);
  const vehicles = uniq(o.vehicles, keyV).slice(0, 150);
  const equipment = uniq(o.equipment, keyE).slice(0, 150);
  const teams = cleanTeams(o.teams, { people, vehicles, equipment });
  await q1(
    `INSERT INTO orgs(contact,name,cr_number,rep_name,rep_phone,rep_id,people,vehicles,equipment,teams,updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
     ON CONFLICT (contact) DO UPDATE SET name=$2,cr_number=$3,rep_name=$4,rep_phone=$5,rep_id=$6,people=$7,vehicles=$8,equipment=$9,teams=$10,updated_at=now()`,
    [contact, o.name, o.cr_number || null, o.rep_name, o.rep_phone, o.rep_id, JSON.stringify(people), JSON.stringify(vehicles), JSON.stringify(equipment), JSON.stringify(teams)],
  );
  return { people: people.length, vehicles: vehicles.length, equipment: equipment.length, teams: teams.length };
}

/** After a request is submitted: keep org/rep details current and ADD any new people, vehicles
 *  and equipment to the roster (never removes anything the org curated, never touches teams). */
export async function mergeIntoRoster(e: Exec, contact: string, r: { org_name: string; cr_number?: string; rep_name: string; rep_phone: string; rep_id: string; people: Person[]; vehicles: Vehicle[]; equipment: Equipment[] }) {
  const cur = (await e.query<{ people: Person[]; vehicles: Vehicle[]; equipment: Equipment[] }>(`SELECT people, vehicles, equipment FROM orgs WHERE contact=$1 FOR UPDATE`, [contact]))[0];
  const merge = <T,>(a: T[], b: T[], key: (x: T) => string) => uniq([...(a ?? []), ...b], key); // request data wins (latest spelling)
  const people = merge(cur?.people ?? [], r.people, keyP).slice(0, 300);
  const vehicles = merge(cur?.vehicles ?? [], r.vehicles, keyV).slice(0, 150);
  const equipment = merge(cur?.equipment ?? [], r.equipment, keyE).slice(0, 150);
  await e.query(
    `INSERT INTO orgs(contact,name,cr_number,rep_name,rep_phone,rep_id,people,vehicles,equipment,updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
     ON CONFLICT (contact) DO UPDATE SET name=$2,cr_number=$3,rep_name=$4,rep_phone=$5,rep_id=$6,people=$7,vehicles=$8,equipment=$9,updated_at=now()`,
    [contact, r.org_name, r.cr_number || null, r.rep_name, r.rep_phone, r.rep_id, JSON.stringify(people), JSON.stringify(vehicles), JSON.stringify(equipment)],
  );
}

/** Save the people/vehicles/equipment of a request form as a named team (adds them to the roster too). */
export async function saveTeamFrom(contact: string, name: string, data: { people: Person[]; vehicles: Vehicle[]; equipment: Equipment[] }, base: Pick<OrgProfile, "name" | "cr_number" | "rep_name" | "rep_phone" | "rep_id">) {
  const cur = (await getOrg(contact)) ?? { ...base, people: [], vehicles: [], equipment: [], teams: [] };
  const people = uniq([...cur.people, ...data.people], keyP);
  const vehicles = uniq([...cur.vehicles, ...data.vehicles], keyV);
  const equipment = uniq([...cur.equipment, ...data.equipment], keyE);
  const existing = cur.teams.find((t) => t.name.trim() === name.trim());
  const team: Team = { id: existing?.id ?? randomUUID(), name, people: data.people.map(keyP), vehicles: data.vehicles.map(keyV), equipment: data.equipment.map(keyE), updated_at: new Date().toISOString() };
  const teams = existing ? cur.teams.map((t) => (t.id === existing.id ? team : t)) : [...cur.teams, team];
  await saveOrg(contact, { ...cur, name: cur.name || base.name, rep_name: cur.rep_name || base.rep_name, rep_phone: cur.rep_phone || base.rep_phone, rep_id: cur.rep_id || base.rep_id, people, vehicles, equipment, teams });
  return team;
}

export const teamKeys = { person: keyP, vehicle: keyV, equipment: keyE };
