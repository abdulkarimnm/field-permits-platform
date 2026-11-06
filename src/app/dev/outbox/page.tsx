import { notFound } from "next/navigation";
import { Shell } from "@/components/Shell";
import { Card, Empty, PageTitle } from "@/components/ui";
import { q } from "@/lib/db";
import { i18n } from "@/lib/i18n";
import { getSetting } from "@/lib/settings";
import AutoRefresh from "@/components/AutoRefresh";

export default async function Outbox() {
  if (!(await getSetting("demo_mode"))) notFound();
  const { t, fmtDate } = await i18n();
  const rows = await q<{ id: number; channel: string; target: string; body: string; created_at: Date }>(
    `SELECT * FROM outbox ORDER BY id DESC LIMIT 50`,
  );
  return (
    <Shell>
      <AutoRefresh seconds={4} />
      <PageTitle
        title={t("صندوق الرسائل التجريبي", "Test message outbox")}
        sub={t("في التجربة الداخلية تُعرض هنا كل رسالة نصية أو بريدية بدل إرسالها. يُعطّل عند ربط بوابة الرسائل الفعلية.", "During the internal trial every SMS/email is shown here instead of being sent. Disabled once the real gateway is connected.")}
      />
      <Card>
        {rows.length === 0 ? (
          <Empty>{t("لا توجد رسائل بعد", "No messages yet")}</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.id} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-soft">
                  <span className="num font-semibold text-ink">{r.target}</span>
                  <span>{r.channel.toUpperCase()} · {fmtDate(r.created_at)}</span>
                </div>
                <p className="mt-1 text-sm leading-relaxed">{r.body}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </Shell>
  );
}
