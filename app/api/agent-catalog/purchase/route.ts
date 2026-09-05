import { getVendor } from '@/lib/catalog/vendors';
import { verifyQuote, type SignedQuote } from '@/lib/agent-catalog/quote';
import { evaluatePurchase } from '@/lib/policy/engine';
import { createOrder } from '@/lib/razorpay/client';
import {
  COMPANY_ID,
  getAgentMandate,
  getTodayAgentAuthorizedSpend,
  insertApprovalDirect,
  recordPolicyDecision,
  recordPurchase,
} from '@/lib/store';
import type { Approval } from '@/lib/types';
import { id } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface PurchaseRequestBody extends SignedQuote {
  buyerAgentId?: string;
  buyerEmail?: string;
}

/**
 * POST /api/agent-catalog/purchase
 *
 * The ONLY place where an automated caller (not a human click) is allowed
 * to trigger a real payment.
 *
 * Gated by:
 * 1. Cryptographic quote signature & expiry validation (anti-tampering freshness).
 * 2. Deterministic policy engine evaluation (`evaluatePurchase`) using a dedicated,
 *    strict mandate scoped specifically to autonomous agent purchases
 *    (e.g. maxPerPurchase: 25, dailyCap: 50).
 * 3. Razorpay Orders API server-to-server transaction.
 * 4. Immutable store writes with `source: 'autonomous_agent'` for audit trail visibility.
 */
export async function POST(request: Request) {
  let body: PurchaseRequestBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON request body' }, { status: 400 });
  }

  const {
    quoteId,
    vendorSlug,
    planName,
    price,
    currency = 'USD',
    billingCycle = 'monthly',
    expiresAt,
    signature,
    seats = 1,
    buyerAgentId,
    buyerEmail,
  } = body;

  // 1. Validate required fields
  if (!quoteId || !vendorSlug || !planName || price === undefined || !expiresAt || !signature) {
    return Response.json(
      {
        error:
          'Missing required quote parameters: quoteId, vendorSlug, planName, price, expiresAt, signature',
      },
      { status: 400 },
    );
  }

  if (!buyerAgentId || typeof buyerAgentId !== 'string') {
    return Response.json(
      { error: 'Missing required parameter: buyerAgentId (unique caller agent identifier)' },
      { status: 400 },
    );
  }

  if (!buyerEmail || typeof buyerEmail !== 'string') {
    return Response.json(
      { error: 'Missing required parameter: buyerEmail (buyer billing contact)' },
      { status: 400 },
    );
  }

  // 2. Cryptographic signature and expiry verification
  const verification = verifyQuote({
    quoteId,
    vendorSlug,
    vendorName: body.vendorName || vendorSlug,
    planName,
    seats,
    price: Number(price),
    currency,
    billingCycle,
    expiresAt,
    signature,
  });

  if (!verification.valid) {
    const isExpired = verification.reason?.includes('expired');
    return Response.json(
      {
        error: verification.reason || 'Cryptographic quote signature verification failed.',
        code: isExpired ? 'QUOTE_EXPIRED' : 'SIGNATURE_INVALID',
      },
      { status: isExpired ? 410 : 401 },
    );
  }

  // 3. Resolve vendor from catalog
  const vendor = getVendor(vendorSlug);
  if (!vendor) {
    return Response.json(
      { error: `Vendor "${vendorSlug}" not found in catalog.` },
      { status: 404 },
    );
  }

  // 4. Construct approval record for deterministic policy engine check
  const now = new Date().toISOString();
  const approvalId = id('apr');
  const approval: Approval = {
    id: approvalId,
    company_id: COMPANY_ID,
    requested_by: `${buyerAgentId} (${buyerEmail})`,
    approved_by: 'autonomous_agent',
    status: 'approved',
    vendor: vendor.name,
    vendor_slug: vendor.slug,
    category: vendor.category,
    plan: planName,
    price: Number(price),
    currency,
    billing_cycle: billingCycle as any,
    reasoning: `Autonomous external agent purchase executed by ${buyerAgentId} via Warden Agent-Catalog API.`,
    pros: vendor.strengths || [],
    cons: vendor.tradeoffs || [],
    trust_score: vendor.signals?.sentiment ? Math.round(vendor.signals.sentiment * 100) : 90,
    monthly_saving: 0,
    created_at: now,
    decided_at: now,
  };

  // 5. Deterministic Policy Engine evaluation using the autonomous agent mandate
  const agentMandate = await getAgentMandate();
  const todayAgentSpend = await getTodayAgentAuthorizedSpend();
  const evaluation = await evaluatePurchase(approval, agentMandate, {
    todayAuthorizedSpend: todayAgentSpend,
  });

  // Record immutable PolicyDecision audit log
  await recordPolicyDecision({
    approval_id: approval.id,
    decision: evaluation.decision,
    reason: evaluation.reason,
    mandate_snapshot: agentMandate,
  });

  // Handle policy denial
  if (evaluation.decision === 'deny') {
    await insertApprovalDirect({
      ...approval,
      status: 'denied_by_policy',
      approved_by: null,
      policy_decision: 'deny',
      policy_reason: evaluation.reason,
    });

    return Response.json(
      {
        success: false,
        decision: 'deny',
        error: `Purchase blocked by autonomous agent spending mandate: ${evaluation.reason}`,
        reason: evaluation.reason,
        approvalId: approval.id,
        mandateLimits: {
          maxPerPurchase: agentMandate.maxPerPurchase,
          dailySpendCap: agentMandate.dailyCap,
          rule: 'Autonomous external agent purchases cannot exceed $25.00 single purchase or $50.00 daily spend.',
        },
      },
      { status: 403 },
    );
  }

  // Autonomous callers cannot satisfy human clicks
  if (evaluation.decision === 'require_human') {
    const reason = `Purchase of $${approval.price} exceeds autonomous agent limit ($${agentMandate.maxPerPurchase}). Human escalation is disabled for autonomous agents.`;
    await insertApprovalDirect({
      ...approval,
      status: 'denied_by_policy',
      approved_by: null,
      policy_decision: 'deny',
      policy_reason: reason,
    });

    return Response.json(
      {
        success: false,
        decision: 'deny',
        error: `Purchase blocked: ${reason}`,
        reason,
        approvalId: approval.id,
        mandateLimits: {
          maxPerPurchase: agentMandate.maxPerPurchase,
          dailySpendCap: agentMandate.dailyCap,
        },
      },
      { status: 403 },
    );
  }

  if (evaluation.decision === 'reapprove') {
    return Response.json(
      {
        success: false,
        decision: 'reapprove',
        error: `Catalog price has drifted: ${evaluation.reason}. Please obtain a fresh quote.`,
      },
      { status: 409 },
    );
  }

  // 6. Policy Verdict is auto_allow: Persist approved approval record
  await insertApprovalDirect({
    ...approval,
    status: 'approved',
    approved_by: 'autonomous_agent',
    policy_decision: 'auto_allow',
    policy_reason: evaluation.reason,
  });

  // 7. Create Razorpay order via S2S flow
  let order;
  try {
    order = await createOrder({
      amount: approval.price,
      currency: approval.currency,
      receipt: `rcpt_agent_${approval.id.slice(0, 20)}`,
      notes: {
        approval_id: approval.id,
        vendor: vendor.name,
        plan: planName,
        buyerAgentId,
        buyerEmail,
        source: 'autonomous_agent',
        channel: 'agent_catalog_s2s',
      },
    });
  } catch (err) {
    return Response.json(
      {
        success: false,
        error:
          err instanceof Error
            ? err.message
            : 'Failed to create payment order with payment gateway.',
      },
      { status: 502 },
    );
  }

  // 8. Record the Purchase with source: 'autonomous_agent'
  const paymentRef = `pay_s2s_${order.id.replace('order_', '')}`;
  const { purchase, invoice, transaction } = await recordPurchase({
    vendor: vendor.name,
    vendorSlug: vendor.slug,
    category: vendor.category,
    product: planName,
    price: approval.price,
    currency: approval.currency,
    billingCycle: approval.billing_cycle,
    trustScore: approval.trust_score,
    reasoning: approval.reasoning,
    approvalId: approval.id,
    sessionId: order.id,
    orderId: order.id,
    txnRefId: paymentRef,
    cardLast4: '8888',
    simulated: order.simulated,
    provider: order.simulated ? 'razorpay_simulated' : 'razorpay',
    source: 'autonomous_agent',
  });

  // 9. Respond with full machine-readable settlement payload
  return Response.json(
    {
      success: true,
      decision: 'auto_allow',
      message:
        'Purchase authorized autonomously by Warden deterministic policy engine and executed via Razorpay S2S Orders flow.',
      order: {
        id: order.id,
        amount: order.amount,
        currency: order.currency,
        status: order.status,
        simulated: order.simulated,
        s2sPaymentMethod: 'Razorpay Direct Server-to-Server Order',
        note: order.simulated
          ? 'Executed in Razorpay simulated mode. Transaction settled immediately.'
          : 'Razorpay order created and captured via agent corporate payment token.',
      },
      purchase: {
        id: purchase.id,
        vendor: purchase.vendor,
        plan: purchase.product,
        price: purchase.price,
        currency: purchase.currency,
        status: purchase.status,
        source: purchase.source,
        invoiceUrl: purchase.invoice_url,
        invoiceNumber: invoice.number,
        transactionId: transaction.id,
        paymentId: paymentRef,
        createdAt: purchase.created_at,
      },
      policyAudit: {
        approvalId: approval.id,
        verdict: 'ALLOW',
        reason: evaluation.reason,
        mandate: {
          maxPerPurchase: agentMandate.maxPerPurchase,
          dailyCap: agentMandate.dailyCap,
        },
      },
    },
    { status: 200 },
  );
}
