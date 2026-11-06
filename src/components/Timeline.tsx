import { i18n } from "@/lib/i18n";

const ACTIONS: Record<string, [string, string]> = {
  submitted: ["تقديم الطلب", "Submitted"],
  amendment_submitted: ["تقديم طلب تعديل", "Amendment submitted"],
  resubmitted: ["إعادة التقديم بعد الاستكمال", "Resubmitted after completion"],
  stage1_approved: ["اجتياز المراجعة الأولية", "Passed initial review"],
  approved: ["الاعتماد النهائي وإصدار التصريح", "Final approval & issuance"],
  rejected: ["رفض الطلب", "Rejected"],
  returned: ["إعادة للاستكمال", "Returned for completion"],
  withdrawn: ["سحب الطلب", "Withdrawn"],
};

export async function Timeline({ events, showActor }: { events: { at: Date; actor: string; action: string; note: string | null }[]; showActor?: boolean }) {
  const { t, fmtDate } = await i18n();
  return (
    <ol className="relative space-y-4 border-s-2 border-line ps-5">
      {events.map((e, i) => (
        <li key={i} className="relative">
          <span className="absolute -start-[27px] top-1 h-3 w-3 rounded-full border-2 border-white bg-brand ring-2 ring-line" />
          <p className="text-sm font-semibold">{t(...(ACTIONS[e.action] ?? [e.action, e.action]))}</p>
          <p className="text-xs text-ink-soft">
            {fmtDate(e.at)}
            {showActor && e.actor !== "applicant" ? ` · ${e.actor}` : ""}
          </p>
          {e.note && <p className="mt-1 rounded-lg bg-paper px-3 py-2 text-sm">{e.note}</p>}
        </li>
      ))}
    </ol>
  );
}

export async function StageBar({ status }: { status: string }) {
  const { t } = await i18n();
  const steps = [t("التقديم", "Submitted"), t("المراجعة الأولية", "Initial review"), t("الاعتماد النهائي", "Final approval"), t("الإصدار", "Issued")];
  const at = { pending_review: 1, returned: 1, pending_approval: 2, approved: 4, rejected: -1, withdrawn: -1 }[status] ?? 0;
  return (
    <ol className="grid grid-cols-4 gap-1.5">
      {steps.map((s, i) => {
        const done = at < 0 ? false : i < at;
        const cur = i === at && at < 4;
        return (
          <li key={s}>
            <span className={`block h-1.5 rounded-full ${done ? "bg-brand" : cur ? "bg-rose" : "bg-mist"}`} />
            <span className={`mt-1.5 block text-[11px] sm:text-xs ${done || cur ? "font-semibold text-ink" : "text-ink-soft"}`}>{s}</span>
          </li>
        );
      })}
    </ol>
  );
}
