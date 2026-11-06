import { Shell, staffNav } from "@/components/Shell";
import { requireCap } from "@/lib/auth";
import { i18n } from "@/lib/i18n";
import { getSetting, listGates } from "@/lib/settings";
import VerifyApp from "./VerifyApp";

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const u = await requireCap("verify.scan");
  const { lang } = await i18n();
  const [gates, mode] = await Promise.all([listGates(), getSetting("rep_otp_mode")]);
  const { code } = await searchParams;
  return (
    <Shell nav={u.roles.length === 1 && u.roles[0] === "verifier" ? [] : staffNav(u.roles)} active="/verify" user={`${u.name}${u.agency ? " · " + u.agency : ""}`} kind="staff">
      <VerifyApp lang={lang} gates={gates} initialCode={code ?? null} repOtpMode={mode} />
    </Shell>
  );
}
