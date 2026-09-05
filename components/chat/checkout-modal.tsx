'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Spinner, VendorMark } from '@/components/ui/primitives';
import type { Approval, Purchase } from '@/lib/types';
import { cn, formatMoney } from '@/lib/utils';

export interface CheckoutSession {
  session_id: string;
  session_token?: string;
  iframe_url?: string;
  order_id: string;
  expires_at?: string;
  simulated: boolean;
  amount?: number;
  currency?: string;
  key_id?: string | null;
}

export interface CheckoutReceipt {
  transactionId: string;
  orderId: string | null;
  merchant: string;
  amount: string;
  tokenLast4: string | null;
  expiry: string | null;
}

type Phase = 'card' | 'settling' | 'done' | 'failed';

declare global {
  interface Window {
    Razorpay?: any;
  }
}

export function CheckoutModal({
  approval,
  session,
  publishableKey,
  vendorInitials,
  vendorColor,
  onComplete,
  onClose,
}: {
  approval: Approval;
  session: CheckoutSession;
  publishableKey: string | null;
  vendorInitials: string;
  vendorColor: string;
  onComplete: (purchase: Purchase, receipt: CheckoutReceipt) => void;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>('card');
  const [error, setError] = useState<string | null>(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [rzpDismissed, setRzpDismissed] = useState(false);

  const mounted = useRef(false);
  const settled = useRef(false);
  const rzpInstanceRef = useRef<any>(null);

  const keyId = publishableKey || session.key_id || null;
  const isRealMode = !session.simulated && Boolean(keyId);

  // ── Load Razorpay Checkout.js script in real mode ─────────
  useEffect(() => {
    if (!isRealMode) return;

    if (window.Razorpay) {
      setScriptLoaded(true);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => setScriptLoaded(true);
    script.onerror = () => {
      setError('Failed to load Razorpay Checkout script. Check your network or ad blocker.');
      setPhase('failed');
    };
    document.body.appendChild(script);

    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, [isRealMode]);

  // ── Open Razorpay Checkout widget ─────────────────────────
  const openRazorpayCheckout = useCallback(() => {
    if (!window.Razorpay || !keyId || settled.current) return;

    setError(null);
    setRzpDismissed(false);

    try {
      const subunitAmount = session.amount ?? Math.round(approval.price * 100);

      const options = {
        key: keyId,
        amount: subunitAmount,
        currency: approval.currency ?? 'USD',
        name: approval.vendor,
        description: `${approval.vendor} ${approval.plan} — procured by Warden`,
        order_id: session.order_id,
        handler: async (response: {
          razorpay_payment_id: string;
          razorpay_order_id: string;
          razorpay_signature: string;
        }) => {
          setPhase('settling');
          try {
            const res = await fetch('/api/razorpay/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                orderId: response.razorpay_order_id,
                paymentId: response.razorpay_payment_id,
                signature: response.razorpay_signature,
                approvalId: approval.id,
                approval,
                simulated: false,
              }),
            });

            const data = await res.json();
            if (res.ok && data.status === 'completed' && data.purchase) {
              settled.current = true;
              setPhase('done');
              onComplete(data.purchase, data.receipt);
            } else {
              setPhase('failed');
              setError(data.error || data.message || 'Payment verification failed.');
            }
          } catch {
            setPhase('failed');
            setError('Could not verify payment with Warden server.');
          }
        },
        prefill: {
          name: 'Acme Founder',
          email: process.env.NEXT_PUBLIC_DEMO_USER_EMAIL || 'founder@acme.dev',
        },
        notes: {
          approval_id: approval.id,
        },
        theme: {
          color: vendorColor || '#0F172A',
        },
        modal: {
          ondismiss: () => {
            if (!settled.current && phase !== 'done') {
              setRzpDismissed(true);
            }
          },
        },
      };

      const rzp = new window.Razorpay(options);
      rzpInstanceRef.current = rzp;

      rzp.on('payment.failed', (resp: any) => {
        setPhase('failed');
        setError(resp.error?.description || 'Payment was declined by Razorpay.');
      });

      rzp.open();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not initialize Razorpay checkout.');
      setPhase('failed');
    }
  }, [keyId, session.amount, session.order_id, approval, vendorColor, onComplete, phase]);

  // Auto-launch checkout when script is ready
  useEffect(() => {
    if (isRealMode && scriptLoaded && !mounted.current && phase === 'card') {
      mounted.current = true;
      openRazorpayCheckout();
    }
  }, [isRealMode, scriptLoaded, phase, openRazorpayCheckout]);

  // ── Simulated payment action ──────────────────────────────
  const handleSimulatePayment = useCallback(async () => {
    setPhase('settling');
    setError(null);

    // Realistic settlement delay for smooth UX
    await new Promise((r) => setTimeout(r, 1800));

    try {
      const fakePaymentId = `pay_sim_${Math.random().toString(36).slice(2, 12)}`;
      const res = await fetch('/api/razorpay/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: session.order_id,
          paymentId: fakePaymentId,
          signature: 'simulated_signature',
          approvalId: approval.id,
          approval,
          simulated: true,
        }),
      });

      const data = await res.json();
      if (res.ok && data.status === 'completed' && data.purchase) {
        settled.current = true;
        setPhase('done');
        onComplete(data.purchase, data.receipt);
      } else {
        setPhase('failed');
        setError(data.error || data.message || 'Simulated payment failed.');
      }
    } catch {
      setPhase('failed');
      setError('Could not complete simulated payment.');
    }
  }, [session.order_id, approval, onComplete]);

  // Handle Escape key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && phase !== 'settling') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, phase]);

  const busy = phase === 'settling';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/25 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`Pay ${approval.vendor}`}
    >
      <div className="animate-rise flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-line bg-surface shadow-2xl sm:rounded-2xl">
        <header className="flex items-center gap-3 border-b border-line px-5 py-4">
          <VendorMark initials={vendorInitials} color={vendorColor} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold tracking-tight">
              {approval.vendor} {approval.plan}
            </p>
            <p className="text-[13px] text-ink-3">
              {formatMoney(approval.price, approval.currency)} ·{' '}
              {approval.billing_cycle === 'annual'
                ? 'billed yearly'
                : approval.billing_cycle === 'one_time'
                  ? 'one-time'
                  : 'billed monthly'}
            </p>
          </div>
          <span className="shrink-0 rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-ink-3">
            {session.simulated ? 'Razorpay · simulated' : 'Razorpay · test'}
          </span>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto scroll-thin px-5 py-5">
          {phase === 'done' ? (
            <Success approval={approval} />
          ) : phase === 'failed' ? (
            <Failure message={error} />
          ) : session.simulated ? (
            <SimulatedCard busy={busy} />
          ) : (
            <RealCheckoutPrompt
              busy={busy}
              rzpDismissed={rzpDismissed}
              onReopen={openRazorpayCheckout}
              orderId={session.order_id}
            />
          )}

          {error && phase !== 'failed' && (
            <p className="mt-3 rounded-lg border border-bad/20 bg-bad-soft px-3 py-2 text-[13px] text-bad">
              {error}
            </p>
          )}
        </div>

        <footer className="flex items-center gap-3 border-t border-line px-5 py-4">
          {phase === 'done' ? (
            <Button className="flex-1" onClick={onClose}>
              Done
            </Button>
          ) : phase === 'failed' ? (
            <Button variant="secondary" className="flex-1" onClick={onClose}>
              Close
            </Button>
          ) : session.simulated ? (
            <>
              <Button variant="ghost" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
              <Button className="flex-1" onClick={handleSimulatePayment} disabled={busy}>
                {busy ? (
                  <>
                    <Spinner /> Authorising…
                  </>
                ) : (
                  <>Authorise {formatMoney(approval.price, approval.currency)}</>
                )}
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
              {rzpDismissed ? (
                <Button className="flex-1" onClick={openRazorpayCheckout} disabled={busy}>
                  Re-open Checkout
                </Button>
              ) : (
                <span className="flex flex-1 items-center justify-center gap-2 text-[13px] text-ink-3">
                  <Spinner /> Waiting for payment in Razorpay…
                </span>
              )}
            </>
          )}
        </footer>
      </div>
    </div>
  );
}

// ── Sub-views ────────────────────────────────────────────────

function SimulatedCard({ busy }: { busy: boolean }) {
  return (
    <div className="space-y-4">
      <div className="relative aspect-[1.6] w-full overflow-hidden rounded-2xl border border-accent/30 bg-gradient-to-br from-ink to-accent-ink p-5 text-white shadow-lg">
        <div className="flex h-full flex-col justify-between">
          <div className="flex items-start justify-between">
            <span className="text-[13px] font-medium opacity-80">Razorpay Test Token</span>
            <span className="text-[11px] uppercase tracking-widest opacity-70">Simulated</span>
          </div>
          <div>
            <div className="font-mono text-lg tracking-[0.18em]">
              {busy ? '4111 •••• •••• 1111' : '•••• •••• •••• ••••'}
            </div>
            <div className="mt-2 flex gap-6 font-mono text-[11px] opacity-75">
              <span>EXP {busy ? '12/28' : '••/••'}</span>
              <span>CVV {busy ? '123' : '•••'}</span>
            </div>
          </div>
        </div>
        {busy && <div className="shimmer absolute inset-0" aria-hidden />}
      </div>

      <div className="rounded-xl border border-line bg-surface-2 px-4 py-3">
        <p className="text-[13px] font-medium text-ink">
          Simulated checkout — no real card is charged.
        </p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-ink-3">
          Set <code className="font-mono text-[11.5px]">RAZORPAY_KEY_ID</code> and{' '}
          <code className="font-mono text-[11.5px]">RAZORPAY_KEY_SECRET</code> in{' '}
          <code className="font-mono text-[11.5px]">.env.local</code> to run the real Razorpay
          test-mode checkout widget with Checkout.js.
        </p>
      </div>
    </div>
  );
}

function RealCheckoutPrompt({
  busy,
  rzpDismissed,
  onReopen,
  orderId,
}: {
  busy: boolean;
  rzpDismissed: boolean;
  onReopen: () => void;
  orderId: string;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-accent/30 bg-surface-2 p-5 text-center">
        <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-accent/10 text-accent">
          <svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="5" width="20" height="14" rx="2" />
            <line x1="2" y1="10" x2="22" y2="10" />
          </svg>
        </div>
        <p className="text-[15px] font-semibold text-ink">Razorpay Test Mode</p>
        <p className="mt-1 text-[12.5px] text-ink-3">
          Order ID: <code className="font-mono">{orderId}</code>
        </p>
        {busy ? (
          <div className="mt-4 flex items-center justify-center gap-2 text-[13px] text-accent">
            <Spinner /> Verifying payment signature…
          </div>
        ) : rzpDismissed ? (
          <div className="mt-4">
            <p className="mb-3 text-[13px] text-ink-2">Razorpay checkout window was closed.</p>
            <Button className="h-9 px-4 text-xs" onClick={onReopen}>
              Click to Re-open Checkout
            </Button>
          </div>
        ) : (
          <div className="mt-4 flex items-center justify-center gap-2 text-[13px] text-ink-3">
            <Spinner /> Complete checkout in the Razorpay popup…
          </div>
        )}
      </div>

      <div className="rounded-xl border border-line bg-surface-2 px-4 py-3 text-[12px] text-ink-3">
        <p className="font-medium text-ink">Razorpay Test Card Hints:</p>
        <p className="mt-1">
          Card: <span className="font-mono font-semibold text-ink">4111 1111 1111 1111</span> · Expiry: any future date (e.g.{' '}
          <span className="font-mono text-ink">12/28</span>) · CVV: <span className="font-mono text-ink">123</span> · OTP: any number.
        </p>
      </div>
    </div>
  );
}

function Success({ approval }: { approval: Approval }) {
  return (
    <div className="flex flex-col items-center py-8 text-center">
      <span className="animate-pop mb-4 flex size-14 items-center justify-center rounded-full bg-good-soft text-good">
        <svg viewBox="0 0 24 24" className="size-7" aria-hidden>
          <path
            d="M5 12.5l4.5 4.5L19 7.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <p className="text-lg font-semibold tracking-tight">Purchase complete</p>
      <p className="mt-1.5 max-w-xs text-[13px] leading-relaxed text-ink-3">
        {approval.vendor} {approval.plan} is paid for. The receipt and renewal are in your
        dashboard.
      </p>
    </div>
  );
}

function Failure({ message }: { message: string | null }) {
  return (
    <div className="flex flex-col items-center py-8 text-center">
      <span className={cn('mb-4 flex size-14 items-center justify-center rounded-full bg-bad-soft text-bad')}>
        <svg viewBox="0 0 24 24" className="size-7" aria-hidden>
          <path
            d="M7 7l10 10M17 7L7 17"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </svg>
      </span>
      <p className="text-lg font-semibold tracking-tight">Payment didn&rsquo;t go through</p>
      <p className="mt-1.5 max-w-xs text-[13px] leading-relaxed text-ink-3">
        {message ?? 'Razorpay declined the transaction. Nothing was charged.'}
      </p>
    </div>
  );
}
