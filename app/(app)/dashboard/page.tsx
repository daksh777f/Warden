import Link from 'next/link';
import { QuickPrompt } from '@/components/dashboard/quick-prompt';
import { SpendChart } from '@/components/dashboard/spend-chart';
import { Badge, Card, EmptyState, SectionHeading, VendorMark } from '@/components/ui/primitives';
import { getVendor } from '@/lib/catalog/vendors';
import {
  getStats,
  listApprovals,
  listPolicyDecisions,
  listPurchases,
  listSubscriptions,
  listTransactions,
} from '@/lib/store';
import { daysUntil, formatDate, formatMoney, relativeDays } from '@/lib/utils';

export const metadata = { title: 'Dashboard · Warden' };
export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const [stats, purchases, subscriptions, approvals, policyDecisions, transactions] =
    await Promise.all([
      getStats(),
      listPurchases(),
      listSubscriptions(),
      listApprovals(),
      listPolicyDecisions(),
      listTransactions(),
    ]);

  const recent = purchases.slice(0, 5);
  const upcoming = subscriptions
    .filter((s) => s.status !== 'cancelled' && daysUntil(s.next_payment) <= 45)
    .slice(0, 5);
  const pending = approvals.filter((a) => a.status === 'pending');

  // ── Governance metrics computed live from store records ──────────
  const totalAttempted = approvals.length;

  const totalDecisions = policyDecisions.length || approvals.length;
  const allowedDecisions = policyDecisions.filter((d) => d.decision === 'auto_allow').length;
  const deniedDecisions = policyDecisions.filter(
    (d) =>
      d.decision === 'deny' ||
      approvals.some((a) => a.id === d.approval_id && a.status === 'denied_by_policy'),
  ).length;
  const reapprovedDecisions = policyDecisions.filter(
    (d) => d.decision === 'reapprove',
  ).length;

  const allowedPct = totalDecisions > 0 ? Math.round((allowedDecisions / totalDecisions) * 100) : 0;
  const deniedPct = totalDecisions > 0 ? Math.round((deniedDecisions / totalDecisions) * 100) : 0;
  const reapprovedPct = totalDecisions > 0 ? Math.round((reapprovedDecisions / totalDecisions) * 100) : 0;

  const autonomousAgentPurchases = purchases.filter((p) => p.source === 'autonomous_agent').length;
  const humanApprovedPurchases = purchases.filter(
    (p) => p.source === 'human_approved' || !p.source,
  ).length;

  // Group transactions by approval to identify failed-then-recovered purchases
  const txnsByApproval = new Map<string, typeof transactions>();
  for (const t of transactions) {
    if (t.approval_id) {
      const list = txnsByApproval.get(t.approval_id) ?? [];
      list.push(t);
      txnsByApproval.set(t.approval_id, list);
    }
  }
  for (const p of purchases) {
    if (p.transaction_id) {
      const t = transactions.find((txn) => txn.id === p.transaction_id);
      if (t && !t.approval_id) {
        const match = approvals.find((a) => a.vendor_slug === p.vendor_slug && a.plan === p.product);
        if (match) {
          const list = txnsByApproval.get(match.id) ?? [];
          if (!list.some((existing) => existing.id === t.id)) {
            list.push(t);
            txnsByApproval.set(match.id, list);
          }
        }
      }
    }
  }

  let recoveredPurchases = 0;
  for (const a of approvals) {
    const txns = txnsByApproval.get(a.id) ?? [];
    const hasFailed = txns.some((t) => t.status === 'failed');
    const hasCompleted = txns.some((t) => t.status === 'completed');
    if (hasFailed && hasCompleted) {
      recoveredPurchases++;
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-8">
      <header className="mb-7">
        <h1 className="text-[26px] font-semibold tracking-[-0.02em]">Dashboard</h1>
        <p className="mt-1 text-[15px] text-ink-3">
          {process.env.DEMO_COMPANY_NAME || 'Acme Inc.'} · {stats.activeSubscriptions} active
          subscriptions
        </p>
      </header>

      <QuickPrompt />

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Monthly spend"
          value={formatMoney(stats.monthlySpend)}
          sub={`${formatMoney(stats.annualisedSpend)} annualised`}
        />
        <Stat
          label="Active subscriptions"
          value={String(stats.activeSubscriptions)}
          sub={`${stats.upcomingRenewals} renew within 30 days`}
        />
        <Stat
          label="Saved by Warden"
          value={formatMoney(stats.monthlySavings)}
          sub="per month vs the priciest shortlisted option"
          tone={stats.monthlySavings > 0 ? 'good' : undefined}
        />
        <Stat
          label="Pending approvals"
          value={String(stats.pendingApprovals)}
          sub={stats.pendingApprovals ? 'waiting on you' : 'nothing to review'}
          tone={stats.pendingApprovals ? 'warn' : undefined}
        />
      </div>

      {/* ── Governance Metrics Block ── */}
      <div className="mt-6 rounded-2xl border border-line bg-surface/50 p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded-md border border-line-strong bg-accent-soft text-accent-ink font-semibold text-[13px]">
              ⚖️
            </span>
            <div>
              <h2 className="text-[15px] font-semibold tracking-tight text-ink">
                Autonomous Policy &amp; Agent Governance
              </h2>
              <p className="text-[12.5px] text-ink-3">
                Live compliance telemetry across deterministic policy evaluations, audit trails, and agent authority.
              </p>
            </div>
          </div>
          <Link
            href="/audit"
            className="inline-flex items-center gap-1 text-[13px] font-medium text-accent-ink hover:underline"
          >
            Audit trail ledger →
          </Link>
        </div>

        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
          <Link
            href="/audit?filter=all"
            className="group rounded-xl border border-line bg-surface p-4 transition-all duration-150 hover:border-line-strong hover:bg-surface-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11.5px] font-medium uppercase tracking-wider text-ink-3 group-hover:text-ink">
                Purchases Attempted
              </span>
              <span className="text-[11px] font-medium text-ink-3 opacity-0 transition-opacity group-hover:opacity-100">
                View traces ↗
              </span>
            </div>
            <p className="mt-2 text-[26px] font-semibold leading-none tracking-[-0.02em] tabular-nums text-ink">
              {totalAttempted}
            </p>
            <p className="mt-2 text-[12px] leading-snug text-ink-3">
              Total procurement requests evaluated by Warden
            </p>
          </Link>

          <div className="rounded-xl border border-line bg-surface p-4 transition-colors hover:border-line-strong">
            <div className="flex items-center justify-between">
              <span className="text-[11.5px] font-medium uppercase tracking-wider text-ink-3">
                Policy Engine (Phase 2)
              </span>
              <Badge tone="accent" className="text-[10.5px]">Deterministic</Badge>
            </div>
            <p className="mt-2 text-[26px] font-semibold leading-none tracking-[-0.02em] tabular-nums text-ink">
              {allowedPct}% <span className="text-[14px] font-normal text-ink-3">allowed</span>
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11.5px]">
              <Link
                href="/audit?filter=completed"
                className="font-medium text-good hover:underline"
                title="View auto-allowed purchases"
              >
                {allowedPct}% allow
              </Link>
              <span className="text-ink-3">·</span>
              <Link
                href="/audit?filter=denied"
                className="font-medium text-bad hover:underline"
                title="View policy-denied purchases"
              >
                {deniedPct}% deny
              </Link>
              <span className="text-ink-3">·</span>
              <Link
                href="/audit?filter=reapproved"
                className="font-medium text-warn hover:underline"
                title="View price drift re-approvals"
              >
                {reapprovedPct}% drift
              </Link>
            </div>
          </div>

          <div className="rounded-xl border border-line bg-surface p-4 transition-colors hover:border-line-strong">
            <div className="flex items-center justify-between">
              <span className="text-[11.5px] font-medium uppercase tracking-wider text-ink-3">
                Authority (Phase 4)
              </span>
              <Badge tone={autonomousAgentPurchases > 0 ? 'good' : 'neutral'} className="text-[10.5px]">
                {autonomousAgentPurchases > 0 ? 'Agent S2S' : 'Human Click'}
              </Badge>
            </div>
            <p className="mt-2 text-[26px] font-semibold leading-none tracking-[-0.02em] tabular-nums text-ink">
              {autonomousAgentPurchases} <span className="text-[14px] font-normal text-ink-3">vs</span> {humanApprovedPurchases}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11.5px]">
              <Link
                href="/audit?filter=autonomous_agent"
                className="font-medium text-accent-ink hover:underline"
              >
                {autonomousAgentPurchases} autonomous agent
              </Link>
              <span className="text-ink-3">·</span>
              <Link
                href="/audit?filter=human_approved"
                className="text-ink-3 hover:text-ink hover:underline"
              >
                {humanApprovedPurchases} human
              </Link>
            </div>
          </div>

          <Link
            href="/audit?filter=recovered"
            className="group rounded-xl border border-line bg-surface p-4 transition-all duration-150 hover:border-line-strong hover:bg-surface-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11.5px] font-medium uppercase tracking-wider text-ink-3 group-hover:text-ink">
                Recovery (Phase 3)
              </span>
              <span className="text-[11px] font-medium text-ink-3 opacity-0 transition-opacity group-hover:opacity-100">
                Filter ↗
              </span>
            </div>
            <p className={`mt-2 text-[26px] font-semibold leading-none tracking-[-0.02em] tabular-nums ${recoveredPurchases > 0 ? 'text-good' : 'text-ink'}`}>
              {recoveredPurchases} <span className="text-[14px] font-normal text-ink-3">recovered</span>
            </p>
            <p className="mt-2 text-[12px] leading-snug text-ink-3">
              Failed payments safely retried without duplicate charges
            </p>
          </Link>
        </div>
      </div>

      {pending.length > 0 && (
        <Card className="mt-6 border-accent/25 bg-accent-soft/40">
          <SectionHeading
            title="Waiting on your approval"
            action={
              <Link href="/chat" className="text-[13px] font-medium text-accent-ink hover:underline">
                Open chat →
              </Link>
            }
          />
          <ul className="divide-y divide-line border-t border-line">
            {pending.map((approval) => (
              <li key={approval.id} className="flex items-center gap-3 px-5 py-3.5">
                <VendorMark
                  initials={getVendor(approval.vendor_slug)?.initials ?? '··'}
                  color={getVendor(approval.vendor_slug)?.brandColor ?? '#1F2937'}
                  size="sm"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium">
                    {approval.vendor} {approval.plan}
                  </span>
                  <span className="block truncate text-[12.5px] text-ink-3">
                    Requested {formatDate(approval.created_at)}
                  </span>
                </span>
                <span className="shrink-0 text-[14px] font-medium tabular-nums">
                  {formatMoney(approval.price, approval.currency)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="mt-6 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card className="overflow-hidden">
          <SectionHeading
            title="Recent purchases"
            action={
              <Link href="/purchases" className="text-[13px] font-medium text-ink-3 hover:text-ink">
                All →
              </Link>
            }
          />
          {recent.length === 0 ? (
            <EmptyState
              title="Nothing bought yet"
              body="Ask Warden for something and approve it — purchases land here."
            />
          ) : (
            <ul className="divide-y divide-line border-t border-line">
              {recent.map((purchase) => (
                <li key={purchase.id} className="flex items-center gap-3 px-5 py-3.5">
                  <VendorMark
                    initials={getVendor(purchase.vendor_slug)?.initials ?? initialsOf(purchase.vendor)}
                    color={getVendor(purchase.vendor_slug)?.brandColor ?? '#1F2937'}
                    size="sm"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium">{purchase.vendor}</span>
                    <span className="block truncate text-[12.5px] text-ink-3">
                      {purchase.source === 'autonomous_mandate' && (
                        <span className="mr-1.5 font-medium text-good">⚡ Autonomous ·</span>
                      )}
                      {purchase.product} · {formatDate(purchase.created_at)}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-[14px] font-medium tabular-nums">
                      {formatMoney(purchase.price, purchase.currency)}
                    </span>
                    <span className="block text-[11.5px] text-ink-3">
                      {purchase.billing_cycle === 'annual' ? '/yr' : '/mo'}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-5">
          <Card className="overflow-hidden">
            <SectionHeading
              title="Upcoming renewals"
              action={
                <Link href="/renewals" className="text-[13px] font-medium text-ink-3 hover:text-ink">
                  All →
                </Link>
              }
            />
            {upcoming.length === 0 ? (
              <EmptyState title="No renewals due" body="Nothing bills in the next 45 days." />
            ) : (
              <ul className="divide-y divide-line border-t border-line">
                {upcoming.map((sub) => {
                  const days = daysUntil(sub.next_payment);
                  return (
                    <li key={sub.id} className="flex items-center gap-3 px-5 py-3.5">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-medium">{sub.vendor}</span>
                        <span className="block truncate text-[12.5px] text-ink-3">
                          {formatDate(sub.next_payment)}
                        </span>
                      </span>
                      <Badge tone={days <= 7 ? 'warn' : 'neutral'}>{relativeDays(sub.next_payment)}</Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <p className="text-sm font-semibold tracking-tight">Spend by vendor</p>
            <SpendChart
              data={subscriptions
                .filter((s) => s.status !== 'cancelled')
                .map((s) => ({
                  label: s.vendor,
                  value: s.billing_cycle === 'annual' ? s.price / 12 : s.price,
                }))}
            />
          </Card>
        </div>
      </div>
    </main>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: 'good' | 'warn';
}) {
  return (
    <Card className="p-5">
      <p className="text-[12px] font-medium uppercase tracking-wider text-ink-3">{label}</p>
      <p
        className={`mt-2 text-[28px] font-semibold leading-none tracking-[-0.02em] tabular-nums ${
          tone === 'good' ? 'text-good' : tone === 'warn' ? 'text-warn' : ''
        }`}
      >
        {value}
      </p>
      <p className="mt-2 text-[12.5px] leading-snug text-ink-3">{sub}</p>
    </Card>
  );
}

function initialsOf(name: string) {
  return name.slice(0, 2).toUpperCase();
}
