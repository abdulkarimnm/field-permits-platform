"use server";
import { redirect } from "next/navigation";
import { type Role, requireCap } from "@/lib/auth";
import { q } from "@/lib/db";
import { audit } from "@/lib/audit";
import { hashPassword } from "@/lib/crypto";
import { setSetting, type StageRule } from "@/lib/settings";

const ROLES: Role[] = ["admin", "reviewer", "approver", "supervisor", "verifier", "opsmanager"];
const done = (tab: string, err?: string) => redirect(`/staff/admin?tab=${tab}${err ? `&err=${err}` : "&ok=1"}`);

export async function saveWorkflowAction(fd: FormData) {
  const u = await requireCap("settings.manage");
  const rule = (k: string): StageRule => {
    const v = String(fd.get(k) ?? "");
    return v.startsWith("user:") ? { type: "user", value: v.slice(5) } : { type: "role", value: v.replace("role:", "") };
  };
  const s1 = rule("stage1");
  const s2 = rule("stage2");
  const mode = String(fd.get("rep_otp_mode"));
  await setSetting("stage1", s1);
  await setSetting("stage2", s2);
  await setSetting("separation_of_duties", fd.get("sod") === "on");
  await setSetting("rep_otp_mode", (["off", "optional", "required"].includes(mode) ? mode : "optional") as never);
  await setSetting("demo_mode", fd.get("demo_mode") === "on");
  await audit(`user:${u.id}`, "settings.workflow_updated", "settings", null, { s1, s2, sod: fd.get("sod") === "on", mode });
  done("workflow");
}

export async function createUserAction(fd: FormData) {
  const u = await requireCap("settings.manage");
  const username = String(fd.get("username") ?? "").trim().toLowerCase();
  const name = String(fd.get("name") ?? "").trim();
  const password = String(fd.get("password") ?? "");
  const roles = ROLES.filter((r) => fd.get(`role_${r}`) === "on");
  if (!/^[a-z0-9._-]{3,32}$/.test(username) || !name || password.length < 10 || !roles.length) done("users", "invalid_user");
  try {
    await q(`INSERT INTO users(username,name,password_hash,roles,agency) VALUES ($1,$2,$3,$4,$5)`, [username, name, await hashPassword(password), roles, String(fd.get("agency") ?? "").trim() || null]);
  } catch {
    done("users", "exists");
  }
  await audit(`user:${u.id}`, "user.created", "user", username, { roles });
  done("users");
}

export async function updateUserAction(fd: FormData) {
  const u = await requireCap("settings.manage");
  const id = Number(fd.get("id"));
  const roles = ROLES.filter((r) => fd.get(`role_${r}`) === "on");
  const active = fd.get("active") === "on";
  if (id === u.id && (!active || !roles.includes("admin"))) done("users", "self_lockout");
  await q(`UPDATE users SET roles=$2, active=$3 WHERE id=$1`, [id, roles, active]);
  const pw = String(fd.get("password") ?? "");
  if (pw) {
    if (pw.length < 10) done("users", "weak_password");
    await q(`UPDATE users SET password_hash=$2, failed_attempts=0, locked_until=NULL WHERE id=$1`, [id, await hashPassword(pw)]);
    await q(`DELETE FROM sessions WHERE user_id=$1`, [id]);
  }
  if (!active) await q(`DELETE FROM sessions WHERE user_id=$1`, [id]);
  await audit(`user:${u.id}`, "user.updated", "user", id, { roles, active, password_reset: !!pw });
  done("users");
}

export async function saveZonesAction(fd: FormData) {
  const u = await requireCap("settings.manage");
  const ids = fd.getAll("zone_id").map(Number);
  for (const id of ids) {
    const cap = Math.max(0, Math.min(1000, Number(fd.get(`cap_${id}`)) || 0));
    await q(`UPDATE zones SET name_ar=$2, name_en=$3, capacity_per_hour=$4, sensitive=$5, active=$6 WHERE id=$1`, [
      id,
      String(fd.get(`ar_${id}`) ?? "").trim(),
      String(fd.get(`en_${id}`) ?? "").trim(),
      cap,
      fd.get(`sens_${id}`) === "on",
      fd.get(`act_${id}`) === "on",
    ]);
  }
  const nar = String(fd.get("new_ar") ?? "").trim();
  if (nar) {
    const code = String.fromCharCode(65 + ids.length);
    await q(`INSERT INTO zones(code,name_ar,name_en,capacity_per_hour,sensitive) VALUES ($1,$2,$3,$4,$5)`, [code + Date.now().toString(36).slice(-3), nar, String(fd.get("new_en") ?? nar), Number(fd.get("new_cap")) || 10, fd.get("new_sens") === "on"]);
  }
  // gates → zones
  for (const gid of fd.getAll("gate_id").map(Number)) {
    const zs = fd.getAll(`gate_${gid}`).map(Number);
    await q(`UPDATE gates SET zone_ids=$2 WHERE id=$1`, [gid, zs]);
  }
  await audit(`user:${u.id}`, "settings.zones_updated", "settings");
  done("zones");
}
