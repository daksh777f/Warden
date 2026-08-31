import 'server-only';

import { getVendor } from '@/lib/catalog/vendors';
import type { Mandate } from '@/lib/policy/mandate';
import { getTodayAuthorizedSpend } from '@/lib/store';
import type { Approval, Vendor } from '@/lib/types';
import { formatMoney } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────
// Deterministic Policy Engine
//
// Evaluates every proposed purchase against the human's spending mandate.
//
// Output:
//   - auto_allow: Policy engine authorizes it directly (no human click)
//   - require_human: Within hard limits, but needs a human click because it
//                    crossed requireHumanAbove (the escalation path)
//   - deny: Outside the mandate entirely, no path authorizes it
//   - reapprove: Price drifted since the recommendation, needs fresh confirmation
// ─────────────────────────────────────────────────────────────

export interface EvaluationContext {
  todayAuthorizedSpend?: number;
  simulatedCatalogPrice?: number;
  seats?: number;
}

export type PolicyDecisionOutcome =
  | { decision: 'auto_allow'; reason: string }
  | { decision: 'require_human'; reason: string }
  | { decision: 'deny'; reason: string }
  | {
      decision: 'reapprove';
      reason: string;
      oldPrice: number;
      newPrice: number;
      diffPct: number;
    };

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/**
 * Resolves live catalog price for a vendor plan using the same effective
 * pricing / entryTier logic as lib/tools/index.ts
 */
function getLiveCatalogPrice(
  vendorSlug: string,
  planName: string,
  seats: number = 1,
): number | null {
  const vendor = getVendor(vendorSlug);
  if (!vendor) return null;

  // 1. Direct tier name match
  const exactTier = vendor.tiers.find(
    (t) => t.name.toLowerCase() === planName.toLowerCase(),
  );
  if (exactTier) {
    const isPerSeat =
      exactTier.unit.includes('per user') ||
      exactTier.unit.includes('per editor') ||
      exactTier.unit.includes('per seat');
    return isPerSeat ? exactTier.price * seats : exactTier.price;
  }

  // 2. entryTier logic (cheapest paid tier)
  const priced = vendor.tiers
    .map((tier) => ({
      tier,
      effective:
        tier.unit.includes('per user') ||
        tier.unit.includes('per editor') ||
        tier.unit.includes('per seat')
          ? tier.price * seats
          : tier.price,
    }))
    .sort((a, b) => a.effective - b.effective);

  const paid = priced.filter((p) => p.effective > 0);
  const chosen = paid[0] ?? priced[0];
  return chosen ? chosen.effective : null;
}

/**
 * Evaluates an approval against a spending mandate using deterministic rules.
 * Rules are strictly evaluated in order:
 *
 * 1. If !mandate.active, always return require_human (old behavior).
 * 2. Deny if approval.price > mandate.maxPerPurchase.
 * 3. Deny if today's already-authorized spend + approval.price > mandate.dailyCap.
 * 4. Deny if mandate.allowedCategories is set and approval.category isn't in it.
 * 5. Reapprove if live catalog price differs from approval.price by > requireReapprovalOnPriceChangePct%.
 * 6. Otherwise: require_human if approval.price > mandate.requireHumanAbove, else auto_allow.
 */
export async function evaluatePurchase(
  approval: Approval,
  mandate: Mandate,
  context?: EvaluationContext,
): Promise<PolicyDecisionOutcome> {
  const currency = approval.currency || 'USD';

  // Rule 1: Inactive mandate falls back to human escalation
  if (!mandate.active) {
    return {
      decision: 'require_human',
      reason: 'Spending mandate is paused. Escalating to human approval for safety.',
    };
  }

  // Rule 2: Exceeds maximum allowed price per single purchase
  if (approval.price > mandate.maxPerPurchase) {
    return {
      decision: 'deny',
      reason: `Price of ${formatMoney(approval.price, currency)} exceeds your maximum per-purchase limit of ${formatMoney(mandate.maxPerPurchase, currency)}.`,
    };
  }

  // Rule 3: Exceeds daily cumulative cap
  const todaySpend =
    context?.todayAuthorizedSpend !== undefined
      ? context.todayAuthorizedSpend
      : await getTodayAuthorizedSpend();

  if (todaySpend + approval.price > mandate.dailyCap) {
    return {
      decision: 'deny',
      reason: `Purchase of ${formatMoney(approval.price, currency)} brings today's total spend to ${formatMoney(todaySpend + approval.price, currency)}, exceeding your daily cap of ${formatMoney(mandate.dailyCap, currency)} (already authorized today: ${formatMoney(todaySpend, currency)}).`,
    };
  }

  // Rule 4: Category restriction
  if (mandate.allowedCategories && mandate.allowedCategories.length > 0) {
    const isAllowed = mandate.allowedCategories.some(
      (cat) =>
        cat.trim().toLowerCase() === approval.category.trim().toLowerCase() ||
        cat.trim().toLowerCase() === approval.vendor_slug.trim().toLowerCase(),
    );
    if (!isAllowed) {
      return {
        decision: 'deny',
        reason: `Category "${approval.category}" is outside your allowed mandate categories (${mandate.allowedCategories.join(', ')}).`,
      };
    }
  }

  // Rule 5: Price drift detection
  const liveCatalogPrice =
    context?.simulatedCatalogPrice !== undefined
      ? context.simulatedCatalogPrice
      : getLiveCatalogPrice(approval.vendor_slug, approval.plan, context?.seats ?? 1);

  if (liveCatalogPrice !== null && liveCatalogPrice > 0 && approval.price > 0) {
    const diff = Math.abs(liveCatalogPrice - approval.price);
    const diffPct = (diff / approval.price) * 100;

    if (diffPct > mandate.requireReapprovalOnPriceChangePct) {
      return {
        decision: 'reapprove',
        reason: `Catalog price for ${approval.vendor} (${approval.plan}) changed to ${formatMoney(liveCatalogPrice, currency)} (was ${formatMoney(approval.price, currency)}, a ${diffPct.toFixed(1)}% drift exceeding your ${mandate.requireReapprovalOnPriceChangePct}% threshold). Re-approval required.`,
        oldPrice: approval.price,
        newPrice: liveCatalogPrice,
        diffPct: round2(diffPct),
      };
    }
  }

  // Rule 6: Escalation threshold or Autonomous Approval
  if (approval.price > mandate.requireHumanAbove) {
    return {
      decision: 'require_human',
      reason: `Price of ${formatMoney(approval.price, currency)} exceeds your ${formatMoney(mandate.requireHumanAbove, currency)} auto-approval limit. Escalated for human review.`,
    };
  }

  return {
    decision: 'auto_allow',
    reason: `Authorized automatically — ${formatMoney(approval.price, currency)} is within your ${formatMoney(mandate.requireHumanAbove, currency)} auto-approval limit.`,
  };
}
