import { Shell } from "@/components/Shell";
import { PageTitle } from "@/components/ui";
import { requireApplicant } from "@/lib/auth";
import { i18n } from "@/lib/i18n";
import { getOrg } from "@/lib/org";
import { APP_NAV } from "../nav";
import ProfileForm from "./ProfileForm";

export const dynamic = "force-dynamic";

export default async function OrgProfilePage() {
  const contact = await requireApplicant();
  const { t, lang } = await i18n();
  const org = (await getOrg(contact)) ?? { name: "", cr_number: "", rep_name: "", rep_phone: /^05\d{8}$/.test(contact) ? contact : "", rep_id: "", people: [], vehicles: [], equipment: [], teams: [] };
  return (
    <Shell nav={APP_NAV} active="/apply/profile" user={contact} kind="applicant" wide>
      <PageTitle
        title={t("ملف الجهة", "Organization profile")}
        sub={t("احفظ أفراد جهتك ومركباتها ومعداتها مرة واحدة، وكوّن فرق عمل تختارها بضغطة عند طلب أي تصريح لاحق.", "Save your people, vehicles and equipment once, and build teams you can pick in one tap for any later permit.")}
      />
      <ProfileForm init={org} lang={lang} />
    </Shell>
  );
}
