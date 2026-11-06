import { redirect } from "next/navigation";
import { getStaff } from "@/lib/auth";
import { i18n } from "@/lib/i18n";
import { Shell } from "@/components/Shell";
import { can } from "@/lib/rbac";

/**
 * Opened when a normal camera app follows the printed QR.
 * Shows nothing about the permit unless an authorized verifier is signed in.
 */
export default async function PublicQr({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const u = await getStaff();
  if (u && can(u, "verify.scan")) redirect(`/verify?code=${encodeURIComponent(token)}`);
  const { t } = await i18n();
  return (
    <Shell>
      <div className="mx-auto max-w-md pt-10 text-center">
        <h1 className="text-xl font-bold">{t("هذا الرمز للتحقق الرسمي فقط", "This code is for official verification only")}</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          {t(
            "لا تُعرض بيانات التصاريح إلا للجهات المختصة بعد تسجيل دخولها في بوابة التحقق. إن وصلك هذا الرمز من موقع آخر فقد يكون مزيفًا.",
            "Permit data is shown only to authorized agencies signed in to the verification portal. If this code led you to another site, it may be fake.",
          )}
        </p>
      </div>
    </Shell>
  );
}
