import { getVendor } from '@/lib/catalog/vendors';
import { verifyApproval } from '@/lib/approvals/proof';
import { evaluatePurchase } from '@/lib/policy/engine';
import { createOrder, razorpayKeyId, razorpayMode } from '@/lib/razorpay/client';
import { decideApproval, getApproval, getMandate, recordPolicyDecision, updateApproval } from '@/lib/store';
import type { Approval } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The human decision point.
 *
 * Approving re-evaluates the mandate via the deterministic policy engine,
 * records the evaluation audit decision, and if permitted creates a Razorpay
 * order for the exact amount. The agent never reaches this route — the
 * browser does, in response to a click.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  let body: { decision?: 'approve' | 'decline'; approval?: Approval; price?: number };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // On distributed/serverless environments, separate route handlers can
  // execute in different isolated instances, so the file/memory fallback
  // may not contain the approval made by /api/chat. The signed payload is
  // the portable source of truth.
  const storedApproval = await getApproval(id);
  const portableApproval =
    body.approval?.id === id && verifyApproval(body.approval) ? body.approval : null;
  let approval = storedApproval ?? portableApproval;
  if (!approval) {
    return Response.json(
      { error: 'This approval expired. Ask Warden to prepare it again.' },
      { status: 404 },
    );
  }
  if (approval.status !== 'pending' && approval.status !== 'payment_failed') {
    return Response.json(
      { error: `This request was already ${approval.status}.` },
      { status: 409 },
    );
  }

  const approvedBy = process.env.DEMO_USER_EMAIL || 'founder@acme.dev';

  if (body.decision === 'decline') {
    const declined =
      (await decideApproval(id, 'declined', approvedBy)) ?? {
        ...approval,
        status: 'declined' as const,
        approved_by: approvedBy,
        decided_at: new Date().toISOString(),
      };
    return Response.json({ approval: declined, session: null });
  }

  if (body.decision !== 'approve') {
    return Response.json({ error: 'decision must be "approve" or "decline"' }, { status: 400 });
  }

  // If a human is confirming a drifted price, update the price
  if (body.price && body.price > 0 && body.price !== approval.price) {
    approval.price = body.price;
    await updateApproval(id, { price: body.price });
  }

  // Never trust a stale evaluation — evaluatePurchase runs AGAIN before calling Razorpay
  const mandate = await getMandate();
  const evaluation = await evaluatePurchase(approval, mandate);

  // Record PolicyDecision record for audit trail
  await recordPolicyDecision({
    approval_id: approval.id,
    decision: evaluation.decision,
    reason: evaluation.reason,
    mandate_snapshot: mandate,
  });

  if (evaluation.decision === 'deny') {
    await updateApproval(id, {
      status: 'denied_by_policy',
      policy_decision: 'deny',
      policy_reason: evaluation.reason,
      decided_at: new Date().toISOString(),
    });
    return Response.json(
      { error: `Purchase blocked by spending mandate: ${evaluation.reason}`, decision: 'deny' },
      { status: 403 },
    );
  }

  if (evaluation.decision === 'reapprove') {
    await updateApproval(id, {
      policy_decision: 'reapprove',
      policy_reason: evaluation.reason,
      policy_drift: {
        oldPrice: evaluation.oldPrice,
        newPrice: evaluation.newPrice,
        diffPct: evaluation.diffPct,
      },
    });
    return Response.json(
      {
        error: `Price has drifted: ${evaluation.reason}`,
        decision: 'reapprove',
        drift: {
          oldPrice: evaluation.oldPrice,
          newPrice: evaluation.newPrice,
          diffPct: evaluation.diffPct,
        },
      },
      { status: 409 },
    );
  }

  const vendor = getVendor(approval.vendor_slug);

  let order;
  try {
    order = await createOrder({
      amount: approval.price,
      currency: approval.currency,
      receipt: `rcpt_${approval.id.slice(0, 30)}`,
      notes: {
        approval_id: approval.id,
        approvalId: approval.id,
        vendor: approval.vendor,
        plan: approval.plan,
        vendor_slug: approval.vendor_slug,
        user_email: approvedBy,
        vendor_url: vendor?.url ?? `https://${approval.vendor_slug}.com`,
      },
    });
  } catch (error) {
    // Leave the approval pending so the founder can retry the payment
    // without the agent having to redo the research.
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : 'Could not create a Razorpay order.',
      },
      { status: 502 },
    );
  }

  const updated =
    (await decideApproval(id, 'approved', approvedBy)) ?? {
      ...approval,
      status: 'approved' as const,
      approved_by: approvedBy,
      decided_at: new Date().toISOString(),
    };

  return Response.json({
    approval: updated,
    order,
    session: {
      order_id: order.id,
      session_id: order.id,
      session_token: order.id,
      iframe_url: '',
      expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
      amount: order.amount,
      currency: order.currency,
      simulated: order.simulated,
      key_id: razorpayKeyId(),
    },
    mode: razorpayMode(),
    publishableKey: razorpayKeyId(),
  });
}
