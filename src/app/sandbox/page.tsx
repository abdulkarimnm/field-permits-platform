import { notFound } from "next/navigation";
import { Masthead } from "@/components/Masthead";
import { i18n } from "@/lib/i18n";
import { getSetting } from "@/lib/settings";
import SandboxHub from "./SandboxHub";

export const metadata = { title: "مختبر الصلاحيات | تصاريح دخول الميدان" };

export default async function SandboxPage() {
  if (!(await getSetting("demo_mode"))) notFound();
  const { lang } = await i18n();
  return (
    <div className="flex min-h-dvh flex-col">
      <Masthead />
      <SandboxHub lang={lang} />
    </div>
  );
}
