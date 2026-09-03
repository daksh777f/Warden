import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';
import Razorpay from 'razorpay';

// ─────────────────────────────────────────────────────────────
// Razorpay — payment stack for Parch.
//
// Flow:
//   1. server  POST /api/approvals/[id]             → creates Razorpay order
//   2. browser opens Razorpay Checkout.js widget    → user pays with card
//   3. browser calls /api/razorpay/verify           → validates signature & confirms
//   4. server  POST /api/razorpay/webhook           → processes payment.captured
//
// Without RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET, this module runs in
// simulated mode: identical shapes, fake order IDs, no network calls,
// clearly labeled `simulated: true` so the demo boots with zero configuration.
// ─────────────────────────────────────────────────────────────

export interface CreateOrderInput {
  amount: number; // in primary currency unit (e.g. 20.00 for $20)
  currency?: string;
  receipt?: string;
  notes?: Record<string, string>;
}

export interface RazorpayOrder {
  id: string;
  entity: string;
  amount: number; // in subunits (e.g. 2000 for $20.00)
  amount_paid: number;
  amount_due: number;
  currency: string;
  receipt: string | null;
  status: 'created' | 'attempted' | 'paid' | string;
  attempts: number;
  notes: Record<string, string>;
  created_at: number;
  simulated: boolean;
  key_id: string | null;
}

export function razorpayConfigured(): boolean {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  return Boolean(
    keyId &&
      keySecret &&
      !keyId.includes('YOUR_KEY_ID') &&
      !keySecret.includes('YOUR_KEY_SECRET'),
  );
}

export function razorpayMode(): 'live' | 'test' | 'simulated' {
  if (!razorpayConfigured()) return 'simulated';
  return process.env.RAZORPAY_KEY_ID?.startsWith('rzp_live_') ? 'live' : 'test';
}

export function razorpayKeyId(): string | null {
  if (!razorpayConfigured()) return null;
  return (
    process.env.RAZORPAY_KEY_ID ||
    process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ||
    null
  );
}

function getRazorpayInstance(): Razorpay {
  const key_id = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key_id || !key_secret) {
    throw new Error('RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET is not configured');
  }
  return new Razorpay({ key_id, key_secret });
}

// ── Simulated Mode Store ──────────────────────────────────────
interface SimulatedOrderRecord {
  createdAt: number;
  order: RazorpayOrder;
}

const globalRef = globalThis as typeof globalThis & {
  __razorpaySimulatedOrders?: Map<string, SimulatedOrderRecord>;
};

function simulatedOrders(): Map<string, SimulatedOrderRecord> {
  globalRef.__razorpaySimulatedOrders ??= new Map();
  return globalRef.__razorpaySimulatedOrders;
}

function simulateOrder(input: CreateOrderInput): RazorpayOrder {
  const rand = Math.random().toString(36).slice(2, 12);
  const orderId = `order_sim_${rand}`;
  const subunitAmount = Math.round(input.amount * 100);

  const order: RazorpayOrder = {
    id: orderId,
    entity: 'order',
    amount: subunitAmount,
    amount_paid: 0,
    amount_due: subunitAmount,
    currency: input.currency ?? 'USD',
    receipt: input.receipt ?? `rcpt_sim_${rand.slice(0, 6)}`,
    status: 'created',
    attempts: 0,
    notes: input.notes ?? {},
    created_at: Math.floor(Date.now() / 1000),
    simulated: true,
    key_id: null,
  };

  simulatedOrders().set(orderId, { createdAt: Date.now(), order });
  return order;
}

// ── 1. Create Order ───────────────────────────────────────────

export async function createOrder(input: CreateOrderInput): Promise<RazorpayOrder> {
  if (!razorpayConfigured()) {
    return simulateOrder(input);
  }

  const rzp = getRazorpayInstance();
  const subunitAmount = Math.round(input.amount * 100);

  const rawOrder = await rzp.orders.create({
    amount: subunitAmount,
    currency: input.currency ?? 'USD',
    receipt: input.receipt,
    notes: input.notes,
  });

  return {
    id: rawOrder.id,
    entity: rawOrder.entity ?? 'order',
    amount: Number(rawOrder.amount),
    amount_paid: Number(rawOrder.amount_paid ?? 0),
    amount_due: Number(rawOrder.amount_due ?? rawOrder.amount),
    currency: rawOrder.currency,
    receipt: rawOrder.receipt ?? null,
    status: rawOrder.status ?? 'created',
    attempts: rawOrder.attempts ?? 0,
    notes: (rawOrder.notes as Record<string, string>) ?? {},
    created_at: Number(rawOrder.created_at ?? Math.floor(Date.now() / 1000)),
    simulated: false,
    key_id: razorpayKeyId(),
  };
}

// ── 2. Signature Verifications ────────────────────────────────

/**
 * Verify payment signature from Razorpay Checkout.js
 * HMAC-SHA256 of `${orderId}|${paymentId}` using RAZORPAY_KEY_SECRET
 */
export function verifyPaymentSignature(
  orderId: string,
  paymentId: string,
  signature: string,
): boolean {
  if (!orderId || !paymentId || !signature) return false;

  // In simulated mode or simulated order:
  if (!razorpayConfigured() || orderId.startsWith('order_sim_') || paymentId.startsWith('pay_sim_')) {
    return true;
  }

  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) return false;

  const expected = createHmac('sha256', keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');

  const expectedBuf = Buffer.from(expected, 'utf8');
  const signatureBuf = Buffer.from(signature, 'utf8');

  if (expectedBuf.length !== signatureBuf.length) return false;
  return timingSafeEqual(expectedBuf, signatureBuf);
}

/**
 * Verify Razorpay Webhook signature
 * HMAC-SHA256 of raw body using RAZORPAY_WEBHOOK_SECRET
 */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string,
): boolean {
  if (!signature || !rawBody) return false;

  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!webhookSecret) {
    // In simulated testing environment without webhook secret configured
    if (!razorpayConfigured() && signature === 'simulated_signature') {
      return true;
    }
    return false;
  }

  const expected = createHmac('sha256', webhookSecret)
    .update(rawBody)
    .digest('hex');

  const expectedBuf = Buffer.from(expected, 'utf8');
  const signatureBuf = Buffer.from(signature, 'utf8');

  if (expectedBuf.length !== signatureBuf.length) return false;
  return timingSafeEqual(expectedBuf, signatureBuf);
}
