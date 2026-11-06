"use server";
import { redirect } from "next/navigation";
import { requireCap } from "@/lib/auth";
import { setPermitStatus } from "@/lib/permits";

export async function permitStatusAction(fd: FormData) {
  const u = await requireCap("permit.manage");
  const id = Number(fd.get("id"));
  const action = String(fd.get("action"));
  if (!["suspend", "reactivate", "revoke"].includes(action)) redirect(`/staff/permits/${id}?err=bad_action`);
  let err: string | null = null;
  try {
    await setPermitStatus(u, id, action as "suspend", String(fd.get("reason") ?? "").trim().slice(0, 500));
  } catch (e) {
    err = e instanceof Error ? e.message : "failed";
  }
  redirect(`/staff/permits/${id}?${err ? "err=" + err : "done=1"}`);
}
