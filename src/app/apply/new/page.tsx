import { notFound } from "next/navigation";
import { Shell } from "@/components/Shell";
import { PageTitle } from "@/components/ui";
import { requireApplicant } from "@/lib/auth";
import { q1 } from "@/lib/db";
import { i18n } from "@/lib/i18n";
import { listZones } from "@/lib/settings";
import type { PermitRow, RequestRow } from "@/lib/permits";
import RequestForm, { type FormInit, type SavedTeam } from "./RequestForm";
import { APP_NAV } from "../nav";

export default async function NewRequest({ searchParams }: { searchParams: Promise<{ from?: string; resubmit?: string; amend?: string; team?: string }> }) {
  const contact = await requireApplicant();
  const sp = await searchParams;
  const { t, lang } = await i18n();
  const zones = await listZones();
  let init: FormInit = { mode: "new" };
  const org = await q1<{ name: string; cr_number: string; rep_name: string; rep_phone: string; rep_id: string } & SavedTeam>(`SELECT * FROM orgs WHERE contact=$1`, [contact]);
  const saved: SavedTeam | undefined = org ? { people: org.people ?? [], vehicles: org.vehicles ?? [], equipment: org.equipment ?? [], teams: org.teams ?? [] } : undefined;
  let title = t("طلب تصريح جديد", "New permit request");

  if (sp.resubmit) {
    const r = await q1<RequestRow>(`SELECT * FROM requests WHERE id=$1 AND contact=$2 AND status='returned'`, [Number(sp.resubmit), contact]);
    if (!r) notFound();
    init = { ...fromRow(r), mode: "resubmit", id: r.id, permitId: r.permit_id ?? undefined, reason: r.reason };
    title = t(`استكمال الطلب ${r.ref}`, `Complete request ${r.ref}`);
  } else if (sp.amend) {
    const p = await q1<PermitRow>(`SELECT * FROM permits WHERE id=$1 AND contact=$2 AND status <> 'revoked'`, [Number(sp.amend), contact]);
    if (!p) notFound();
    init = { ...p.data, valid_from: new Date(p.valid_from).toISOString(), valid_to: new Date(p.valid_to).toISOString(), mode: "amend", permitId: p.id };
    title = t(`طلب تعديل التصريح ${p.number}`, `Amend permit ${p.number}`);
  } else if (sp.from) {
    const r = await q1<RequestRow>(`SELECT * FROM requests WHERE id=$1 AND contact=$2`, [Number(sp.from), contact]);
    if (!r) notFound();
    init = { ...fromRow(r), valid_from: undefined, valid_to: undefined, slot_date: null, slot_hour: null, mode: "new" };
    title = t(`طلب مماثل لـ ${r.ref}`, `Similar to ${r.ref}`);
  } else {
    if (org) init = { mode: "new", org_name: org.name, cr_number: org.cr_number, rep_name: org.rep_name, rep_phone: org.rep_phone, rep_id: org.rep_id };
    else if (/^05\d{8}$/.test(contact)) init = { mode: "new", rep_phone: contact };
  }

  return (
    <Shell nav={APP_NAV} active="/apply/new" user={contact} kind="applicant" wide>
      <PageTitle title={title} sub={t("ثمانية أقسام، والمعدات والمركبات والمرفقات تُتجاوز إن لم توجد. يتحقق النظام من البيانات أثناء الكتابة وتُحفظ مسودتك تلقائيًا.", "Eight sections; skip vehicles, equipment and files if none. Data is checked as you type and your draft is saved automatically.")} />
      <RequestForm init={init} zones={zones} lang={lang} saved={saved} teamId={sp.team} />
    </Shell>
  );
}

function fromRow(r: RequestRow) {
  return {
    org_name: r.org_name, cr_number: r.cr_number ?? undefined, rep_name: r.rep_name, rep_phone: r.rep_phone, rep_id: r.rep_id, purpose: r.purpose,
    valid_from: new Date(r.valid_from).toISOString(), valid_to: new Date(r.valid_to).toISOString(), zones: r.zones,
    slot_date: r.slot_date ? String(r.slot_date).slice(0, 10) : null, slot_hour: r.slot_hour, people: r.people, vehicles: r.vehicles, equipment: r.equipment,
  };
}
