import Link from 'next/link';
import { AuditTrail } from '@/components/audit/audit-trail';
import {
  getMandate,
  listApprovals,
  listPolicyDecisions,
  listPurchases,
  listTransactions,
} from '@/lib/store';

export const metadata = { title: 'Audit Trail · Warden' };
export const dynamic = 'force-dynamic';

interface AuditPageProps {
  searchParams?: Promise<{
    filter?: string;
    status?: string;
    source?: string;
    policy?: string;
  }>;
}

export default async function AuditPage({ searchParams }: AuditPageProps) {
  const resolvedParams = searchParams ? await searchParams : undefined;
  const rawFilter =
    resolvedParams?.filter ||
    resolvedParams?.status ||
    resolvedParams?.policy ||
    resolvedParams?.source ||
    'all';

  const [approvals, policyDecisions, purchases, transactions, mandate] = await Promise.all([
    listApprovals(),
    listPolicyDecisions(),
    listPurchases(),
    listTransactions(),
    getMandate(),
  ]);

  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-8">
      <header className="mb-7 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-md border border-ink/15 bg-accent text-ink shadow-[2px_2px_0_var(--color-ink)]">
              <svg viewBox="0 0 20 20" className="size-4" aria-hidden>
                <path
                  d="M10 2.5l6.5 3v5c0 3.4-2.6 6.4-6.5 7.5-3.9-1.1-6.5-4.1-6.5-7.5v-5l6.5-3z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <h1 className="text-[26px] font-semibold tracking-[-0.02em]">Audit Trail</h1>
          </div>
          <p className="mt-1 text-[14.5px] text-ink-3">
            Deterministic cryptographic audit log: Agent recommendation → Policy engine evaluation →
            Approval authority → Razorpay order → Gateway outcome.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/settings"
            className="inline-flex items-center gap-1.5 rounded-md border border-line-strong bg-surface px-3 py-2 text-xs font-medium text-ink transition-colors hover:bg-surface-2"
          >
            ⚙️ Demo controls
          </Link>
          <Link
            href="/chat"
            className="display-type rounded-md border border-accent-ink/20 bg-accent px-4 py-2 text-xs tracking-wide text-ink shadow-[2px_2px_0_var(--color-ink)] transition-[filter,transform] duration-150 hover:brightness-105 active:translate-x-px active:translate-y-px"
          >
            New procurement
          </Link>
        </div>
      </header>

      <AuditTrail
        approvals={approvals}
        policyDecisions={policyDecisions}
        purchases={purchases}
        transactions={transactions}
        mandate={mandate}
        initialFilter={rawFilter}
      />
    </main>
  );
}
