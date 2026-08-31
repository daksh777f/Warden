// ─────────────────────────────────────────────────────────────
// Parch — Spending Mandate
//
// A human configures this policy once. The policy engine uses it to
// decide whether the agent can authorize a purchase autonomously or
// must escalate to a human.
// ─────────────────────────────────────────────────────────────

export interface Mandate {
  /** Maximum single purchase price permitted by the mandate ($). */
  maxPerPurchase: number;
  /** Maximum total spend permitted across all purchases in a single day ($). */
  dailyCap: number;
  /** Allowed categories (case-insensitive), or null to permit all categories. */
  allowedCategories: string[] | null;
  /** Purchases above this dollar amount escalate to human approval. */
  requireHumanAbove: number;
  /** If the live catalog price drifts by more than this percentage, force re-approval. */
  requireReapprovalOnPriceChangePct: number;
  /** Master toggle. When false, every purchase falls back to require_human. */
  active: boolean;
}

export const DEFAULT_MANDATE: Mandate = {
  maxPerPurchase: 100,
  dailyCap: 300,
  allowedCategories: null,
  requireHumanAbove: 30,
  requireReapprovalOnPriceChangePct: 5,
  active: true,
};

/**
 * Stricter, dedicated spending mandate specifically governing external autonomous agent purchases.
 * Kept strictly isolated from the buyer-side human chat flow mandate.
 */
export const DEFAULT_AGENT_MANDATE: Mandate = {
  maxPerPurchase: 25,
  dailyCap: 50,
  allowedCategories: null,
  requireHumanAbove: 25,
  requireReapprovalOnPriceChangePct: 5,
  active: true,
};

