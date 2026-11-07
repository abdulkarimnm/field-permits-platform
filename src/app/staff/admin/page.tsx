import Link from "next/link";
import { Shell, staffNav } from "@/components/Shell";
import { Alert, btn, Card, input, label, PageTitle } from "@/components/ui";
import { requireCap } from "@/lib/auth";
import { q } from "@/lib/db";
import { i18n } from "@/lib/i18n";
import { getSetting, listGates, listZones } from "@/lib/settings";
import { createUserAction, saveWorkflowAction, saveZonesAction, updateUserAction } from "./actions";

const ROLE_LABEL: Record<string, [string, string]> = {
  admin: ["مسؤول النظام", "Admin"],
  reviewer: ["مراجع أولي", "Initial reviewer"],
  approver: ["معتمد نهائي", "Final approver"],
  supervisor: ["مشرف الميدان", "Field supervisor"],
  verifier: ["متحقق ميداني", "Field verifier"],
  opsmanager: ["مدير التشغيل", "Operations manager"],
};

export default async function Admin({ searchParams }: { searchParams: Promise<{ tab?: string; err?: string; ok?: string }> }) {
  const u = await requireCap("settings.manage");
  const { t } = await i18n();
  const sp = await searchParams;
  const tab = sp.tab ?? "workflow";
  const [users, zones, gates, s1, s2, sod, mode, demo] = await Promise.all([
    q<{ id: number; username: string; name: string; roles: string[]; agency: string | null; active: boolean; locked_until: Date | null }>(`SELECT * FROM users ORDER BY id`),
    listZones(true),
    listGates(),
    getSetting("stage1"),
    getSetting("stage2"),
    getSetting("separation_of_duties"),
    getSetting("rep_otp_mode"),
    getSetting("demo_mode"),
  ]);
  const ruleValue = (r: { type: string; value: string }) => `${r.type}:${r.value}`;
  const tabs = [
    ["workflow", t("مسار الاعتماد", "Workflow")],
    ["users", t("المستخدمون والأدوار", "Users & roles")],
    ["zones", t("المناطق والبوابات", "Zones & gates")],
  ];
  const ERR: Record<string, [string, string]> = {
    invalid_user: ["تحقق من البيانات: اسم مستخدم (3-32 حرفًا لاتينيًا)، كلمة مرور 10 أحرف على الأقل، ودور واحد", "Check: username 3-32 latin chars, password ≥10, at least one role"],
    exists: ["اسم المستخدم موجود", "Username exists"],
    self_lockout: ["لا يمكنك إيقاف حسابك أو إزالة دور المسؤول عن نفسك", "You can't deactivate yourself or drop your admin role"],
    weak_password: ["كلمة المرور قصيرة", "Password too short"],
  };
  const StageSelect = ({ name, value }: { name: string; value: string }) => (
    <select name={name} defaultValue={value} className={input}>
      <optgroup label={t("دور", "Role")}>
        {Object.entries(ROLE_LABEL).filter(([k]) => k !== "verifier").map(([k, v]) => <option key={k} value={`role:${k}`}>{t(...v)}</option>)}
      </optgroup>
      <optgroup label={t("شخص محدد", "Specific person")}>
        {users.filter((x) => x.active).map((x) => <option key={x.id} value={`user:${x.id}`}>{x.name} ({x.username})</option>)}
      </optgroup>
    </select>
  );

  return (
    <Shell nav={staffNav(u.roles)} active="/staff/admin" user={u.name} kind="staff" wide>
      <PageTitle title={t("الإعدادات", "Settings")} />
      <div className="mb-5 flex gap-1 overflow-x-auto rounded-xl bg-surface p-1">
        {tabs.map(([k, l]) => (
          <Link key={k} href={`?tab=${k}`} className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold ${tab === k ? "bg-brand text-white" : "text-ink-soft hover:text-ink"}`}>{l}</Link>
        ))}
      </div>
      {sp.err && <div className="mb-4"><Alert tone="bad">{t(...(ERR[sp.err] ?? ["تعذر الحفظ", "Save failed"]))}</Alert></div>}
      {sp.ok && <div className="mb-4"><Alert tone="ok">{t("تم الحفظ وتسجيل التغيير.", "Saved and logged.")}</Alert></div>}

      {tab === "workflow" && (
        <form action={saveWorkflowAction} className="grid gap-5 lg:grid-cols-2">
          <Card title={t("المسؤول عن كل مرحلة", "Owner of each stage")}>
            <div className="space-y-4">
              <div><label className={label}>{t("المرحلة 1: المراجعة الأولية", "Stage 1: initial review")}</label><StageSelect name="stage1" value={ruleValue(s1)} /></div>
              <div><label className={label}>{t("المرحلة 2: الاعتماد النهائي", "Stage 2: final approval")}</label><StageSelect name="stage2" value={ruleValue(s2)} /></div>
              <label className="flex items-start gap-3">
                <input type="checkbox" name="sod" defaultChecked={sod} className="mt-1 h-4 w-4 accent-brand" />
                <span className="text-sm">{t("منع نفس الشخص من تنفيذ المرحلتين (فصل المهام)", "Prevent the same person from doing both stages (separation of duties)")}</span>
              </label>
            </div>
          </Card>
          <Card title={t("التحقق الميداني والتشغيل", "Field checks & operation")}>
            <fieldset className="space-y-2">
              <legend className={label}>{t("رمز الممثل المؤقت عند الدخول", "Representative code at entry")}</legend>
              {[
                ["off", t("غير مفعل", "Off")],
                ["optional", t("اختياري للمتحقق", "Optional")],
                ["required", t("إلزامي قبل السماح بالدخول", "Required before allowing entry")],
              ].map(([k, l]) => (
                <label key={k} className="flex items-center gap-3 text-sm">
                  <input type="radio" name="rep_otp_mode" value={k} defaultChecked={mode === k} className="h-4 w-4 accent-brand" /> {l}
                </label>
              ))}
            </fieldset>
            <label className="mt-5 flex items-start gap-3">
              <input type="checkbox" name="demo_mode" defaultChecked={demo} className="mt-1 h-4 w-4 accent-brand" />
              <span className="text-sm">
                {t("وضع التجربة الداخلية: عرض الرسائل في صندوق تجريبي بدل إرسالها", "Internal trial mode: show messages in a test outbox instead of sending")}
                <span className="block text-xs text-ink-soft">{t("يُعطّل قبل الإطلاق بعد ربط بوابة الرسائل.", "Turn off before launch once the SMS gateway is connected.")}</span>
              </span>
            </label>
          </Card>
          <div className="lg:col-span-2"><button className={btn.primary}>{t("حفظ", "Save")}</button></div>
        </form>
      )}

      {tab === "users" && (
        <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
          <Card title={t("المستخدمون", "Users")}>
            <ul className="-my-3 divide-y divide-line">
              {users.map((x) => (
                <li key={x.id} className="py-3">
                  <form action={updateUserAction} className="space-y-2">
                    <input type="hidden" name="id" value={x.id} />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span><b>{x.name}</b> <span className="num text-xs text-ink-soft">@{x.username}</span>{x.agency && <span className="text-xs text-ink-soft"> · {x.agency}</span>}</span>
                      <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="active" defaultChecked={x.active} className="accent-brand" /> {t("نشط", "Active")}</label>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      {Object.entries(ROLE_LABEL).map(([k, v]) => (
                        <label key={k} className="flex items-center gap-1.5 text-xs"><input type="checkbox" name={`role_${k}`} defaultChecked={x.roles.includes(k)} className="accent-brand" /> {t(...v)}</label>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input name="password" type="password" autoComplete="new-password" className={`${input} py-1.5 text-sm`} placeholder={t("كلمة مرور جديدة (اختياري)", "New password (optional)")} aria-label={t("كلمة مرور جديدة", "New password")} />
                      <button className={`${btn.secondary} min-h-9 py-1.5`}>{t("تحديث", "Update")}</button>
                    </div>
                  </form>
                </li>
              ))}
            </ul>
          </Card>
          <Card title={t("مستخدم جديد", "New user")}>
            <form action={createUserAction} className="space-y-3">
              <input name="name" required className={input} placeholder={t("الاسم", "Name")} aria-label={t("الاسم", "Name")} />
              <input name="username" required dir="ltr" className={input} placeholder="username" aria-label={t("اسم المستخدم", "Username")} />
              <input name="password" required type="password" autoComplete="new-password" minLength={10} className={input} placeholder={t("كلمة المرور (10+)", "Password (10+)")} aria-label={t("كلمة المرور", "Password")} />
              <input name="agency" className={input} placeholder={t("الجهة (للمتحقق الميداني)", "Agency (for verifiers)")} aria-label={t("الجهة", "Agency")} />
              <div className="grid grid-cols-2 gap-1.5">
                {Object.entries(ROLE_LABEL).map(([k, v]) => (
                  <label key={k} className="flex items-center gap-1.5 text-xs"><input type="checkbox" name={`role_${k}`} className="accent-brand" /> {t(...v)}</label>
                ))}
              </div>
              <button className={`${btn.primary} w-full`}>{t("إنشاء", "Create")}</button>
            </form>
          </Card>
        </div>
      )}

      {tab === "zones" && (
        <form action={saveZonesAction} className="space-y-5">
          <Card title={t("المناطق والسعة بالساعة", "Zones & hourly capacity")}>
            <div className="space-y-3">
              {zones.map((z) => (
                <div key={z.id} className="grid gap-2 sm:grid-cols-[1fr_1fr_7rem_auto_auto] sm:items-center">
                  <input type="hidden" name="zone_id" value={z.id} />
                  <input name={`ar_${z.id}`} defaultValue={z.name_ar} className={input} aria-label={t("الاسم بالعربية", "Arabic name")} />
                  <input name={`en_${z.id}`} defaultValue={z.name_en} className={input} dir="ltr" aria-label={t("الاسم بالإنجليزية", "English name")} />
                  <input name={`cap_${z.id}`} type="number" min={0} defaultValue={z.capacity_per_hour} className={input} aria-label={t("السعة", "Capacity")} />
                  <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" name={`sens_${z.id}`} defaultChecked={z.sensitive} className="accent-brand" /> {t("حساسة", "Sensitive")}</label>
                  <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" name={`act_${z.id}`} defaultChecked={z.active} className="accent-brand" /> {t("نشطة", "Active")}</label>
                </div>
              ))}
              <div className="grid gap-2 border-t border-dashed border-line pt-3 sm:grid-cols-[1fr_1fr_7rem_auto]">
                <input name="new_ar" className={input} placeholder={t("منطقة جديدة (عربي)", "New zone (Arabic)")} aria-label={t("منطقة جديدة", "New zone")} />
                <input name="new_en" className={input} dir="ltr" placeholder="New zone (English)" aria-label="English" />
                <input name="new_cap" type="number" min={0} className={input} placeholder="10" aria-label={t("السعة", "Capacity")} />
                <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" name="new_sens" className="accent-brand" /> {t("حساسة", "Sensitive")}</label>
              </div>
            </div>
          </Card>
          <Card title={t("البوابات والمناطق التي تخدمها", "Gates and the zones they serve")}>
            <div className="space-y-3">
              {gates.map((g) => (
                <div key={g.id}>
                  <input type="hidden" name="gate_id" value={g.id} />
                  <p className="text-sm font-semibold">{t(g.name_ar, g.name_en)}</p>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                    {zones.map((z) => (
                      <label key={z.id} className="flex items-center gap-1.5 text-xs"><input type="checkbox" name={`gate_${g.id}`} value={z.id} defaultChecked={g.zone_ids.includes(z.id)} className="accent-brand" /> {t(z.name_ar, z.name_en)}</label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>
          <button className={btn.primary}>{t("حفظ", "Save")}</button>
        </form>
      )}
    </Shell>
  );
}
