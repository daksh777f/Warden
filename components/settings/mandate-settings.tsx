'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, Card, SectionHeading, Spinner } from '@/components/ui/primitives';
import type { Mandate } from '@/lib/policy/mandate';
import { DEFAULT_MANDATE } from '@/lib/policy/mandate';
import { formatMoney } from '@/lib/utils';

export function MandateSettings({
  initialMandate,
  todaySpend,
}: {
  initialMandate: Mandate;
  todaySpend: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [mandate, setMandate] = useState<Mandate>(initialMandate);
  const [categoriesStr, setCategoriesStr] = useState<string>(
    initialMandate.allowedCategories ? initialMandate.allowedCategories.join(', ') : '',
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);

    const allowedCats = categoriesStr.trim()
      ? categoriesStr
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : null;

    const payload: Partial<Mandate> = {
      maxPerPurchase: Number(mandate.maxPerPurchase) || 0,
      dailyCap: Number(mandate.dailyCap) || 0,
      requireHumanAbove: Number(mandate.requireHumanAbove) || 0,
      requireReapprovalOnPriceChangePct: Number(mandate.requireReapprovalOnPriceChangePct) || 0,
      active: mandate.active,
      allowedCategories: allowedCats,
    };

    try {
      const res = await fetch('/api/mandate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to update mandate.');
      const data = await res.json();
      setMandate(data.mandate);
      setSaved(true);
      startTransition(() => router.refresh());
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefaults = () => {
    setMandate(DEFAULT_MANDATE);
    setCategoriesStr('');
  };

  const pctToday = Math.min(100, Math.round((todaySpend / (mandate.dailyCap || 1)) * 100));

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <h2 className="text-[17px] font-semibold tracking-tight">Spending Mandate</h2>
          <p className="mt-0.5 text-[13px] text-ink-3">
            Autonomous procurement bounds. A deterministic policy engine enforces these limits.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={mandate.active ? 'good' : 'warn'}>
            {mandate.active ? '⚡ Mandate Active' : '⏸ Mandate Paused'}
          </Badge>
          <button
            type="button"
            onClick={() => setMandate((m) => ({ ...m, active: !m.active }))}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              mandate.active ? 'bg-good' : 'bg-line-strong'
            }`}
            role="switch"
            aria-checked={mandate.active}
            aria-label="Toggle spending mandate"
          >
            <span
              className={`pointer-events-none inline-block size-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                mandate.active ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Safety switch alert when paused */}
      {!mandate.active && (
        <div className="border-b border-warn/30 bg-warn-soft px-5 py-3 text-[13px] text-warn">
          <strong>Safety Switch Engaged:</strong> Mandate is paused. All purchases will
          escalate to human approval regardless of price or category.
        </div>
      )}

      {/* Daily spend meter */}
      <div className="border-b border-line bg-surface-2/40 px-5 py-3.5">
        <div className="flex items-center justify-between text-[13px]">
          <span className="font-medium text-ink-2">Today&apos;s Authorized Spend</span>
          <span className="font-mono text-ink">
            {formatMoney(todaySpend)} / {formatMoney(mandate.dailyCap)} ({pctToday}%)
          </span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-line">
          <div
            className={`h-full transition-all duration-300 ${
              pctToday > 90 ? 'bg-bad' : pctToday > 70 ? 'bg-warn' : 'bg-good'
            }`}
            style={{ width: `${pctToday}%` }}
          />
        </div>
      </div>

      <div className="grid gap-4 p-5 sm:grid-cols-2">
        <div>
          <label className="block text-[12.5px] font-medium text-ink-2">
            Auto-Approval Threshold ($)
          </label>
          <p className="mt-0.5 text-[11.5px] text-ink-3">
            Purchases at or below this amount execute autonomously without human confirmation.
          </p>
          <input
            type="number"
            min={0}
            step={1}
            value={mandate.requireHumanAbove}
            onChange={(e) =>
              setMandate((m) => ({ ...m, requireHumanAbove: Number(e.target.value) }))
            }
            className="mt-2 w-full rounded-md border border-line bg-surface px-3 py-2 text-[14px] text-ink focus:border-ink focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-[12.5px] font-medium text-ink-2">
            Max Single Purchase ($)
          </label>
          <p className="mt-0.5 text-[11.5px] text-ink-3">
            Absolute ceiling for any single purchase. Anything higher is denied outright.
          </p>
          <input
            type="number"
            min={0}
            step={1}
            value={mandate.maxPerPurchase}
            onChange={(e) =>
              setMandate((m) => ({ ...m, maxPerPurchase: Number(e.target.value) }))
            }
            className="mt-2 w-full rounded-md border border-line bg-surface px-3 py-2 text-[14px] text-ink focus:border-ink focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-[12.5px] font-medium text-ink-2">Daily Cap ($)</label>
          <p className="mt-0.5 text-[11.5px] text-ink-3">
            Maximum total cumulative authorized spend allowed per calendar day.
          </p>
          <input
            type="number"
            min={0}
            step={1}
            value={mandate.dailyCap}
            onChange={(e) => setMandate((m) => ({ ...m, dailyCap: Number(e.target.value) }))}
            className="mt-2 w-full rounded-md border border-line bg-surface px-3 py-2 text-[14px] text-ink focus:border-ink focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-[12.5px] font-medium text-ink-2">
            Price Drift Re-Approval (%)
          </label>
          <p className="mt-0.5 text-[11.5px] text-ink-3">
            Forces human confirmation if live catalog price shifts by more than this percentage.
          </p>
          <input
            type="number"
            min={0}
            max={100}
            step={1}
            value={mandate.requireReapprovalOnPriceChangePct}
            onChange={(e) =>
              setMandate((m) => ({
                ...m,
                requireReapprovalOnPriceChangePct: Number(e.target.value),
              }))
            }
            className="mt-2 w-full rounded-md border border-line bg-surface px-3 py-2 text-[14px] text-ink focus:border-ink focus:outline-none"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="block text-[12.5px] font-medium text-ink-2">
            Allowed Categories
          </label>
          <p className="mt-0.5 text-[11.5px] text-ink-3">
            Comma-separated list (e.g. &ldquo;Software, Hosting, Analytics&rdquo;). Leave empty to allow all
            categories.
          </p>
          <input
            type="text"
            placeholder="All categories allowed"
            value={categoriesStr}
            onChange={(e) => setCategoriesStr(e.target.value)}
            className="mt-2 w-full rounded-md border border-line bg-surface px-3 py-2 text-[14px] text-ink focus:border-ink focus:outline-none"
          />
        </div>
      </div>

      {error && (
        <div className="border-t border-bad/20 bg-bad-soft px-5 py-2.5 text-[13px] text-bad">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface-2/30 px-5 py-3.5">
        <Button variant="ghost" onClick={handleResetDefaults} disabled={saving}>
          Reset to Defaults
        </Button>
        <div className="flex items-center gap-3">
          {saved && <span className="text-[13px] font-medium text-good">✓ Mandate saved</span>}
          <Button onClick={handleSave} disabled={saving || pending}>
            {saving ? (
              <>
                <Spinner /> Saving…
              </>
            ) : (
              'Save Mandate'
            )}
          </Button>
        </div>
      </div>
    </Card>
  );
}
