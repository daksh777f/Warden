import { MandateSettings } from '@/components/settings/mandate-settings';
import { ResetButton } from '@/components/settings/reset-button';
import { SimulateFailureButton } from '@/components/settings/simulate-failure-button';
import { Badge, Card, SectionHeading } from '@/components/ui/primitives';
import { agentMode } from '@/lib/agent/run';
import { openaiModel } from '@/lib/agent/openai';
import { linqConfigured, linqWebhookConfigured } from '@/lib/linq/client';
import { razorpayKeyId, razorpayMode } from '@/lib/razorpay/client';
import { sensoConfigured } from '@/lib/senso/client';
import { getMandate, getTodayAuthorizedSpend, storeBackend } from '@/lib/store';

export const metadata = { title: 'Settings · Warden' };
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const mandate = await getMandate();
  const todaySpend = await getTodayAuthorizedSpend();
  const rzpMode = razorpayMode();
  const agent = agentMode();

  const integrations = [
    {
      name: 'Razorpay',
      role: 'Payments',
      live: rzpMode !== 'simulated',
      value:
        rzpMode === 'simulated'
          ? 'Simulated — test mode'
          : `${rzpMode} · key: ${razorpayKeyId()?.slice(0, 12) ?? ''}…`,
      hint:
        rzpMode === 'simulated'
          ? 'Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env.local to run real test-mode transactions.'
          : 'Razorpay Orders API + Checkout.js with server-side webhook signature verification.',
    },
    {
      name: 'OpenAI',
      role: 'Agent reasoning',
      live: agent === 'llm',
      value: agent === 'llm' ? `Responses API · ${openaiModel()}` : 'Scripted fallback agent',
      hint:
        agent === 'llm'
          ? 'The model researches and reasons. It still has no payment tool — approvals are the only path to a charge.'
          : 'Set OPENAI_API_KEY to swap the deterministic agent for the model. Both drive the same tools.',
    },
    {
      name: 'Senso',
      role: 'Merchant trust',
      live: sensoConfigured(),
      value: sensoConfigured() ? 'Live · blended with local signals' : 'Local trust model',
      hint: sensoConfigured()
        ? 'Senso scores are averaged with the local model so one flaky call cannot swing a recommendation.'
        : 'Set SENSO_API_KEY to fold live merchant verification into every trust check.',
    },
    {
      name: 'Linq',
      role: 'iMessage/SMS approvals',
      live: linqConfigured(),
      value: linqConfigured()
        ? `Sends texts · replies ${linqWebhookConfigured() ? 'verified' : 'unverified (no LINQ_WEBHOOK_SECRET)'}`
        : 'Off — approval card only',
      hint: linqConfigured()
        ? '"NO" cancels the request. "YES" gets a link back to the app.'
        : 'Set LINQ_API_KEY, LINQ_FROM_NUMBER and LINQ_TO_NUMBER to text the founder every time an approval is requested.',
    },
    {
      name: 'Supabase',
      role: 'Persistence',
      live: storeBackend() === 'supabase',
      value: storeBackend() === 'supabase' ? 'Postgres' : 'Local JSON file (.data/)',
      hint:
        storeBackend() === 'supabase'
          ? 'Purchases, subscriptions, approvals, transactions, policy decisions and invoices persist in Postgres.'
          : 'Run supabase/schema.sql and set NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to persist in Postgres.',
    },
  ];

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-8">
      <header className="mb-7">
        <h1 className="text-[26px] font-semibold tracking-[-0.02em]">Settings</h1>
        <p className="mt-1 text-[15px] text-ink-3">
          Configure spending mandate policies and review connected integrations.
        </p>
      </header>

      {/* Spending Mandate Control Section */}
      <div className="mb-6">
        <MandateSettings initialMandate={mandate} todaySpend={todaySpend} />
      </div>

      <Card className="overflow-hidden">
        <SectionHeading title="Integrations" />
        <ul className="divide-y divide-line border-t border-line">
          {integrations.map((integration) => (
            <li key={integration.name} className="px-5 py-4">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-[15px] font-medium">{integration.name}</span>
                <span className="text-[13px] text-ink-3">{integration.role}</span>
                <Badge tone={integration.live ? 'good' : 'warn'} className="ml-auto">
                  {integration.value}
                </Badge>
              </div>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-3">{integration.hint}</p>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="mt-5 overflow-hidden">
        <SectionHeading title="Company" />
        <dl className="divide-y divide-line border-t border-line text-[14px]">
          <Row label="Company" value={process.env.DEMO_COMPANY_NAME || 'Acme Inc.'} />
          <Row label="Approver" value={process.env.DEMO_USER_EMAIL || 'founder@acme.dev'} />
          <Row
            label="Purchase policy"
            value={
              mandate.active
                ? `Autonomous spending mandate active up to $${mandate.requireHumanAbove} (max $${mandate.maxPerPurchase}, daily cap $${mandate.dailyCap})`
                : 'Spending mandate paused — all purchases require explicit human approval'
            }
          />
        </dl>
      </Card>

      <Card className="mt-5 overflow-hidden">
        <SectionHeading title="Demo controls" />
        <div className="divide-y divide-line border-t border-line">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <div>
              <p className="font-medium text-[14px] text-ink">Simulate Payment Failure</p>
              <p className="max-w-sm text-[13px] leading-relaxed text-ink-3">
                Dispatches a signed Razorpay <code>payment.failed</code> webhook for the latest approval,
                triggering graceful failure recovery without creating duplicate purchases.
              </p>
            </div>
            <SimulateFailureButton />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <div>
              <p className="font-medium text-[14px] text-ink">Reset Demo Data</p>
              <p className="max-w-sm text-[13px] leading-relaxed text-ink-3">
                Clears purchases, renewals, approvals, and decisions, restoring default seed state.
              </p>
            </div>
            <ResetButton />
          </div>
        </div>
      </Card>

      <Card className="mt-5 overflow-hidden">
        <SectionHeading title="About Warden" />
        <dl className="divide-y divide-line border-t border-line text-[13.5px]">
          <Row label="App Name" value="Warden" />
          <Row label="Tagline" value="Warden — bounded, gated, autonomous commerce." />
          <Row label="Developer" value="Daksh Goel" />
          <Row
            label="Description"
            value="Autonomous commerce and software procurement engine governed by deterministic spending policies, Razorpay settlement, and cryptographic audit trails."
          />
        </dl>
      </Card>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap gap-2 px-5 py-3.5">
      <dt className="w-36 shrink-0 text-ink-3">{label}</dt>
      <dd className="min-w-0 flex-1 text-ink-2">{value}</dd>
    </div>
  );
}
