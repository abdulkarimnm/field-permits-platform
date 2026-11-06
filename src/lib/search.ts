import "server-only";
import { q } from "./db";
import type { RequestStatus } from "./permits";

export type SearchFilters = { q?: string; status?: string; zone?: string; from?: string; to?: string };
export type SearchRow = {
  id: number;
  ref: string;
  kind: string;
  status: RequestStatus;
  org_name: string;
  rep_phone: string;
  contact: string;
  valid_from: Date;
  valid_to: Date;
  zones: number[];
  lane: string;
  risk_score: number;
  submitted_at: Date;
  people_n: number;
  vehicles_n: number;
  permit_id: number | null;
  permit_number: string | null;
  permit_status: string | null;
  permit_version: number | null;
};

/** Search by number, org, phone, plate or ID; filter by status (request or live permit), zone and period. */
export async function searchRequests(f: SearchFilters, limit = 200) {
  const where: string[] = [];
  const params: unknown[] = [];
  const p = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  if (f.q?.trim()) {
    const term = f.q.trim();
    const like = p(`%${term}%`);
    const plate = p(`%${term.replace(/[\s-]/g, "").toUpperCase()}%`);
    where.push(`(r.ref ILIKE ${like} OR pm.number ILIKE ${like} OR r.org_name ILIKE ${like} OR r.rep_phone ILIKE ${like} OR r.contact ILIKE ${like}
      OR r.rep_id ILIKE ${like}
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(r.people) x WHERE x->>'id_number' ILIKE ${like} OR x->>'name' ILIKE ${like})
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(r.vehicles) x WHERE upper(replace(replace(x->>'plate',' ',''),'-','')) LIKE ${plate}))`);
  }
  const s = f.status;
  if (s && ["pending_review", "pending_approval", "returned", "rejected", "approved", "withdrawn"].includes(s)) where.push(`r.status = ${p(s)}`);
  if (s === "valid") where.push(`pm.status='active' AND now() BETWEEN pm.valid_from AND pm.valid_to`);
  if (s === "not_started") where.push(`pm.status='active' AND now() < pm.valid_from`);
  if (s === "expired") where.push(`pm.status='active' AND now() > pm.valid_to`);
  if (s === "suspended" || s === "revoked") where.push(`pm.status = ${p(s)}`);
  if (f.zone) where.push(`${p(Number(f.zone))} = ANY(r.zones)`);
  if (f.from) where.push(`r.valid_to >= ${p(f.from)}::date`);
  if (f.to) where.push(`r.valid_from < (${p(f.to)}::date + 1)`);
  return q<SearchRow>(
    `SELECT r.id, r.ref, r.kind, r.status, r.org_name, r.rep_phone, r.contact, r.valid_from, r.valid_to, r.zones, r.lane, r.risk_score, r.submitted_at,
       jsonb_array_length(r.people)::int people_n, jsonb_array_length(r.vehicles)::int vehicles_n,
       pm.id permit_id, pm.number permit_number, pm.status permit_status, pm.version permit_version
     FROM requests r LEFT JOIN permits pm ON pm.id = r.permit_id
     ${where.length ? "WHERE " + where.join(" AND ") : ""}
     ORDER BY r.id DESC LIMIT ${Number(limit)}`,
    params,
  );
}
