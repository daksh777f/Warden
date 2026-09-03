import { verifyWebhookSignature } from '@/lib/razorpay/client';
import {
  findTransactionByOrderId,
  findTransactionByPaymentId,
  getApproval,
  recordFailedPayment,
  recordPurchase,
} from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Razorpay Webhook Handler
 *
 * Verifies the webhook signature using RAZORPAY_WEBHOOK_SECRET,
 * handles `payment.captured` and `payment.failed`,
 * and idempotently writes Purchase, Subscription, and Invoice records
 * to the store using payment_id as the idempotency key.
 */
export async function POST(request: Request) {
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return Response.json({ error: 'Failed to read request body' }, { status: 400 });
  }

  const signature = request.headers.get('x-razorpay-signature');
  if (!signature) {
    return Response.json({ error: 'Missing x-razorpay-signature header' }, { status: 400 });
  }

  // 1. Verify webhook signature before doing anything else
  const isValid = verifyWebhookSignature(rawBody, signature);
  if (!isValid) {
    return Response.json({ error: 'Invalid webhook signature' }, { status: 400 });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const eventType = event?.event;

  // 2. Handle payment.captured
  if (eventType === 'payment.captured') {
    const payment = event?.payload?.payment?.entity;
    if (!payment?.id) {
      return Response.json({ error: 'Missing payment entity in payload' }, { status: 400 });
    }

    const paymentId: string = payment.id;
    const orderId: string | null = payment.order_id ?? null;

    // Idempotency check: if this payment was already recorded, do nothing
    const existingTxn = await findTransactionByPaymentId(paymentId);
    if (existingTxn) {
      return Response.json({
        status: 'ok',
        message: 'Payment already recorded',
        paymentId,
        idempotent: true,
      });
    }

    const approvalId: string | undefined =
      payment.notes?.approval_id ||
      payment.notes?.approvalId ||
      event?.payload?.order?.entity?.notes?.approval_id ||
      event?.payload?.order?.entity?.notes?.approvalId;

    if (!approvalId) {
      console.warn('[razorpay:webhook] payment.captured received without approval_id in notes', {
        paymentId,
        orderId,
      });
      return Response.json(
        { status: 'ignored', message: 'No approval_id found in payment or order notes' },
        { status: 200 },
      );
    }

    const approval = await getApproval(approvalId);
    if (!approval) {
      console.warn('[razorpay:webhook] Approval not found for payment', { approvalId, paymentId });
      return Response.json(
        { error: `Approval ${approvalId} not found` },
        { status: 404 },
      );
    }

    const cardLast4 =
      payment.card?.last4 ??
      (typeof payment.card_id === 'string' ? payment.card_id.slice(-4) : null) ??
      null;

    const isSimulated =
      Boolean(paymentId.startsWith('pay_sim_')) ||
      Boolean(orderId?.startsWith('order_sim_'));

    await recordPurchase({
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
      sessionId: orderId || paymentId,
      orderId,
      txnRefId: paymentId,
      cardLast4,
      simulated: isSimulated,
      provider: isSimulated ? 'razorpay_simulated' : 'razorpay',
    });

    return Response.json({ status: 'ok', paymentId, captured: true });
  }

  // 3. Handle payment.failed
  if (eventType === 'payment.failed') {
    const payment = event?.payload?.payment?.entity;
    if (!payment?.id) {
      return Response.json({ error: 'Missing payment entity in payload' }, { status: 400 });
    }

    const paymentId: string = payment.id;
    const orderId: string | null = payment.order_id ?? null;

    // Idempotency check: if this failure was already recorded, do not duplicate
    const existingTxn = await findTransactionByPaymentId(paymentId);
    if (existingTxn) {
      return Response.json({
        status: 'ok',
        message: 'Payment failure already recorded',
        paymentId,
        idempotent: true,
      });
    }

    let approvalId: string | undefined =
      payment.notes?.approval_id ||
      payment.notes?.approvalId ||
      event?.payload?.order?.entity?.notes?.approval_id ||
      event?.payload?.order?.entity?.notes?.approvalId;

    if (!approvalId && orderId) {
      const existing = await findTransactionByOrderId(orderId);
      if (existing?.approval_id) approvalId = existing.approval_id;
    }

    if (!approvalId) {
      console.warn('[razorpay:webhook] payment.failed received without approval_id', {
        paymentId,
        orderId,
      });
      return Response.json(
        { status: 'ignored', message: 'No approval_id found in payment or order notes' },
        { status: 200 },
      );
    }

    const approval = await getApproval(approvalId);
    if (!approval) {
      console.warn('[razorpay:webhook] Approval not found for payment failure', {
        approvalId,
        paymentId,
      });
      return Response.json({ error: `Approval ${approvalId} not found` }, { status: 404 });
    }

    const isSimulated =
      Boolean(paymentId.startsWith('pay_fail_')) ||
      Boolean(paymentId.startsWith('pay_sim_')) ||
      Boolean(orderId?.startsWith('order_sim_'));

    // Record the failed transaction without creating a Purchase row, and transition Approval to 'payment_failed'
    await recordFailedPayment({
      approvalId: approval.id,
      orderId,
      paymentId,
      amount: payment.amount ? payment.amount / 100 : approval.price,
      currency: payment.currency || approval.currency,
      errorCode: payment.error_code,
      errorDescription: payment.error_description,
      simulated: isSimulated,
    });

    return Response.json({
      status: 'ok',
      message: 'Recorded payment failure and marked approval as payment_failed',
      paymentId,
      approvalId: approval.id,
    });
  }

  // Other unhandled events
  return Response.json({ status: 'ok', ignored: true, event: eventType });
}
