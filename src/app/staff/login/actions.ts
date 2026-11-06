"use server";
import { redirect } from "next/navigation";
import { getStaff, staffLogin } from "@/lib/auth";

export async function staffLoginAction(_: { error: null | "invalid" | "locked" }, fd: FormData) {
  const r = await staffLogin(String(fd.get("username") ?? ""), String(fd.get("password") ?? ""));
  if (!r.ok) return { error: r.error };
  const next = String(fd.get("next") ?? "");
  if (next.startsWith("/") && !next.startsWith("//")) redirect(next);
  const u = await getStaff();
  redirect(u?.roles.length === 1 && u.roles[0] === "verifier" ? "/verify" : "/staff");
}
