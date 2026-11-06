import "server-only";
import { headers } from "next/headers";
import { getApplicant, getStaff } from "./auth";
import type { PermitRow } from "./permits";
import { can } from "@/lib/rbac";

/** Owner (applicant contact) or back-office staff may open a permit document. */
export async function canViewPermit(p: Pick<PermitRow, "contact">) {
  const staff = await getStaff();
  if (staff && can(staff, "request.view")) return { who: `user:${staff.id}` };
  const app = await getApplicant();
  if (app && app === p.contact) return { who: `applicant:${app}` };
  return null;
}

export async function baseUrl() {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/$/, "");
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${h.get("host")}`;
}

/** Same-origin check for JSON API POSTs (server actions already enforce this). */
export async function sameOrigin() {
  const h = await headers();
  const origin = h.get("origin");
  return !origin || new URL(origin).host === h.get("host");
}
