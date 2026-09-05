import { getVendor } from '@/lib/catalog/vendors';
import { signQuote } from '@/lib/agent-catalog/quote';
import { id } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface QuoteRequestBody {
  vendorSlug?: string;
  planName?: string;
  seats?: number;
}

/**
 * POST /api/agent-catalog/quote
 *
 * Generates an HMAC-signed, time-limited quote for an external autonomous agent.
 * Acts as the cryptographic freshness and anti-tampering guarantee.
 */
export async function POST(request: Request) {
  let body: QuoteRequestBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON request body' }, { status: 400 });
  }

  const { vendorSlug, planName, seats: rawSeats } = body;

  if (!vendorSlug || typeof vendorSlug !== 'string') {
    return Response.json(
      { error: 'Missing required string parameter: vendorSlug' },
      { status: 400 },
    );
  }

  if (!planName || typeof planName !== 'string') {
    return Response.json(
      { error: 'Missing required string parameter: planName' },
      { status: 400 },
    );
  }

  const vendor = getVendor(vendorSlug);
  if (!vendor) {
    return Response.json(
      { error: `Vendor "${vendorSlug}" does not exist in Warden catalog.` },
      { status: 404 },
    );
  }

  const tier = vendor.tiers.find(
    (t) => t.name.toLowerCase() === planName.trim().toLowerCase(),
  );

  if (!tier) {
    const availablePlans = vendor.tiers.map((t) => t.name);
    return Response.json(
      {
        error: `Plan "${planName}" was not found for vendor "${vendor.name}". Available plans: ${availablePlans.join(', ')}`,
      },
      { status: 404 },
    );
  }

  const seats = Number.isInteger(rawSeats) && (rawSeats as number) > 0 ? (rawSeats as number) : 1;
  const isPerSeat =
    tier.unit.includes('per user') ||
    tier.unit.includes('per editor') ||
    tier.unit.includes('per seat');

  const unitPrice = tier.price;
  const totalPrice = isPerSeat ? unitPrice * seats : unitPrice;
  const currency = 'USD';
  const billingCycle = tier.cycle;

  // 15-minute time-to-live
  const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
  const quoteId = id('quo');

  const unsignedQuote = {
    quoteId,
    vendorSlug: vendor.slug,
    vendorName: vendor.name,
    planName: tier.name,
    seats,
    price: totalPrice,
    currency,
    billingCycle,
    expiresAt,
  };

  const signature = signQuote(unsignedQuote);

  const signedQuote = {
    ...unsignedQuote,
    signature,
    unitPrice,
    unit: tier.unit,
    limits: tier.limits ?? null,
    purchaseInstructions: {
      endpoint: '/api/agent-catalog/purchase',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      requiredPayload: {
        quoteId,
        vendorSlug: vendor.slug,
        planName: tier.name,
        price: totalPrice,
        currency,
        expiresAt,
        signature,
        buyerAgentId: '<your-agent-id>',
        buyerEmail: '<your-billing-email>',
      },
    },
  };

  return Response.json(signedQuote, { status: 200 });
}
