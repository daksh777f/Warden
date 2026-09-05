'use client';

import { useState } from 'react';
import { TrustBadge } from '@/components/chat/trust-badge';
import { Badge, Button, Spinner, VendorMark } from '@/components/ui/primitives';
import type { Approval, Recommendation } from '@/lib/types';
import { formatMoney } from '@/lib/utils';

export function ApprovalCard({
  approval,
  recommendation,
  vendorInitials,
  vendorColor,
  state,
  onApprove,
  onDecline,
}: {
  approval: Approval;
  recommendation?: Recommendation;
  vendorInitials: string;
  vendorColor: string;
  state: 'pending' | 'working' | 'approved' | 'declined';
  onApprove: (price?: number) => void;
  onDecline: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const isPaymentFailed = approval.status === 'payment_failed';
  const isAutoAllowed =
    !isPaymentFailed &&
    (approval.policy_decision === 'auto_allow' ||
      (approval.status === 'approved' && approval.approved_by === 'autonomous_mandate'));
  const isDenied =
    approval.policy_decision === 'deny' || approval.status === 'denied_by_policy';
  const isReapprove = approval.policy_decision === 'reapprove';
  const isRequireHuman =
    !isPaymentFailed &&
    (approval.policy_decision === 'require_human' || (!isAutoAllowed && !isDenied && !isReapprove));

  const displayPrice =
    isReapprove && approval.policy_drift
      ? approval.policy_drift.newPrice
      : approval.price;

  const cycleLabel =
    approval.billing_cycle === 'annual'
      ? '/year'
      : approval.billing_cycle === 'one_time'
        ? ' one-time'
        : '/month';

  // Determine card border tone
  const borderTone = isPaymentFailed
    ? 'border-bad/40 shadow-[0_10px_36px_-18px_var(--color-bad)]'
    : isAutoAllowed
      ? 'border-good/35 shadow-[0_10px_36px_-18px_var(--color-good)]'
      : isDenied
        ? 'border-bad/35 shadow-[0_10px_36px_-18px_var(--color-bad)]'
        : isReapprove
          ? 'border-warn/40 shadow-[0_10px_36px_-18px_var(--color-warn)]'
          : 'border-accent/25 shadow-[0_10px_36px_-18px_var(--color-accent)]';

  return (
    <div className={`animate-rise overflow-hidden rounded-xl2 border-2 bg-surface ${borderTone}`}>
      {/* Policy Engine Header Banner */}
      {isPaymentFailed ? (
        <div className="flex items-center justify-between border-b border-line bg-bad-soft px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-bad font-bold text-[14px]">❌</span>
            <span className="text-[12px] font-semibold uppercase tracking-wider text-bad">
              Payment Failed — Retry Available
            </span>
          </div>
          <Badge tone="bad">Payment Failed</Badge>
        </div>
      ) : isAutoAllowed ? (
        <div className="flex items-center justify-between border-b border-line bg-good-soft px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-good font-bold text-[14px]">⚡</span>
            <span className="text-[12px] font-semibold uppercase tracking-wider text-good">
              Authorized Automatically by Mandate
            </span>
          </div>
          <Badge tone="good">Auto-Allowed</Badge>
        </div>
      ) : isDenied ? (
        <div className="flex items-center justify-between border-b border-line bg-bad-soft px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-bad font-bold text-[14px]">⛔</span>
            <span className="text-[12px] font-semibold uppercase tracking-wider text-bad">
              Blocked by Spending Mandate
            </span>
          </div>
          <Badge tone="bad">Policy Denied</Badge>
        </div>
      ) : isReapprove ? (
        <div className="flex items-center justify-between border-b border-line bg-warn-soft px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-warn font-bold text-[14px]">⚠️</span>
            <span className="text-[12px] font-semibold uppercase tracking-wider text-warn">
              Price Drift Detected — Re-approval Required
            </span>
          </div>
          <Badge tone="warn">Re-Approve</Badge>
        </div>
      ) : (
        <div className="flex items-center justify-between border-b border-line bg-accent-soft px-4 py-2.5">
          <div className="flex items-center gap-2">
            <svg viewBox="0 0 20 20" className="size-4 text-accent-ink" aria-hidden>
              <path
                d="M10 2.5l6.5 3v5c0 3.4-2.6 6.4-6.5 7.5-3.9-1.1-6.5-4.1-6.5-7.5v-5l6.5-3z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
            </svg>
            <span className="text-[12px] font-semibold uppercase tracking-wider text-accent-ink">
              Escalated for Human Approval
            </span>
          </div>
          <Badge tone="accent">Escalation</Badge>
        </div>
      )}

      <div className="p-5">
        <div className="flex items-start gap-3.5">
          <VendorMark initials={vendorInitials} color={vendorColor} size="lg" />

          <div className="min-w-0 flex-1">
            <p className="text-[17px] font-semibold leading-tight tracking-tight">
              {approval.vendor}
            </p>
            <p className="text-[13px] text-ink-3">
              {approval.plan} · {approval.category}
            </p>
          </div>

          <div className="shrink-0 text-right">
            <p className="text-[22px] font-semibold leading-none tracking-tight tabular-nums">
              {formatMoney(displayPrice, approval.currency)}
            </p>
            <p className="mt-1 text-[12px] text-ink-3">{cycleLabel.trim()}</p>
          </div>
        </div>

        {/* Informative Policy Engine Callout */}
        {isPaymentFailed && (
          <div className="mt-3.5 rounded-lg border border-bad/30 bg-bad-soft/70 px-3.5 py-2.5 text-[13px]">
            <p className="font-semibold text-bad mb-0.5">Card Payment Declined</p>
            <p className="text-ink-2 leading-relaxed">
              {approval.policy_reason ||
                'The card charge failed at the payment processor. You can retry with a fresh Razorpay order without restarting the procurement dialogue.'}
            </p>
          </div>
        )}

        {isAutoAllowed && (
          <div className="mt-3.5 rounded-lg border border-good/30 bg-good-soft/70 px-3.5 py-2.5 text-[13px]">
            <p className="font-medium text-good">
              {approval.policy_reason ||
                `Authorized automatically — ${formatMoney(approval.price, approval.currency)} is within your auto-approval limit.`}
            </p>
          </div>
        )}

        {isDenied && (
          <div className="mt-3.5 rounded-lg border border-bad/30 bg-bad-soft/70 px-3.5 py-2.5 text-[13px]">
            <p className="font-semibold text-bad mb-0.5">Blocked by Policy Engine</p>
            <p className="text-ink-2 leading-relaxed">
              {approval.policy_reason || 'This purchase exceeds your configured spending mandate.'}
            </p>
          </div>
        )}

        {isReapprove && (
          <div className="mt-3.5 rounded-lg border border-warn/35 bg-warn-soft/80 px-3.5 py-2.5 text-[13px]">
            <p className="font-semibold text-warn mb-1">Live Catalog Price Drift</p>
            <p className="text-ink-2 leading-relaxed">
              {approval.policy_reason || 'Catalog price has changed since recommendation.'}
            </p>
            {approval.policy_drift && (
              <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-surface/90 px-3 py-1.5 text-[12px]">
                <span className="text-ink-3">Recommended:</span>
                <span className="line-through font-mono">
                  {formatMoney(approval.policy_drift.oldPrice, approval.currency)}
                </span>
                <span className="text-ink-3">→</span>
                <span className="font-semibold font-mono text-ink">
                  {formatMoney(approval.policy_drift.newPrice, approval.currency)}
                </span>
                <Badge tone="warn" className="ml-auto text-[11px]">
                  +{approval.policy_drift.diffPct}% drift
                </Badge>
              </div>
            )}
            <p className="mt-2 text-[11.5px] text-ink-3">
              Autonomous execution was dropped because of price drift. Please re-confirm below to authorize.
            </p>
          </div>
        )}

        {isRequireHuman && approval.policy_reason && (
          <div className="mt-3.5 rounded-lg border border-accent/20 bg-accent-soft/40 px-3.5 py-2.5 text-[13px]">
            <p className="text-ink-2 leading-relaxed">
              <span className="font-medium text-accent-ink">Reason for escalation: </span>
              {approval.policy_reason}
            </p>
          </div>
        )}

        <div className="mt-3.5 flex flex-wrap gap-2">
          {recommendation?.trust ? (
            <TrustBadge report={recommendation.trust} />
          ) : approval.trust_score != null ? (
            <Badge tone={approval.trust_score >= 85 ? 'good' : 'accent'}>
              Trust {approval.trust_score}/100
            </Badge>
          ) : null}

          {(recommendation?.monthlySaving ?? approval.monthly_saving) ? (
            <Badge tone="good">
              Saves{' '}
              {formatMoney((recommendation?.monthlySaving ?? approval.monthly_saving) as number)}/mo
              vs the priciest option
            </Badge>
          ) : null}
        </div>

        <p className="mt-3.5 text-[14px] leading-relaxed text-ink-2">{approval.reasoning}</p>

        {expanded && (
          <div className="animate-fade mt-4 grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
            <PointList title="Why this one" tone="good" points={approval.pros} />
            <PointList title="What we give up" tone="warn" points={approval.cons} />
            {recommendation?.runnerUp && (
              <p className="text-[13px] leading-relaxed text-ink-3 sm:col-span-2">
                <span className="font-medium text-ink-2">
                  Runner-up: {recommendation.runnerUp.vendor}
                </span>{' '}
                — {recommendation.runnerUp.why}
              </p>
            )}
          </div>
        )}

        {(approval.pros.length > 0 || approval.cons.length > 0) && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-3 text-[13px] font-medium text-accent-ink underline-offset-2 hover:underline"
          >
            {expanded ? 'Hide reasoning' : 'See the full reasoning'}
          </button>
        )}
      </div>

      {/* Action Footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface-2/60 px-5 py-4">
        {isPaymentFailed ? (
          <>
            <Button
              onClick={() => onApprove(displayPrice)}
              disabled={state === 'working'}
              className="flex-1"
            >
              {state === 'working' ? (
                <>
                  <Spinner /> Generating fresh order…
                </>
              ) : (
                <>Retry payment {formatMoney(displayPrice, approval.currency)}</>
              )}
            </Button>
            <Button variant="ghost" onClick={onDecline} disabled={state === 'working'}>
              Cancel
            </Button>
            <span className="hidden text-[12px] text-ink-3 sm:inline">
              Mandate re-checked on retry
            </span>
          </>
        ) : isAutoAllowed || state === 'approved' ? (
          <div className="flex items-center justify-between w-full">
            <p className="flex items-center gap-2 text-[13px] font-medium text-good">
              <span className="size-2 rounded-full bg-good" />
              {isAutoAllowed
                ? 'Authorized autonomously · Payment recorded via Razorpay'
                : 'Approved by human · Payment executed'}
            </p>
            <span className="text-[12px] text-ink-3">Razorpay Test Mode</span>
          </div>
        ) : isDenied ? (
          <div className="flex items-center justify-between w-full">
            <p className="flex items-center gap-2 text-[13px] font-medium text-bad">
              <span className="size-2 rounded-full bg-bad" />
              Denied by spending mandate — no payment authorized
            </p>
            <Badge tone="bad">No charge</Badge>
          </div>
        ) : state === 'declined' ? (
          <p className="flex items-center gap-2 text-[13px] font-medium text-ink-3">
            <span className="size-1.5 rounded-full bg-ink-3" /> Declined — nothing was purchased
          </p>
        ) : isReapprove ? (
          <>
            <Button
              onClick={() => onApprove(approval.policy_drift?.newPrice)}
              disabled={state === 'working'}
              className="flex-1"
            >
              {state === 'working' ? (
                <>
                  <Spinner /> Opening Razorpay…
                </>
              ) : (
                <>Accept New Price &amp; Pay {formatMoney(displayPrice, approval.currency)}</>
              )}
            </Button>
            <Button variant="ghost" onClick={onDecline} disabled={state === 'working'}>
              Decline
            </Button>
            <span className="hidden text-[12px] text-ink-3 sm:inline">
              Re-approval required
            </span>
          </>
        ) : (
          <>
            <Button onClick={() => onApprove()} disabled={state === 'working'} className="flex-1">
              {state === 'working' ? (
                <>
                  <Spinner /> Opening Razorpay…
                </>
              ) : (
                <>Approve &amp; pay {formatMoney(approval.price, approval.currency)}</>
              )}
            </Button>
            <Button variant="ghost" onClick={onDecline} disabled={state === 'working'}>
              Cancel
            </Button>
            <span className="ml-auto hidden text-[12px] text-ink-3 sm:block">
              Razorpay Test Mode
            </span>
          </>
        )}
      </div>
    </div>
  );
}

function PointList({
  title,
  points,
  tone,
}: {
  title: string;
  points: string[];
  tone: 'good' | 'warn';
}) {
  if (!points.length) return null;
  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-3">{title}</p>
      <ul className="space-y-1.5">
        {points.map((point) => (
          <li key={point} className="flex gap-2 text-[13px] leading-snug text-ink-2">
            <span
              className={`mt-[5px] size-1.5 shrink-0 rounded-full ${
                tone === 'good' ? 'bg-good' : 'bg-warn'
              }`}
              aria-hidden
            />
            {point}
          </li>
        ))}
      </ul>
    </div>
  );
}
