import { executeTool, newToolContext } from '@/lib/tools';
import { getVendor } from '@/lib/catalog/vendors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/approvals
 *
 * Reuses the existing `requestApproval` tool to create a second, separate
 * Approval record for an accepted upsell or optimization.
 *
 * Subject to Phase 2 spending mandate policy evaluation and Phase 3 audit logging.
 */
export async function POST(request: Request) {
  let body: { vendor?: string; vendorSlug?: string; plan?: string; seats?: number };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const vendorKey = body.vendor || body.vendorSlug;
  if (!vendorKey || !body.plan) {
    return Response.json({ error: 'vendor and plan are required' }, { status: 400 });
  }

  const requestedBy = process.env.DEMO_USER_EMAIL || 'founder@acme.dev';
  const ctx = newToolContext(requestedBy);
  ctx.seats = body.seats || 1;

  // Synthesize recommendation context for the selected vendor & plan
  const vendor = getVendor(vendorKey);
  const tier = vendor?.tiers.find(
    (t) => t.name.toLowerCase() === body.plan!.toLowerCase(),
  ) ?? vendor?.tiers[0];

  const perSeat =
    tier &&
    (tier.unit.includes('per user') ||
      tier.unit.includes('per editor') ||
      tier.unit.includes('per seat'));
  const price = tier
    ? Math.round((perSeat ? tier.price * ctx.seats : tier.price) * 100) / 100
    : 0;

  ctx.recommendation = {
    slug: vendor?.slug ?? vendorKey,
    vendor: vendor?.name ?? vendorKey,
    plan: tier?.name ?? body.plan,
    price,
    cycle: tier?.cycle ?? 'monthly',
    currency: 'USD',
    reasoning: `Upgraded to ${vendor?.name ?? vendorKey} ${tier?.name ?? body.plan} via optimization suggestion.`,
    pros: tier?.features ?? vendor?.strengths.slice(0, 3) ?? [],
    cons: vendor?.tradeoffs.slice(0, 2) ?? [],
    monthlySaving: 0,
  };

  try {
    const outcome = await executeTool(
      'requestApproval',
      { vendor: vendorKey, plan: body.plan },
      ctx,
    );

    return Response.json({
      success: true,
      approval: ctx.approval,
      recommendation: ctx.recommendation,
      purchase: ctx.purchase ?? null,
      result: outcome.result,
    });
  } catch (err) {
    return Response.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to request approval',
      },
      { status: 500 },
    );
  }
}
