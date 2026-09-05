'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Spinner } from '@/components/ui/primitives';

export function SimulateFailureButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const triggerFailure = async () => {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch('/api/razorpay/simulate-failure', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Simulation failed');
      setResult(`Simulated webhook failure fired for ${data.vendor} (${data.paymentId})`);
      startTransition(() => router.refresh());
    } catch (err) {
      setResult(err instanceof Error ? err.message : 'Error triggering failure');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        variant="secondary"
        onClick={triggerFailure}
        disabled={busy || pending}
        className="border-warn/40 text-warn hover:bg-warn-soft/60"
      >
        {busy || pending ? (
          <>
            <Spinner /> Firing Webhook…
          </>
        ) : (
          'Simulate payment.failed Webhook'
        )}
      </Button>
      {result && (
        <span className="text-[12px] font-mono text-ink-3">
          {result}
        </span>
      )}
    </div>
  );
}
