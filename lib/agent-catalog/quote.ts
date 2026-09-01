import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';

export interface SignedQuote {
  quoteId: string;
  vendorSlug: string;
  vendorName: string;
  planName: string;
  seats: number;
  price: number;
  currency: string;
  billingCycle: string;
  expiresAt: string;
  signature: string;
}

function signingSecret() {
  return (
    process.env.APPROVAL_SIGNING_SECRET ||
    process.env.RAZORPAY_KEY_SECRET ||
    process.env.MERCHANT_SECRET_KEY ||
    process.env.OPENAI_API_KEY ||
    'parch-local-demo-signing-key'
  );
}

function quotePayload(quote: Omit<SignedQuote, 'signature'>): string {
  return JSON.stringify({
    quoteId: quote.quoteId,
    vendorSlug: quote.vendorSlug,
    planName: quote.planName,
    seats: quote.seats,
    price: quote.price,
    currency: quote.currency,
    billingCycle: quote.billingCycle,
    expiresAt: quote.expiresAt,
  });
}

export function signQuote(quote: Omit<SignedQuote, 'signature'>): string {
  return createHmac('sha256', signingSecret())
    .update(quotePayload(quote))
    .digest('hex');
}

export function verifyQuote(quote: SignedQuote): { valid: boolean; reason?: string } {
  if (!quote.signature || !quote.quoteId || !quote.expiresAt) {
    return { valid: false, reason: 'Missing signature or quote parameters' };
  }

  // Expiry check
  const expiresAtMs = new Date(quote.expiresAt).getTime();
  if (!Number.isFinite(expiresAtMs) || expiresAtMs < Date.now()) {
    return { valid: false, reason: 'Quote has expired. Obtain a fresh quote.' };
  }

  // Signature check
  try {
    const expectedHex = signQuote(quote);
    const expectedBuf = Buffer.from(expectedHex, 'hex');
    const receivedBuf = Buffer.from(quote.signature, 'hex');

    if (expectedBuf.length !== receivedBuf.length) {
      return { valid: false, reason: 'Invalid signature length or format' };
    }

    const matches = timingSafeEqual(expectedBuf, receivedBuf);
    if (!matches) {
      return {
        valid: false,
        reason: 'Invalid quote signature. Price or quote parameters were modified.',
      };
    }

    return { valid: true };
  } catch (err) {
    return { valid: false, reason: 'Cryptographic signature verification failed' };
  }
}
