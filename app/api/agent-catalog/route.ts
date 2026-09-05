import { CATEGORIES, PRICING_CAPTURED_AT, VENDORS } from '@/lib/catalog/vendors';
import { DEFAULT_AGENT_MANDATE } from '@/lib/policy/mandate';
import { getAgentMandate } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/agent-catalog
 *
 * Machine-readable software procurement catalog for independent AI agents.
 * Exposes category taxonomy, vendor list, plan tiers, and self-describing
 * endpoints for quoting and purchasing without requiring any out-of-band documentation.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const agentMandate = await getAgentMandate().catch(() => DEFAULT_AGENT_MANDATE);

  const categories = CATEGORIES.map((cat) => ({
    slug: cat.slug,
    name: cat.label,
    aliases: cat.aliases,
    description: cat.description,
  }));

  const vendors = VENDORS.map((v) => ({
    slug: v.slug,
    name: v.name,
    category: v.category,
    url: v.url,
    tagline: v.tagline,
    description: v.description,
    trustScore: v.signals?.sentiment ? Math.round(v.signals.sentiment * 100) : 90,
    strengths: v.strengths,
    tradeoffs: v.tradeoffs,
    pricingTiers: v.tiers.map((t) => ({
      name: t.name,
      price: t.price,
      currency: 'USD',
      billingCycle: t.cycle,
      unit: t.unit,
      limits: t.limits ?? null,
      features: t.features,
    })),
  }));

  return Response.json(
    {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      version: '2026-09-01',
      name: 'Warden Autonomous Agent Catalog API',
      description:
        'Self-describing software procurement catalog and autonomous checkout API for tool-calling AI agents.',
      pricingCapturedAt: PRICING_CAPTURED_AT,
      endpoints: {
        catalog: {
          url: `${origin}/api/agent-catalog`,
          method: 'GET',
          description: 'Fetch the full vendor catalog, plans, and API schema.',
        },
        quote: {
          url: `${origin}/api/agent-catalog/quote`,
          method: 'POST',
          description:
            'Obtain a signed, time-limited cryptographic quote for a vendor and plan. Required prior to checkout.',
          requestSchema: {
            type: 'object',
            required: ['vendorSlug', 'planName'],
            properties: {
              vendorSlug: {
                type: 'string',
                description: 'Unique vendor slug from the catalog (e.g. "resend", "linear")',
              },
              planName: {
                type: 'string',
                description: 'Name of the chosen pricing tier (e.g. "Pro", "Standard")',
              },
              seats: {
                type: 'number',
                description: 'Optional seat count for per-user pricing (default: 1)',
                default: 1,
              },
            },
          },
        },
        purchase: {
          url: `${origin}/api/agent-catalog/purchase`,
          method: 'POST',
          description:
            'Execute an autonomous server-to-server purchase against a signed quote. Evaluated by Warden deterministic policy engine and settled via Razorpay.',
          requestSchema: {
            type: 'object',
            required: [
              'quoteId',
              'vendorSlug',
              'planName',
              'price',
              'currency',
              'expiresAt',
              'signature',
              'buyerAgentId',
              'buyerEmail',
            ],
            properties: {
              quoteId: { type: 'string', description: 'Quote ID returned by the quote endpoint' },
              vendorSlug: { type: 'string' },
              planName: { type: 'string' },
              price: { type: 'number', description: 'Price quoted by Warden' },
              currency: { type: 'string', enum: ['USD'] },
              expiresAt: { type: 'string', format: 'date-time' },
              signature: { type: 'string', description: 'Cryptographic HMAC signature from quote' },
              seats: { type: 'number', default: 1 },
              buyerAgentId: {
                type: 'string',
                description: 'Autonomous agent ID of the calling system',
              },
              buyerEmail: {
                type: 'string',
                description: 'Billing email associated with the autonomous buyer',
              },
            },
          },
        },
      },
      autonomousMandatePolicy: {
        maxPerPurchase: agentMandate.maxPerPurchase,
        dailySpendCap: agentMandate.dailyCap,
        currency: 'USD',
        active: agentMandate.active,
        rule: `Autonomous agent purchases are governed by Warden deterministic policy engine: capped at $${agentMandate.maxPerPurchase}.00/purchase and $${agentMandate.dailyCap}.00 daily total. Purchases exceeding these limits are blocked automatically.`,
      },
      categories,
      vendors,
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300',
      },
    },
  );
}
