"use server";
import { redirect } from "next/navigation";
import { requireCap } from "@/lib/auth";
import { decide, type Decision } from "@/lib/permits";

export async function decideAction(fd: FormData) {
  const u = await requireCap("request.view");
  const id = Number(fd.get("id"));
  const decision = String(fd.get("decision")) as Decision;
  if (!["approve", "reject", "return"].includes(decision)) redirect(`/staff/r/${id}?err=bad`);
  let err: string | null = null;
  try {
    await decide(u, id, decision, String(fd.get("reason") ?? "").trim().slice(0, 1000));
  } catch (e) {
    err = e instanceof Error ? e.message : "failed";
  }
  redirect(`/staff/r/${id}?${err ? `err=${err}` : "done=1"}`);
}
