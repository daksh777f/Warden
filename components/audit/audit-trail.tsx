'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, Card, EmptyState, Spinner, VendorMark } from '@/components/ui/primitives';
import { getVendor } from '@/lib/catalog/vendors';
import type { Approval, Mandate, PolicyDecision, Purchase, Transaction } from '@/lib/types';
import { formatMoney } from '@/lib/utils';

export type FilterStatus =
  | 'all'
  | 'completed'
  | 'denied'
  | 'declined'
  | 'failed'
  | 'reapproved'
  | 'recovered'
  | 'autonomous_agent'
  | 'human_approved';

interface AuditTrailProps {
  approvals: Approval[];
  policyDecisions: PolicyDecision[];
  purchases: Purchase[];
  transactions: Transaction[];
  mandate?: Mandate;
  initialFilter?: string;
}

function normalizeFilter(raw?: string): FilterStatus {
  if (!raw) return 'all';
  if (raw === 'auto_allow') return 'completed';
  if (raw === 'deny') return 'denied';
  if (raw === 'reapproval_required') return 'reapproved';
  const valid: FilterStatus[] = [
    'all',
    'completed',
    'denied',
    'declined',
    'failed',
    'reapproved',
    'recovered',
    'autonomous_agent',
    'human_approved',
  ];
  return valid.includes(raw as FilterStatus) ? (raw as FilterStatus) : 'all';
}

function formatAuditTimestamp(isoString?: string | null): string {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  } catch {
    return isoString;
  }
}

export function AuditTrail({
  approvals,
  policyDecisions,
  purchases,
  transactions,
  mandate,
  initialFilter = 'all',
}: AuditTrailProps) {
  const router = useRouter();
  const [filter, setFilter] = useState<FilterStatus>(() => normalizeFilter(initialFilter));
  const [search, setSearch] = useState('');
  const [retryingId, setRetryingId] = useState<string | null>(null);

  useEffect(() => {
    if (initialFilter) {
      setFilter(normalizeFilter(initialFilter));
    }
  }, [initialFilter]);

  // Group policy decisions by approval_id
  const decisionsByApproval = useMemo(() => {
    const map = new Map<string, PolicyDecision[]>();
    for (const d of policyDecisions) {
      const list = map.get(d.approval_id) ?? [];
      list.push(d);
      map.set(d.approval_id, list);
    }
    return map;
  }, [policyDecisions]);

  // Group transactions by approval_id
  const transactionsByApproval = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const t of transactions) {
      if (t.approval_id) {
        const list = map.get(t.approval_id) ?? [];
        list.push(t);
        map.set(t.approval_id, list);
      }
    }
    // Also associate transactions linked via purchase_id
    for (const p of purchases) {
      if (p.transaction_id) {
        const t = transactions.find((txn) => txn.id === p.transaction_id);
        if (t && !t.approval_id) {
          // If transaction didn't have approval_id directly, see if any approval matches vendor_slug & plan
          const matchingApproval = approvals.find(
            (a) => a.vendor_slug === p.vendor_slug && a.plan === p.product,
          );
          if (matchingApproval) {
            const list = map.get(matchingApproval.id) ?? [];
            if (!list.some((existing) => existing.id === t.id)) {
              list.push(t);
              map.set(matchingApproval.id, list);
            }
          }
        }
      }
    }
    return map;
  }, [transactions, purchases, approvals]);

  // Map purchases by approval_id or transaction_id
  const purchasesByApproval = useMemo(() => {
    const map = new Map<string, Purchase>();
    for (const p of purchases) {
      // Find matching approval by transaction
      const txn = transactions.find((t) => t.id === p.transaction_id);
      if (txn?.approval_id) {
        map.set(txn.approval_id, p);
      } else {
        const match = approvals.find(
          (a) => a.vendor_slug === p.vendor_slug && a.plan === p.product,
        );
        if (match) {
          map.set(match.id, p);
        }
      }
    }
    return map;
  }, [purchases, transactions, approvals]);

  // Compute stats for pills
  const stats = useMemo(() => {
    let completedCount = 0;
    let deniedCount = 0;
    let declinedCount = 0;
    let failedCount = 0;
    let reapprovedCount = 0;
    let recoveredCount = 0;
    let autonomousAgentCount = 0;
    let humanApprovedCount = 0;

    for (const a of approvals) {
      const txns = transactionsByApproval.get(a.id) ?? [];
      const hasFailedTxn = txns.some((t) => t.status === 'failed');
      const hasCompletedTxn = txns.some((t) => t.status === 'completed');
      const purchase = purchasesByApproval.get(a.id);
      const isAutonomous =
        purchase?.source === 'autonomous_agent' ||
        a.requested_by?.includes('agent') ||
        txns.some((t) => t.provider?.includes('agent'));
      const isReapproved =
        a.policy_decision === 'reapprove' ||
        decisionsByApproval
          .get(a.id)
          ?.some((d) => d.decision === 'reapprove');

      if (hasFailedTxn && hasCompletedTxn) {
        recoveredCount++;
      }
      if (isReapproved) {
        reapprovedCount++;
      }
      if (isAutonomous) {
        autonomousAgentCount++;
      } else {
        humanApprovedCount++;
      }

      if (a.status === 'denied_by_policy' || a.policy_decision === 'deny') {
        deniedCount++;
      } else if (a.status === 'declined') {
        declinedCount++;
      } else if (a.status === 'payment_failed' || (hasFailedTxn && !hasCompletedTxn)) {
        failedCount++;
      } else if (a.status === 'approved' || hasCompletedTxn) {
        completedCount++;
      }
    }

    return {
      total: approvals.length,
      completed: completedCount,
      denied: deniedCount,
      declined: declinedCount,
      failed: failedCount,
      reapproved: reapprovedCount,
      recovered: recoveredCount,
      autonomousAgent: autonomousAgentCount,
      humanApproved: humanApprovedCount,
    };
  }, [approvals, transactionsByApproval, purchasesByApproval, decisionsByApproval]);

  // Filter approvals
  const filteredApprovals = useMemo(() => {
    return approvals.filter((a) => {
      const txns = transactionsByApproval.get(a.id) ?? [];
      const hasFailedTxn = txns.some((t) => t.status === 'failed');
      const hasCompletedTxn = txns.some((t) => t.status === 'completed');
      const purchase = purchasesByApproval.get(a.id);
      const isAutonomous =
        purchase?.source === 'autonomous_agent' ||
        a.requested_by?.includes('agent') ||
        txns.some((t) => t.provider?.includes('agent'));
      const isReapproved =
        a.policy_decision === 'reapprove' ||
        decisionsByApproval
          .get(a.id)
          ?.some((d) => d.decision === 'reapprove');
      const isRecovered = hasFailedTxn && hasCompletedTxn;

      const isDenied = a.status === 'denied_by_policy' || a.policy_decision === 'deny';
      const isDeclined = a.status === 'declined';
      const isFailed = a.status === 'payment_failed' || (hasFailedTxn && !hasCompletedTxn);
      const isCompleted = a.status === 'approved' || hasCompletedTxn;

      if (filter === 'completed' && !isCompleted) return false;
      if (filter === 'denied' && !isDenied) return false;
      if (filter === 'declined' && !isDeclined) return false;
      if (filter === 'failed' && !isFailed) return false;
      if (filter === 'reapproved' && !isReapproved) return false;
      if (filter === 'recovered' && !isRecovered) return false;
      if (filter === 'autonomous_agent' && !isAutonomous) return false;
      if (filter === 'human_approved' && isAutonomous) return false;

      if (search.trim()) {
        const query = search.toLowerCase().trim();
        const matchesVendor = a.vendor.toLowerCase().includes(query);
        const matchesPlan = a.plan.toLowerCase().includes(query);
        const matchesCategory = a.category.toLowerCase().includes(query);
        const matchesId = a.id.toLowerCase().includes(query);
        const matchesTxn = txns.some(
          (t) =>
            t.order_id?.toLowerCase().includes(query) ||
            t.txn_ref_id?.toLowerCase().includes(query) ||
            t.id.toLowerCase().includes(query),
        );
        if (!matchesVendor && !matchesPlan && !matchesCategory && !matchesId && !matchesTxn) {
          return false;
        }
      }

      return true;
    });
  }, [approvals, filter, search, transactionsByApproval]);

  // Handler for retry payment directly from audit trail
  async function handleRetryPayment(approval: Approval) {
    setRetryingId(approval.id);
    try {
      // 1. Post approval to re-evaluate mandate and create fresh order
      const res = await fetch(`/api/approvals/${approval.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision: 'approve', approval }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Retry request rejected by server');
      }

      const order = data.order || data.session;
      const orderId = order?.id || order?.order_id;
      if (!orderId) {
        throw new Error('No Razorpay order was returned on retry');
      }

      // 2. Complete payment in test mode via verification endpoint
      const randPaymentId = `pay_rec_${Math.random().toString(36).slice(2, 10)}`;
      const verifyRes = await fetch('/api/razorpay/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          paymentId: randPaymentId,
          signature: 'simulated_signature',
          approvalId: approval.id,
          simulated: true,
        }),
      });

      if (!verifyRes.ok) {
        const verifyData = await verifyRes.json().catch(() => ({}));
        throw new Error(verifyData.error || 'Failed to complete payment verification on retry');
      }

      // 3. Refresh server data
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Retry failed');
    } finally {
      setRetryingId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* ── Toolbar: Search & Filter Pills ── */}
      <div className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-4 shadow-sm md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          <FilterButton
            active={filter === 'all'}
            onClick={() => setFilter('all')}
            label="All Traces"
            count={stats.total}
          />
          <FilterButton
            active={filter === 'completed'}
            onClick={() => setFilter('completed')}
            label="Completed"
            count={stats.completed}
            tone="good"
          />
          <FilterButton
            active={filter === 'denied'}
            onClick={() => setFilter('denied')}
            label="Denied by Policy"
            count={stats.denied}
            tone="bad"
            badge="Gated"
          />
          {stats.reapproved > 0 && (
            <FilterButton
              active={filter === 'reapproved'}
              onClick={() => setFilter('reapproved')}
              label="Re-Approved"
              count={stats.reapproved}
              tone="warn"
              badge="Drift"
            />
          )}
          {stats.recovered > 0 && (
            <FilterButton
              active={filter === 'recovered'}
              onClick={() => setFilter('recovered')}
              label="Recovered"
              count={stats.recovered}
              tone="good"
              badge="Phase 3"
            />
          )}
          {stats.autonomousAgent > 0 && (
            <FilterButton
              active={filter === 'autonomous_agent'}
              onClick={() => setFilter('autonomous_agent')}
              label="Autonomous Agent"
              count={stats.autonomousAgent}
              tone="accent"
              badge="Phase 4"
            />
          )}
          <FilterButton
            active={filter === 'failed'}
            onClick={() => setFilter('failed')}
            label="Payment Failed"
            count={stats.failed}
            tone="warn"
          />
          <FilterButton
            active={filter === 'declined'}
            onClick={() => setFilter('declined')}
            label="Declined"
            count={stats.declined}
            tone="neutral"
          />
        </div>

        {/* Search input */}
        <div className="relative w-full md:w-72">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search vendor, order, payment ID…"
            className="w-full rounded-md border border-line-strong bg-canvas px-3 py-1.5 pl-8 text-xs font-mono text-ink placeholder:font-sans placeholder:text-ink-3 focus:border-accent-ink focus:outline-none focus:ring-1 focus:ring-accent-ink"
          />
          <svg
            viewBox="0 0 20 20"
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3"
            aria-hidden
          >
            <circle cx="8.5" cy="8.5" r="5" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="M12.5 12.5l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink"
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* ── Empty State ── */}
      {filteredApprovals.length === 0 && (
        <Card className="p-8">
          <EmptyState
            title={search ? 'No audit records match your search' : 'No audit records in this view'}
            body={
              search
                ? `No approvals, orders, or transactions match "${search}". Try adjusting your filters.`
                : 'Run a procurement in Chat or trigger demo controls in Settings to generate audit events.'
            }
          />
        </Card>
      )}

      {/* ── Vertical Timeline Cards ── */}
      <div className="space-y-6">
        {filteredApprovals.map((approval) => {
          const vendor = getVendor(approval.vendor_slug);
          const vendorInitials = vendor?.initials ?? approval.vendor.slice(0, 2).toUpperCase();
          const vendorColor = vendor?.brandColor ?? '#1F2937';

          const decisions = decisionsByApproval.get(approval.id) ?? [];
          const primaryDecision =
            decisions[0] ??
            (approval.policy_decision
              ? ({
                  id: `pld_synth_${approval.id}`,
                  approval_id: approval.id,
                  decision: approval.policy_decision,
                  reason: approval.policy_reason || 'Evaluated against mandate constraints',
                  mandate_snapshot: mandate ?? {
                    maxPerPurchase: 100,
                    dailyCap: 300,
                    allowedCategories: null,
                    requireHumanAbove: 30,
                    requireReapprovalOnPriceChangePct: 5,
                    active: true,
                  },
                  evaluated_at: approval.created_at,
                } as PolicyDecision)
              : null);

          const appTxns = (transactionsByApproval.get(approval.id) ?? []).sort(
            (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
          );
          const purchase = purchasesByApproval.get(approval.id);

          const isDenied =
            approval.status === 'denied_by_policy' || primaryDecision?.decision === 'deny';
          const isDeclined = approval.status === 'declined';
          const isPaymentFailed = approval.status === 'payment_failed';
          const hasFailedTxn = appTxns.some((t) => t.status === 'failed');
          const hasCompletedTxn = appTxns.some((t) => t.status === 'completed');
          const isRecovered = hasFailedTxn && (hasCompletedTxn || approval.status === 'approved');
          const isAgentS2S =
            approval.approved_by === 'autonomous_agent' ||
            purchase?.source === 'autonomous_agent' ||
            approval.requested_by.includes('agent');

          // Determine overall visual tone
          const cardTone = isDenied
            ? 'border-bad/40 bg-bad-soft/5'
            : isPaymentFailed
              ? 'border-bad/40 bg-bad-soft/5'
              : isRecovered
                ? 'border-accent/40 bg-accent-soft/10 shadow-[0_4px_24px_-12px_var(--color-accent)]'
                : isDeclined
                  ? 'border-line bg-surface-2/20'
                  : isAgentS2S
                    ? 'border-cyan-500/40 bg-cyan-500/5 shadow-sm'
                    : 'border-good/30 bg-surface shadow-sm';

          return (
            <Card
              key={approval.id}
              className={`overflow-hidden border-2 transition-shadow duration-150 ${cardTone}`}
            >
              {/* Top Banner for prominent status visibility */}
              {isDenied ? (
                <div className="flex items-center justify-between border-b border-bad/20 bg-bad-soft px-5 py-2.5 text-xs">
                  <div className="flex items-center gap-2 font-medium text-bad">
                    <span className="font-bold text-sm">⛔</span>
                    <span>
                      {isAgentS2S
                        ? 'EXTERNAL AGENT S2S GATE: DENIED BY AUTONOMOUS AGENT MANDATE — ZERO CHARGE AUTHORIZED'
                        : 'AUTONOMOUS GATE: DENIED BY SPENDING MANDATE — ZERO CHARGE AUTHORIZED'}
                    </span>
                  </div>
                  <Badge tone="bad">{isAgentS2S ? '🤖 Agent Blocked' : 'Gated by Policy'}</Badge>
                </div>
              ) : isPaymentFailed ? (
                <div className="flex items-center justify-between border-b border-bad/20 bg-bad-soft px-5 py-2.5 text-xs">
                  <div className="flex items-center gap-2 font-medium text-bad">
                    <span className="font-bold text-sm">❌</span>
                    <span>GATEWAY ERROR: PAYMENT DECLINED BY ISSUER — SCRIPTED RECOVERY READY</span>
                  </div>
                  <Badge tone="bad">Payment Failed</Badge>
                </div>
              ) : isRecovered ? (
                <div className="flex items-center justify-between border-b border-accent-ink/20 bg-accent-soft px-5 py-2.5 text-xs">
                  <div className="flex items-center gap-2 font-medium text-accent-ink">
                    <span className="font-bold text-sm">⚡</span>
                    <span>RESILIENCE DEMO: SCRIPTED RECOVERY EXECUTED (FAILED → RETRIED → SUCCEEDED)</span>
                  </div>
                  <Badge tone="good">100% Recovered</Badge>
                </div>
              ) : isDeclined ? (
                <div className="flex items-center justify-between border-b border-line bg-surface-2/60 px-5 py-2.5 text-xs">
                  <div className="flex items-center gap-2 font-medium text-ink-3">
                    <span>✕</span>
                    <span>HUMAN REVIEW: PURCHASE DECLINED BY REVIEWER — NO ORDER CREATED</span>
                  </div>
                  <Badge tone="neutral">Declined</Badge>
                </div>
              ) : isAgentS2S ? (
                <div className="flex items-center justify-between border-b border-cyan-500/20 bg-cyan-500/10 px-5 py-2.5 text-xs">
                  <div className="flex items-center gap-2 font-medium text-cyan-800 dark:text-cyan-200">
                    <span className="font-bold text-sm">🤖</span>
                    <span>EXTERNAL AGENT S2S: DISCOVERED, QUOTED &amp; TRANSACTED VIA AGENT-CATALOG API</span>
                  </div>
                  <Badge tone="accent">🤖 Autonomous Agent S2S</Badge>
                </div>
              ) : (
                <div className="flex items-center justify-between border-b border-good/20 bg-good-soft px-5 py-2.5 text-xs">
                  <div className="flex items-center gap-2 font-medium text-good">
                    <span>✓</span>
                    <span>PROCUREMENT PIPELINE: AUTHORIZED &amp; SETTLED VIA RAZORPAY</span>
                  </div>
                  <Badge tone="good">
                    {approval.approved_by === 'autonomous_mandate' ? '⚡ Autonomous' : 'Human Approved'}
                  </Badge>
                </div>
              )}

              {/* Card Header Information */}
              <div className="border-b border-line/70 bg-surface px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <VendorMark initials={vendorInitials} color={vendorColor} size="md" />
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-base font-semibold text-ink">{approval.vendor}</h2>
                        <span className="text-xs text-ink-3">· {approval.plan}</span>
                      </div>
                      <p className="text-xs text-ink-3">
                        Category: <span className="text-ink-2">{approval.category}</span> · Approval ID:{' '}
                        <code className="font-mono text-[11px] text-ink-2">{approval.id}</code>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-right">
                    <div>
                      <div className="text-lg font-bold tabular-nums text-ink">
                        {formatMoney(approval.price, approval.currency)}
                      </div>
                      <div className="text-[11px] uppercase tracking-wider text-ink-3">
                        {approval.billing_cycle === 'annual'
                          ? 'Yearly billing'
                          : approval.billing_cycle === 'one_time'
                            ? 'One-time charge'
                            : 'Monthly billing'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── The Vertical Timeline ── */}
              <div className="p-5 md:p-6">
                <div className="relative pl-6 before:absolute before:bottom-3 before:left-[11px] before:top-3 before:w-0.5 before:bg-line">
                  {/* ── STEP 1: Recommendation Created ── */}
                  <TimelineStep
                    nodeTone="info"
                    stepNumber={1}
                    title="Recommendation Created"
                    timestamp={approval.created_at}
                    badgeText="Agent Proposal"
                  >
                    <div className="space-y-2 text-xs">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-ink-3">Requested by:</span>
                        <code className="rounded bg-canvas px-1.5 py-0.5 font-mono text-[11px] text-ink">
                          {approval.requested_by}
                        </code>
                        <span className="text-ink-3">· Proposed plan:</span>
                        <span className="font-medium text-ink">
                          {approval.plan} ({formatMoney(approval.price, approval.currency)})
                        </span>
                      </div>

                      <div className="rounded-md border border-line bg-canvas/60 p-2.5 text-ink-2">
                        <span className="font-semibold text-ink">Agent Reasoning: </span>
                        {approval.reasoning}
                      </div>

                      {(approval.pros.length > 0 || approval.cons.length > 0) && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {approval.pros.slice(0, 2).map((pro, i) => (
                            <span
                              key={i}
                              className="inline-flex items-center gap-1 rounded bg-good-soft px-2 py-0.5 text-[11px] text-good"
                            >
                              ✓ {pro}
                            </span>
                          ))}
                          {approval.cons.slice(0, 1).map((con, i) => (
                            <span
                              key={i}
                              className="inline-flex items-center gap-1 rounded bg-warn-soft px-2 py-0.5 text-[11px] text-warn"
                            >
                              ⚠ {con}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </TimelineStep>

                  {/* ── STEP 2: Policy Decision ── */}
                  <TimelineStep
                    nodeTone={
                      primaryDecision?.decision === 'deny'
                        ? 'bad'
                        : primaryDecision?.decision === 'auto_allow'
                          ? 'good'
                          : 'warn'
                    }
                    stepNumber={2}
                    title="Deterministic Policy Engine Evaluation"
                    timestamp={primaryDecision?.evaluated_at || approval.created_at}
                    badgeText={
                      primaryDecision?.decision === 'deny'
                        ? 'DENIED BY MANDATE'
                        : primaryDecision?.decision === 'auto_allow'
                          ? 'AUTONOMOUS ALLOW'
                          : primaryDecision?.decision === 'reapprove'
                            ? 'RE-APPROVE (DRIFT)'
                            : 'ESCALATE TO HUMAN'
                    }
                    badgeTone={
                      primaryDecision?.decision === 'deny'
                        ? 'bad'
                        : primaryDecision?.decision === 'auto_allow'
                          ? 'good'
                          : 'warn'
                    }
                  >
                    <div className="space-y-2.5 text-xs">
                      <div className="flex items-start gap-2">
                        <span className="font-semibold text-ink">Evaluation Verdict:</span>
                        <span
                          className={`font-medium ${
                            primaryDecision?.decision === 'deny'
                              ? 'text-bad'
                              : primaryDecision?.decision === 'auto_allow'
                                ? 'text-good'
                                : 'text-accent-ink'
                          }`}
                        >
                          {primaryDecision?.reason ||
                            (isDenied
                              ? `Price ${formatMoney(approval.price)} exceeds single-purchase mandate limit ($100.00).`
                              : `Price ${formatMoney(approval.price)} verified within mandate bounds.`)}
                        </span>
                      </div>

                      {/* Mandate Snapshot Grid */}
                      {primaryDecision?.mandate_snapshot && (
                        <div className="rounded-lg border border-line-strong/60 bg-surface-2/40 p-2.5">
                          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-3">
                            Active Mandate Snapshot at Evaluation
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-[11.5px] sm:grid-cols-4">
                            <div className="rounded border border-line bg-canvas p-1.5">
                              <span className="block text-[10px] text-ink-3">Max Per Purchase</span>
                              <span className="font-mono font-semibold text-ink">
                                {formatMoney(primaryDecision.mandate_snapshot.maxPerPurchase)}
                              </span>
                            </div>
                            <div className="rounded border border-line bg-canvas p-1.5">
                              <span className="block text-[10px] text-ink-3">Daily Spend Cap</span>
                              <span className="font-mono font-semibold text-ink">
                                {formatMoney(primaryDecision.mandate_snapshot.dailyCap)}
                              </span>
                            </div>
                            <div className="rounded border border-line bg-canvas p-1.5">
                              <span className="block text-[10px] text-ink-3">Auto-Allow Ceiling</span>
                              <span className="font-mono font-semibold text-ink">
                                {formatMoney(primaryDecision.mandate_snapshot.requireHumanAbove)}
                              </span>
                            </div>
                            <div className="rounded border border-line bg-canvas p-1.5">
                              <span className="block text-[10px] text-ink-3">Mandate Status</span>
                              <span className="font-mono font-semibold text-good">
                                {primaryDecision.mandate_snapshot.active ? 'Active Enforced' : 'Disabled'}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </TimelineStep>

                  {/* ── STEP 3: Approval Authority Decision ── */}
                  <TimelineStep
                    nodeTone={isDenied ? 'bad' : isDeclined ? 'neutral' : 'good'}
                    stepNumber={3}
                    title="Approval Authority Decision"
                    timestamp={approval.decided_at || approval.created_at}
                    badgeText={
                      isDenied
                        ? 'Enforced Denial'
                        : isDeclined
                          ? 'Declined by Reviewer'
                          : isAgentS2S
                            ? '🤖 Agent S2S Clearance'
                            : approval.approved_by === 'autonomous_mandate'
                              ? 'Autonomous Execution'
                              : 'Human Approval'
                    }
                    badgeTone={isDenied ? 'bad' : isDeclined ? 'neutral' : isAgentS2S ? 'warn' : 'good'}
                  >
                    <div className="text-xs">
                      {isDenied ? (
                        <p className="text-bad">
                          Autonomous gate blocked authorization. No human approval token was issued and
                          procurement was halted deterministically.
                        </p>
                      ) : isDeclined ? (
                        <p className="text-ink-2">
                          Human reviewer (
                          <code className="font-mono font-semibold text-ink">
                            {approval.approved_by || 'founder@acme.dev'}
                          </code>
                          ) explicitly declined the recommendation at{' '}
                          {formatAuditTimestamp(approval.decided_at)}.
                        </p>
                      ) : isAgentS2S ? (
                        <div className="space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-ink-3">Authority:</span>
                            <span className="font-semibold text-accent-ink">External Autonomous Agent S2S Order</span>
                            <span className="text-ink-3">· Caller ID:</span>
                            <code className="rounded bg-canvas px-1.5 py-0.5 font-mono text-[11px] font-semibold text-ink">
                              {approval.requested_by}
                            </code>
                          </div>
                          <p className="text-[11.5px] text-ink-3">
                            Direct server-to-server transaction via Warden Agent-Catalog API. Authorized without browser checkout.
                          </p>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-ink-3">Authorized by:</span>
                          <code className="rounded bg-canvas px-1.5 py-0.5 font-mono text-[11px] font-semibold text-ink">
                            {approval.approved_by || 'autonomous_mandate'}
                          </code>
                          {approval.proof && (
                            <span className="text-ink-3">
                              · HMAC Signature:{' '}
                              <code className="font-mono text-[10.5px] text-ink-3">
                                {approval.proof.slice(0, 16)}…
                              </code>
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </TimelineStep>

                  {/* ── STEP 4 & 5: Razorpay Order Creation & Gateway Payment Outcome ── */}
                  {isDenied ? (
                    // Explicitly Skipped Steps for Denied Purchase
                    <>
                      <TimelineSkippedStep
                        stepNumber={4}
                        title="Razorpay Order Created"
                        reason="Skipped — Blocked by spending mandate before reaching Razorpay API"
                      />
                      <TimelineSkippedStep
                        stepNumber={5}
                        title="Final Payment Outcome"
                        reason="Skipped — Zero payment attempted or processed"
                      />
                    </>
                  ) : isDeclined ? (
                    // Explicitly Skipped Steps for Declined Purchase
                    <>
                      <TimelineSkippedStep
                        stepNumber={4}
                        title="Razorpay Order Created"
                        reason="Skipped — Procurement declined by reviewer"
                      />
                      <TimelineSkippedStep
                        stepNumber={5}
                        title="Final Payment Outcome"
                        reason="Skipped — No payment initiated"
                      />
                    </>
                  ) : isRecovered ? (
                    // ── RECOVERED THREAD: Attempt 1 Failed → Retry Gate → Attempt 2 Captured ──
                    <div className="space-y-4">
                      {/* Attempt 1: Failed */}
                      <TimelineStep
                        nodeTone="bad"
                        stepNumber={4}
                        title="Attempt 1: Razorpay Order & Payment Failure"
                        timestamp={appTxns.find((t) => t.status === 'failed')?.created_at || approval.created_at}
                        badgeText="Attempt 1 Failed"
                        badgeTone="bad"
                      >
                        <div className="space-y-2 text-xs">
                          {(() => {
                            const failedTxn = appTxns.find((t) => t.status === 'failed');
                            return (
                              <>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-ink-3">Order ID:</span>
                                  <code className="rounded border border-line bg-canvas px-1.5 py-0.5 font-mono text-[11px] text-ink">
                                    {failedTxn?.order_id || 'order_sim_att1'}
                                  </code>
                                  <span className="text-ink-3">· Payment ID:</span>
                                  <code className="rounded border border-bad/30 bg-bad-soft px-1.5 py-0.5 font-mono text-[11px] font-semibold text-bad">
                                    {failedTxn?.txn_ref_id || 'pay_fail_issuer'}
                                  </code>
                                </div>
                                <div className="rounded-md border border-bad/20 bg-bad-soft/60 p-2 text-bad">
                                  <span className="font-semibold">Gateway Error: </span>
                                  BAD_REQUEST_ERROR — Payment was declined by issuing bank (insufficient funds /
                                  card declined).
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      </TimelineStep>

                      {/* Scripted Recovery Connector */}
                      <div className="relative -ml-2 rounded-lg border-2 border-accent bg-accent-soft/40 p-3 shadow-sm">
                        <div className="flex items-center gap-2 text-xs font-semibold text-accent-ink">
                          <span className="flex size-5 items-center justify-center rounded-full bg-accent text-ink">
                            ↻
                          </span>
                          <span>Scripted Recovery Path Activated</span>
                          <span className="ml-auto font-mono text-[10px] uppercase text-ink-3">
                            Resilience Demonstration
                          </span>
                        </div>
                        <p className="mt-1 text-[12px] leading-relaxed text-ink-2">
                          Retry triggered using the identical approval context. Spending mandate was
                          re-evaluated deterministically (verdict: <strong className="text-good">ALLOW</strong>),
                          and a fresh Razorpay order was generated without re-running the agent or causing
                          duplicate purchase records.
                        </p>
                      </div>

                      {/* Attempt 2: Captured */}
                      <TimelineStep
                        nodeTone="good"
                        stepNumber={5}
                        title="Attempt 2: Fresh Razorpay Order & Payment Captured"
                        timestamp={
                          appTxns.find((t) => t.status === 'completed')?.created_at ||
                          purchase?.created_at ||
                          new Date().toISOString()
                        }
                        badgeText="Payment Captured"
                        badgeTone="good"
                      >
                        <div className="space-y-2 text-xs">
                          {(() => {
                            const okTxn = appTxns.find((t) => t.status === 'completed');
                            return (
                              <>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-ink-3">Fresh Order ID:</span>
                                  <code className="rounded border border-line bg-canvas px-1.5 py-0.5 font-mono text-[11px] text-ink">
                                    {okTxn?.order_id || 'order_rec_ok'}
                                  </code>
                                  <span className="text-ink-3">· Captured Payment ID:</span>
                                  <code className="rounded border border-good/30 bg-good-soft px-1.5 py-0.5 font-mono text-[11px] font-semibold text-good">
                                    {okTxn?.txn_ref_id || 'pay_rec_ok'}
                                  </code>
                                </div>
                                <div className="flex flex-wrap items-center gap-3 pt-1">
                                  <span className="text-ink-3">Purchase Record:</span>
                                  <code className="font-mono text-[11px] text-ink">
                                    {purchase?.id || okTxn?.purchase_id || 'pur_recovered'}
                                  </code>
                                  {purchase?.invoice_url && (
                                    <a
                                      href={purchase.invoice_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="font-medium text-accent-ink underline-offset-2 hover:underline"
                                    >
                                      View Generated Invoice
                                    </a>
                                  )}
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      </TimelineStep>
                    </div>
                  ) : isPaymentFailed ? (
                    // ── CURRENTLY FAILED: Show Order + Failed Payment + Retry Action ──
                    <>
                      <TimelineStep
                        nodeTone="good"
                        stepNumber={4}
                        title="Razorpay Order Created"
                        timestamp={appTxns[0]?.created_at || approval.decided_at || approval.created_at}
                        badgeText="Order Created"
                        badgeTone="good"
                      >
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="text-ink-3">Order ID:</span>
                          <code className="rounded border border-line bg-canvas px-1.5 py-0.5 font-mono text-[11px] text-ink">
                            {appTxns[0]?.order_id || `order_${approval.id.slice(4)}`}
                          </code>
                          <span className="text-ink-3">· Subunits:</span>
                          <span className="font-mono text-ink">
                            {Math.round(approval.price * 100)} {approval.currency} cents
                          </span>
                        </div>
                      </TimelineStep>

                      <TimelineStep
                        nodeTone="bad"
                        stepNumber={5}
                        title="Gateway Payment Outcome: Failed"
                        timestamp={appTxns[0]?.created_at || new Date().toISOString()}
                        badgeText="Payment Failed"
                        badgeTone="bad"
                      >
                        <div className="space-y-3 text-xs">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-ink-3">Payment Attempt ID:</span>
                            <code className="rounded border border-bad/30 bg-bad-soft px-1.5 py-0.5 font-mono text-[11px] font-semibold text-bad">
                              {appTxns[0]?.txn_ref_id || 'pay_fail_issuer'}
                            </code>
                          </div>

                          <div className="rounded-md border border-bad/30 bg-bad-soft p-2.5 text-bad">
                            <div className="font-semibold">Declined by Issuing Bank</div>
                            <p className="mt-0.5 text-[11.5px] leading-relaxed">
                              {approval.policy_reason ||
                                'The issuer declined the transaction (card_declined / insufficient funds). Zero Purchase records were written to the store.'}
                            </p>
                          </div>

                          {/* Recovery Button right on the audit card */}
                          <div className="flex items-center gap-3 pt-1">
                            <Button
                              onClick={() => handleRetryPayment(approval)}
                              disabled={retryingId === approval.id}
                              variant="primary"
                              className="bg-accent text-ink"
                            >
                              {retryingId === approval.id ? (
                                <>
                                  <Spinner /> Executing Scripted Recovery…
                                </>
                              ) : (
                                <>↻ Retry Payment for {formatMoney(approval.price, approval.currency)}</>
                              )}
                            </Button>
                            <span className="text-[11.5px] text-ink-3">
                              Re-checks mandate before creating fresh Razorpay order
                            </span>
                          </div>
                        </div>
                      </TimelineStep>
                    </>
                  ) : (
                    // ── NORMAL COMPLETED ORDER & PAYMENT ──
                    <>
                      <TimelineStep
                        nodeTone="good"
                        stepNumber={4}
                        title="Razorpay Order Created"
                        timestamp={appTxns[0]?.created_at || approval.decided_at || approval.created_at}
                        badgeText="Order Created"
                        badgeTone="good"
                      >
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="text-ink-3">Order ID:</span>
                          <code className="rounded border border-line bg-canvas px-1.5 py-0.5 font-mono text-[11px] font-semibold text-ink">
                            {appTxns[0]?.order_id || `order_${approval.id.slice(4)}`}
                          </code>
                          <span className="text-ink-3">· Amount:</span>
                          <span className="font-mono font-medium text-ink">
                            {formatMoney(approval.price, approval.currency)} (
                            {Math.round(approval.price * 100)} subunits)
                          </span>
                        </div>
                      </TimelineStep>

                      <TimelineStep
                        nodeTone="good"
                        stepNumber={5}
                        title="Final Payment Outcome: Captured &amp; Settled"
                        timestamp={
                          appTxns[0]?.created_at || purchase?.created_at || approval.decided_at || approval.created_at
                        }
                        badgeText="Payment Captured"
                        badgeTone="good"
                      >
                        <div className="space-y-2 text-xs">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-ink-3">Razorpay Payment ID:</span>
                            <code className="rounded border border-good/30 bg-good-soft px-1.5 py-0.5 font-mono text-[11px] font-semibold text-good">
                              {appTxns[0]?.txn_ref_id || `pay_${approval.id.slice(4)}`}
                            </code>
                            <span className="text-ink-3">· Transaction:</span>
                            <code className="font-mono text-[11px] text-ink-3">
                              {appTxns[0]?.id || purchase?.transaction_id || 'txn_settled'}
                            </code>
                          </div>

                          <div className="flex flex-wrap items-center gap-3 pt-1">
                            <span className="inline-flex items-center gap-1 rounded bg-good-soft px-2 py-0.5 font-medium text-good">
                              ✓ Purchase Recorded
                            </span>
                            {purchase?.invoice_url && (
                              <a
                                href={purchase.invoice_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-medium text-accent-ink underline-offset-2 hover:underline"
                              >
                                View Invoice
                              </a>
                            )}
                          </div>
                        </div>
                      </TimelineStep>
                    </>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ── Supporting Components ─────────────────────────────────────

function FilterButton({
  active,
  onClick,
  label,
  count,
  tone,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  tone?: 'good' | 'bad' | 'warn' | 'neutral' | 'accent';
  badge?: string;
}) {
  const toneClasses = {
    good: 'border-good/30 text-good',
    bad: 'border-bad/30 text-bad',
    warn: 'border-warn/30 text-warn',
    neutral: 'border-line text-ink-3',
    accent: 'border-accent-ink/30 text-accent-ink',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all ${
        active
          ? 'border-ink bg-ink text-canvas shadow-sm'
          : 'border-line bg-canvas text-ink-2 hover:border-line-strong hover:bg-surface-2'
      }`}
    >
      <span>{label}</span>
      <span
        className={`rounded-full px-1.5 py-0.2 text-[10px] font-mono tabular-nums ${
          active
            ? 'bg-canvas text-ink'
            : tone
              ? toneClasses[tone]
              : 'bg-surface-2 text-ink-3'
        }`}
      >
        {count}
      </span>
      {badge && (
        <span className="rounded bg-bad px-1 text-[9px] font-bold uppercase text-white">
          {badge}
        </span>
      )}
    </button>
  );
}

function TimelineStep({
  nodeTone = 'info',
  stepNumber,
  title,
  timestamp,
  badgeText,
  badgeTone = 'neutral',
  children,
}: {
  nodeTone?: 'good' | 'bad' | 'warn' | 'info' | 'neutral';
  stepNumber: number;
  title: string;
  timestamp?: string | null;
  badgeText?: string;
  badgeTone?: 'good' | 'bad' | 'warn' | 'neutral';
  children: React.ReactNode;
}) {
  const nodeStyles = {
    good: 'border-good bg-good text-white',
    bad: 'border-bad bg-bad text-white',
    warn: 'border-warn bg-warn text-ink',
    info: 'border-accent-ink bg-accent text-ink',
    neutral: 'border-line-strong bg-surface-2 text-ink-3',
  };

  return (
    <div className="relative pb-6 last:pb-1">
      {/* Node icon */}
      <span
        className={`absolute -left-6 top-0 flex size-5 -translate-x-1/2 items-center justify-center rounded-full border text-[10px] font-bold shadow-sm ${nodeStyles[nodeTone]}`}
      >
        {stepNumber}
      </span>

      {/* Step Header */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-[13.5px] font-semibold text-ink">{title}</h3>
          {badgeText && (
            <Badge tone={badgeTone} className="text-[10.5px]">
              {badgeText}
            </Badge>
          )}
        </div>
        {timestamp && (
          <span className="font-mono text-[11px] text-ink-3">
            {formatAuditTimestamp(timestamp)}
          </span>
        )}
      </div>

      {/* Step Content */}
      <div className="ml-1">{children}</div>
    </div>
  );
}

function TimelineSkippedStep({
  stepNumber,
  title,
  reason,
}: {
  stepNumber: number;
  title: string;
  reason: string;
}) {
  return (
    <div className="relative pb-6 last:pb-1">
      {/* Node icon */}
      <span className="absolute -left-6 top-0 flex size-5 -translate-x-1/2 items-center justify-center rounded-full border border-dashed border-ink-3/40 bg-surface-2 text-[10px] font-bold text-ink-3">
        ⊘
      </span>

      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-[13px] font-medium text-ink-3 line-through">{title}</h3>
          <span className="rounded border border-dashed border-ink-3/30 bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium uppercase text-ink-3">
            ⊘ Explicitly Skipped
          </span>
        </div>
      </div>

      <div className="ml-1 rounded-md border border-dashed border-line-strong/60 bg-surface-2/30 px-3 py-2 text-xs text-ink-3 italic">
        {reason}
      </div>
    </div>
  );
}
