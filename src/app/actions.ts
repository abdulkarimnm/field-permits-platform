"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { logout } from "@/lib/auth";

export async function setLangAction(formData: FormData) {
  const lang = formData.get("lang") === "en" ? "en" : "ar";
  (await cookies()).set("lang", lang, { path: "/", maxAge: 365 * 86400, sameSite: "lax" });
  const back = (await headers()).get("referer");
  redirect(back ? new URL(back).pathname + new URL(back).search : "/");
}

export async function logoutAction(formData: FormData) {
  const kind = formData.get("kind") === "staff" ? "staff" : "applicant";
  await logout(kind);
  redirect(kind === "staff" ? "/staff/login" : "/apply/login");
}
