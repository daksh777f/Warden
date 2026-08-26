import Link from 'next/link';
import { Badge } from '@/components/ui/primitives';

const STEPS = [
  { n: '01', title: 'Researches', body: 'Shortlists real vendors in the category you named.' },
  { n: '02', title: 'Compares', body: 'Normalises every plan to one monthly number.' },
  { n: '03', title: 'Verifies', body: 'Scores each merchant before it will spend with them.' },
  { n: '04', title: 'Asks', body: 'Raises an approval card. It cannot buy without you.' },
  { n: '05', title: 'Pays', body: 'Executes through Prava with a single-use card credential.' },
  { n: '06', title: 'Tracks', body: 'Files the invoice and schedules the renewal.' },
];

const PROMPTS = [
  'Buy an email provider for our startup under $40/month.',
  "We're hiring a developer — get them the best AI code assistant under $25/month.",
  'We need error monitoring. Budget is $30/month.',
];

export default function LandingPage() {
  return (
    <main className="relative overflow-hidden">
      {/* Soft accent wash behind the hero. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(ellipse_at_top,var(--color-accent-soft),transparent_65%)]"
      />

      <div className="relative mx-auto max-w-5xl px-6">
        <header className="flex items-center justify-between py-6">
          <div className="flex items-center gap-2.5">
            <Logo />
            <span className="text-[15px] font-semibold tracking-tight">Warden</span>
          </div>
          <Link
            href="/dashboard"
            className="text-sm font-medium text-ink-2 transition-colors hover:text-ink"
          >
            Dashboard →
          </Link>
        </header>

        <section className="animate-rise py-20 text-center sm:py-28">
          <Badge tone="accent" className="mb-6">
            <span className="size-1.5 rounded-full bg-accent" />
            Bounded Autonomous Procurement
          </Badge>

          <h1 className="mx-auto max-w-3xl text-balance text-5xl font-semibold leading-[1.05] tracking-[-0.03em] sm:text-6xl">
            Warden — bounded, gated, autonomous commerce.
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-pretty text-lg leading-relaxed text-ink-2">
            Tell Warden what your team needs and what you&rsquo;ll spend. It researches the
            market, defends a recommendation, and — once you approve — actually buys it.
          </p>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/chat"
              className="display-type inline-flex items-center gap-2 rounded-md border border-accent-ink/20 bg-accent px-6 py-3 text-xs tracking-wide text-ink shadow-[2px_2px_0_var(--color-ink)] transition-[filter,transform] duration-150 hover:brightness-105 active:translate-x-px active:translate-y-px"
            >
              Start Procuring
