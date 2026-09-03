import { verifyApproval } from '@/lib/approvals/proof';
import { verifyPaymentSignature } from '@/lib/razorpay/client';
import { findPurchaseByPaymentId, getApproval, recordPurchase } from '@/lib/store';
import type { Approval } from '@/lib/types';
import { formatMoney } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface VerifyRequestBody {
  orderId?: string;
  paymentId?: string;
  signature?: string;
  approvalId?: string;
  approval?: Approval;
  simulated?: boolean;
}

/**
 * Endpoint called by the frontend CheckoutModal once Checkout.js completes
 * (or immediately after simulated approval).
 *
 * Verifies the HMAC-SHA256 signature, ensures idempotent store writes,
 * and returns the recorded purchase and receipt.
 */
export async function POST(request: Request) {
  let body: VerifyRequestBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { orderId, paymentId, signature, approvalId, simulated } = body;

  if (!orderId || !paymentId) {
    return Response.json(
      { error: 'orderId and paymentId are required' },
      { status: 400 },
    );
  }

  const isSimulated =
    Boolean(simulated) ||
    orderId.startsWith('order_sim_') ||
    paymentId.startsWith('pay_sim_');

  // Verify signature if not in simulated mode
  if (!isSimulated) {
    if (!signature) {
      return Response.json(
        { error: 'Payment signature is required' },
        { status: 400 },
      );
    }

    const isValid = verifyPaymentSignature(orderId, paymentId, signature);
    if (!isValid) {
      return Response.json(
        { error: 'Invalid payment signature' },
        { status: 400 },
      );
    }
  }

  // Idempotency: check if this payment was already written (e.g. by webhook)
  const existing = await findPurchaseByPaymentId(paymentId);
  if (existing) {
    return Response.json({
      status: 'completed',
      simulated: isSimulated,
      purchase: existing.purchase,
      subscription: existing.subscription,
      invoice: existing.invoice,
      receipt: {
        transactionId: paymentId,
        orderId,
        merchant: existing.purchase.vendor,
        amount: formatMoney(existing.purchase.price, existing.purchase.currency),
        tokenLast4: existing.purchase.card_last4,
        expiry: null,
      },
    });
  }

  // Find the approval record
  const storedApproval = approvalId ? await getApproval(approvalId) : null;
  const submittedApproval = body.approval;
  const portableApproval =
    submittedApproval &&
    submittedApproval.id === approvalId &&
    verifyApproval(submittedApproval)
      ? submittedApproval
      : null;
  const approval = storedApproval ?? portableApproval;

  if (!approval) {
    return Response.json(
      { error: 'The approval behind this payment could not be found' },
      { status: 404 },
    );
  }

  const { purchase, subscription, invoice, transaction } = await recordPurchase({
    vendor: approval.vendor,
    vendorSlug: approval.vendor_slug,
    category: approval.category,
    product: approval.plan,
    price: approval.price,
    currency: approval.currency,
    billingCycle: approval.billing_cycle,
    trustScore: approval.trust_score,
    reasoning: approval.reasoning,
    monthlySaving: approval.monthly_saving ?? undefined,
    approvalId: approval.id,
    sessionId: orderId,
    orderId,
    txnRefId: paymentId,
    cardLast4: isSimulated ? '1111' : null,
    simulated: isSimulated,
    provider: isSimulated ? 'razorpay_simulated' : 'razorpay',
    source: 'human_approved',
  });

  return Response.json({
    status: 'completed',
    simulated: isSimulated,
    purchase,
    subscription,
    invoice,
    receipt: {
      transactionId: transaction.id,
      orderId,
      merchant: approval.vendor,
      amount: formatMoney(approval.price, approval.currency),
      tokenLast4: purchase.card_last4,
      expiry: null,
    },
  });
}
