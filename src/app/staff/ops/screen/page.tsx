import { requireCap } from "@/lib/auth";
import { i18n } from "@/lib/i18n";
import { screenData } from "@/lib/screen";
import { listGates } from "@/lib/settings";
import OpsScreen from "./OpsScreen";

export const dynamic = "force-dynamic";
export const metadata = { title: "شاشة العمليات | Operations screen" };

export default async function ScreenPage() {
  await requireCap("ops.view");
  const { lang } = await i18n();
  const [data, gates] = await Promise.all([screenData(), listGates()]);
  return <OpsScreen initial={data} lang={lang} gateZones={gates.map((g) => ({ id: g.id, zone_ids: g.zone_ids }))} />;
}
