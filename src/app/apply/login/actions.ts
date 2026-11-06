"use server";
import { redirect } from "next/navigation";
import { checkOtp, normalizeContact, sendOtp, startApplicantSession } from "@/lib/auth";

export type SendState = { step: "contact" | "code"; contact?: string; error?: string; info?: string };

export async function sendCodeAction(_: SendState, fd: FormData): Promise<SendState> {
  const c = normalizeContact(String(fd.get("contact") ?? ""));
  if (!c) return { step: "contact", error: "invalid_contact" };
  const r = await sendOtp("login", c.value, {
    ttlMin: 10,
    text: (code) => `رمز الدخول إلى بوابة تصاريح ميدان سيد الشهداء: ${code} — صالح 10 دقائق.`,
  });
  if (!r.ok) return { step: fd.get("resend") ? "code" : "contact", contact: c.value, error: r.error, info: r.wait ? String(r.wait) : undefined };
  return { step: "code", contact: c.value };
}

export async function verifyCodeAction(_: SendState, fd: FormData): Promise<SendState> {
  const contact = String(fd.get("contact") ?? "");
  const code = String(fd.get("code") ?? "").replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  const r = await checkOtp("login", contact, code);
  if (!r.ok) return { step: "code", contact, error: r.error };
  await startApplicantSession(contact);
  redirect("/apply");
}
