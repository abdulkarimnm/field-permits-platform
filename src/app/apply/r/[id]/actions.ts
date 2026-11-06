"use server";
import { revalidatePath } from "next/cache";
import { requireApplicant } from "@/lib/auth";
import { withdrawRequest } from "@/lib/permits";

export async function withdrawAction(fd: FormData) {
  const contact = await requireApplicant();
  const id = Number(fd.get("id"));
  try {
    await withdrawRequest(contact, id);
  } catch {}
  revalidatePath(`/apply/r/${id}`);
}
