import { notFound, redirect } from "next/navigation";
import { getApplicant } from "@/lib/auth";
import { getPermit, liveStatus, LIVE_LABEL } from "@/lib/permits";
import { listZones } from "@/lib/settings";
import { audit } from "@/lib/audit";
import { i18n } from "@/lib/i18n";
import RotatingPass from "./RotatingPass";

export default async function Pass({ params }: { params: Promise<{ id: string }> }) {
  const contact = await getApplicant();
  if (!contact) redirect("/apply/login");
  const { id } = await params;
  const p = await getPermit(Number(id));
  if (!p || p.contact !== contact) notFound();
  const { lang } = await i18n();
  const status = liveStatus(p);
  await audit(`applicant:${contact}`, "permit.pass_opened", "permit", p.id);
  const zones = (await listZones(true)).filter((z) => p.zones.includes(z.id)).map((z) => (lang === "ar" ? z.name_ar : z.name_en));
  return (
    <RotatingPass
      lang={lang}
      number={p.number}
      secret={p.rot_secret}
      status={status}
      statusLabel={LIVE_LABEL[status][lang === "ar" ? 0 : 1]}
      org={p.org_name}
      rep={p.data.rep_name}
      from={new Date(p.valid_from).toISOString()}
      to={new Date(p.valid_to).toISOString()}
      zones={zones}
      counts={{ people: p.data.people.length, vehicles: p.data.vehicles.length, equipment: p.data.equipment.length }}
      version={p.version}
    />
  );
}
