import crypto from 'node:crypto';
import { listApprovals, getApproval } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Dev-only simulation endpoint to fire a realistic payment.failed webhook.
 *
 * Constructs a legitimate Razorpay event payload, signs it with
 * RAZORPAY_WEBHOOK_SECRET, and delivers it to POST /api/razorpay/webhook
 * through the exact same verification and execution path as production.
 */
export async function POST(request: Request) {
  let body: { approvalId?: string; paymentId?: string } = {};
  try {
    body = await request.json();
  } catch {
    // Body is optional; defaults to latest approval
  }

  let approval;
  if (body.approvalId) {
    approval = await getApproval(body.approvalId);
  } else {
    const approvals = await listApprovals();
    // Prefer approved or pending approvals
    approval =
      approvals.find((a) => a.status === 'approved' || a.status === 'pending') ??
      approvals[0];
  }

  if (!approval) {
    return Response.json(
      { error: 'No approvals found to simulate failure for.' },
      { status: 404 },
    );
  }

  const paymentId = body.paymentId || `pay_fail_${Date.now().toString(36)}`;
  const orderId = `order_${approval.id.slice(0, 20)}`;

  const webhookPayload = {
    entity: 'event',
    account_id: 'acc_demo_parch',
    event: 'payment.failed',
    contains: ['payment'],
    payload: {
      payment: {
        entity: {
          id: paymentId,
          entity: 'payment',
          amount: Math.round(approval.price * 100),
          currency: approval.currency || 'USD',
          status: 'failed',
          order_id: orderId,
          method: 'card',
          error_code: 'BAD_REQUEST_ERROR',
          error_description:
            'Payment failed at issuing bank: Insufficient funds or card declined.',
          error_source: 'issuing_bank',
          error_step: 'payment_authorization',
          error_reason: 'card_declined',
          notes: {
            approval_id: approval.id,
            approvalId: approval.id,
            vendor: approval.vendor,
            plan: approval.plan,
          },
          created_at: Math.floor(Date.now() / 1000),
        },
      },
    },
  };

  const rawBody = JSON.stringify(webhookPayload);
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET || 'parch_rzp_mock_secret';
  const signature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

  // Deliver to the webhook endpoint internally
  const url = new URL('/api/razorpay/webhook', request.url);
  const webhookResponse = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-razorpay-signature': signature,
    },
    body: rawBody,
  });

  const webhookResult = await webhookResponse.json();

  return Response.json({
    simulated: true,
    paymentId,
    orderId,
    approvalId: approval.id,
    vendor: approval.vendor,
    price: approval.price,
    webhookStatus: webhookResponse.status,
    webhookResult,
  });
}
