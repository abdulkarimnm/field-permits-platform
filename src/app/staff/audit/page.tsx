import { Shell, staffNav } from "@/components/Shell";
import { Alert, Card, input, btn, PageTitle } from "@/components/ui";
import { requireCap } from "@/lib/auth";
import { q } from "@/lib/db";
import { i18n } from "@/lib/i18n";
import { verifyChain } from "@/lib/audit";

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const u = await requireCap("audit.view");
  const { t, fmtDate } = await i18n();
  const sp = await searchParams;
  const chain = await verifyChain();
  const term = sp.q?.trim();
  const rows = await q<{ id: number; at: string; actor: string; action: string; entity: string | null; entity_id: string | null; data: unknown; hash: string }>(
    `SELECT id,at,actor,action,entity,entity_id,data,hash FROM audit
     ${term ? "WHERE action ILIKE $1 OR actor ILIKE $1 OR entity_id ILIKE $1 OR data::text ILIKE $1" : ""}
     ORDER BY id DESC LIMIT 200`,
    term ? [`%${term}%`] : [],
  );
  const users = new Map((await q<{ id: number; name: string }>(`SELECT id,name FROM users`)).map((x) => [`user:${x.id}`, x.name]));

  return (
    <Shell nav={staffNav(u.roles)} active="/staff/audit" user={u.name} kind="staff" wide>
      <PageTitle title={t("سجل العمليات", "Audit log")} sub={t("سجل إلحاقي مربوط بسلسلة بصمات SHA-256: كل سطر يحمل بصمة السطر السابق.", "Append-only log chained with SHA-256: every row carries the previous row's hash.")} />
      <div className="mb-4">
        {chain.ok ? (
          <Alert tone="ok">{t(`تم التحقق من سلامة السلسلة كاملة (${chain.count} عملية). لم يُعدَّل أو يُحذف أي سطر.`, `Full chain verified (${chain.count} entries). No row was edited or deleted.`)}</Alert>
        ) : (
          <Alert tone="bad">{t(`انكسار في السلسلة عند السطر ${chain.brokenAt}: تم تعديل أو حذف بيانات في السجل.`, `Chain broken at row ${chain.brokenAt}: the log was edited or truncated.`)}</Alert>
        )}
      </div>
      <form className="mb-4 flex gap-2">
        <input name="q" defaultValue={term} className={input} placeholder={t("بحث في السجل (إجراء، مستخدم، رقم…)", "Search (action, user, id…)")} aria-label={t("بحث", "Search")} />
        <button className={btn.primary}>{t("بحث", "Search")}</button>
      </form>
      <Card>
        <ul className="-my-2 divide-y divide-line">
          {rows.map((r) => (
            <li key={r.id} className="grid gap-1 py-2.5 text-sm md:grid-cols-[3rem_10rem_1fr_auto] md:items-center md:gap-3">
              <span className="num text-xs text-ink-soft">#{r.id}</span>
              <span className="text-xs text-ink-soft">{fmtDate(r.at)}</span>
              <span className="min-w-0">
                <span className="font-mono text-[13px] font-semibold">{r.action}</span>
                <span className="ms-2 text-ink-soft">{users.get(r.actor) ?? r.actor}</span>
                {r.entity && <span className="ms-2 text-xs text-ink-soft">{r.entity}#{r.entity_id}</span>}
                {r.data != null && <span className="mt-0.5 block truncate font-mono text-[11px] text-ink-soft">{JSON.stringify(r.data)}</span>}
              </span>
              <span className="num font-mono text-[11px] text-ink-soft" title={r.hash}>{r.hash.slice(0, 10)}…</span>
            </li>
          ))}
        </ul>
      </Card>
    </Shell>
  );
}
