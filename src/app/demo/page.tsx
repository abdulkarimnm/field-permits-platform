import { notFound } from "next/navigation";
import { Masthead } from "@/components/Masthead";
import { i18n } from "@/lib/i18n";
import { getSetting } from "@/lib/settings";
import Experience from "./Experience";

export const metadata = { title: "عِش التجربة | تصاريح دخول الميدان" };

export default async function DemoPage() {
  if (!(await getSetting("demo_mode"))) notFound();
  const { lang } = await i18n();
  return (
    <div className="flex min-h-dvh flex-col">
      <Masthead />
      <Experience lang={lang} />
    </div>
  );
}
