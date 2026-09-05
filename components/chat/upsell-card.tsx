'use client';

import { useState } from 'react';
import { Badge, Button, Spinner } from '@/components/ui/primitives';
import type { OptimizationSuggestion } from '@/lib/types';
import { formatMoney } from '@/lib/utils';

export interface UpsellCardProps {
  suggestion: OptimizationSuggestion;
  onAccept: (suggestion: OptimizationSuggestion) => Promise<void> | void;
  onSkip: (suggestion: OptimizationSuggestion) => void;
  isAccepted?: boolean;
  isSkipped?: boolean;
}

export function UpsellCard({
  suggestion,
  onAccept,
  onSkip,
  isAccepted = false,
  isSkipped = false,
}: UpsellCardProps) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<'pending' | 'accepted' | 'skipped'>(
    isAccepted ? 'accepted' : isSkipped ? 'skipped' : 'pending',
  );

  const handleAccept = async () => {
    setLoading(true);
    try {
      await onAccept(suggestion);
      setStatus('accepted');
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    setStatus('skipped');
    onSkip(suggestion);
  };

  if (status === 'skipped') {
    return (
      <div className="animate-rise rounded-xl border border-line bg-surface-2/40 px-4 py-2.5 text-xs text-ink-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span>⊘</span>
          <span>
            Optimization suggestion for <strong>{suggestion.vendorName}</strong> skipped. Original approval remains active.
          </span>
        </div>
        <Badge tone="neutral">Skipped</Badge>
      </div>
    );
  }

  if (status === 'accepted') {
    return (
      <div className="animate-rise rounded-xl border border-good/30 bg-good-soft/40 px-4 py-2.5 text-xs text-good flex items-center justify-between">
        <div className="flex items-center gap-2 font-medium">
          <span>✓</span>
          <span>
            Optimization accepted! Second approval created for <strong>{suggestion.vendorName} {suggestion.suggestedPlan}</strong>.
          </span>
        </div>
        <Badge tone="good">Accepted</Badge>
      </div>
    );
  }

  const isAnnual = suggestion.type === 'annual_discount';

  return (
    <div className="animate-rise overflow-hidden rounded-xl2 border-2 border-accent/40 bg-surface shadow-[0_10px_36px_-18px_var(--color-accent)]">
      {/* Header Banner */}
      <div className="flex items-center justify-between border-b border-accent/20 bg-accent-soft/60 px-4 py-2.5 text-xs">
        <div className="flex items-center gap-2 font-semibold text-accent-ink">
          <span>⚡</span>
          <span>{isAnnual ? 'ANNUAL SAVINGS OPTIMIZATION' : 'FEATURE UPGRADE OPPORTUNITY'}</span>
        </div>
        <Badge tone="accent">
          {isAnnual ? 'Save Money' : 'More Capability'}
        </Badge>
      </div>

      <div className="p-4 space-y-3.5">
        {/* Headline & Justification */}
        <div>
          <h4 className="text-[14.5px] font-semibold text-ink flex items-center gap-2">
            {suggestion.headline}
          </h4>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-2 font-mono">
            {suggestion.justification}
          </p>
        </div>

        {/* Side-by-side comparison */}
        <div className="grid grid-cols-2 gap-2.5 rounded-lg border border-line bg-canvas/60 p-2.5 text-xs">
          <div className="space-y-1">
            <span className="text-[11px] font-medium text-ink-3 uppercase tracking-wider">Current Recommendation</span>
            <div className="font-semibold text-ink">{suggestion.currentPlan}</div>
            <div className="text-ink-2 font-mono">
              {formatMoney(suggestion.currentPrice)}/{suggestion.currentCycle === 'annual' ? 'yr' : 'mo'}
            </div>
          </div>

          <div className="space-y-1 border-l border-line pl-2.5">
            <span className="text-[11px] font-medium text-accent-ink uppercase tracking-wider">Suggested Optimization</span>
            <div className="font-semibold text-accent-ink">{suggestion.suggestedPlan}</div>
            <div className="font-semibold text-ink font-mono">
              {formatMoney(suggestion.suggestedPrice)}/{suggestion.suggestedCycle === 'annual' ? 'yr' : 'mo'}
              {suggestion.monthlyEquivalent && (
                <span className="text-good ml-1.5 font-normal">
                  (${suggestion.monthlyEquivalent}/mo)
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Unlocked Features */}
        {suggestion.unlockedFeatures && suggestion.unlockedFeatures.length > 0 && (
          <div className="space-y-1.5 pt-0.5">
            <span className="text-[11px] font-medium text-ink-3 uppercase tracking-wider">
              Unlocked Capabilities:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {suggestion.unlockedFeatures.map((feat, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 rounded bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent-ink"
                >
                  <span>✓</span> {feat}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5 pt-1">
          <Button
            onClick={handleAccept}
            disabled={loading}
            variant="primary"
            className="flex-1 bg-accent text-ink hover:bg-accent/90"
          >
            {loading ? (
              <>
                <Spinner /> Requesting Approval…
              </>
            ) : (
              <>
                <span>✓ Accept &amp; Request Approval</span>
              </>
            )}
          </Button>

          <Button
            onClick={handleSkip}
            disabled={loading}
            variant="secondary"
            className="border-line px-4 text-ink-2 hover:bg-surface-2 hover:text-ink"
          >
            Skip
          </Button>
        </div>

        <p className="text-[11px] text-ink-3 text-center">
          Accepting raises a second Approval card subject to your spending mandate. Skipping leaves the original recommendation untouched.
        </p>
      </div>
    </div>
  );
}
