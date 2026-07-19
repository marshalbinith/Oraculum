'use client';

import Link from 'next/link';
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  CircleDollarSign,
  Droplets,
  Gauge,
  Github,
  Layers,
  LineChart,
  Lock,
  PlusCircle,
  Scale,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useStats } from '@/hooks/useData';
import { formatUsdc } from '@/lib/format';

export default function LandingPage() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <BackgroundGlow />
      <LandingNav />
      <Hero />
      <StatsBand />
      <HowItWorks />
      <Features />
      <TechStrip />
      <FinalCta />
      <Footer />
    </div>
  );
}

/* ─────────────────────────── Background ─────────────────────────── */

function BackgroundGlow() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
      <div className="absolute -top-40 left-1/2 h-[38rem] w-[38rem] -translate-x-1/2 rounded-full bg-primary/20 blur-[120px]" />
      <div className="absolute right-[-10rem] top-40 h-[26rem] w-[26rem] rounded-full bg-yes/10 blur-[120px]" />
      <div
        className="absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(36,48,73,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(36,48,73,0.6) 1px, transparent 1px)',
          backgroundSize: '56px 56px',
          maskImage: 'radial-gradient(ellipse 70% 55% at 50% 0%, #000 40%, transparent 100%)',
          WebkitMaskImage:
            'radial-gradient(ellipse 70% 55% at 50% 0%, #000 40%, transparent 100%)',
        }}
      />
    </div>
  );
}

/* ─────────────────────────── Nav ─────────────────────────── */

function LandingNav() {
  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-bg/70 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:px-6">
        <Link href="/" className="flex items-center gap-2 text-lg font-semibold">
          <Activity className="h-5 w-5 text-primary" />
          StellarPredict
          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-400">
            Testnet
          </span>
        </Link>
        <nav className="hidden items-center gap-7 text-sm text-muted md:flex">
          <a href="#how" className="transition-colors hover:text-white">
            How it works
          </a>
          <a href="#features" className="transition-colors hover:text-white">
            Features
          </a>
          <Link href="/markets" className="transition-colors hover:text-white">
            Markets
          </Link>
        </nav>
        <Link href="/dashboard" className="btn-primary">
          Launch app
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </header>
  );
}

/* ─────────────────────────── Hero ─────────────────────────── */

function Hero() {
  return (
    <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-16 md:px-6 md:pb-24 md:pt-24 lg:grid-cols-2">
      <div>
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/60 px-3 py-1 text-xs text-muted">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          AMM prediction markets on Stellar Soroban
        </div>
        <h1 className="mt-6 text-4xl font-bold leading-[1.08] tracking-tight md:text-6xl">
          Trade the odds of{' '}
          <span className="bg-gradient-to-r from-primary via-indigo-400 to-yes bg-clip-text text-transparent">
            anything
          </span>
          .<br />
          Settled fully on-chain.
        </h1>
        <p className="mt-6 max-w-xl text-base leading-relaxed text-muted md:text-lg">
          Permissionless binary (YES / NO) markets priced by a constant-product AMM,
          resolved by on-chain oracles, and settled in real Circle USDC. No order books,
          no custodians — just liquidity and math.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link href="/markets" className="btn-primary px-5 py-2.5 text-base">
            Explore markets
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link href="/markets/create" className="btn-ghost px-5 py-2.5 text-base">
            <PlusCircle className="h-4 w-4" />
            Create a market
          </Link>
        </div>
        <p className="mt-5 flex items-center gap-2 text-xs text-muted">
          <ShieldCheck className="h-4 w-4 text-yes" />
          Testnet only · settles in real Circle testnet USDC · non-custodial
        </p>
      </div>

      <HeroMarketCard />
    </section>
  );
}

/** A convincing static mock of a live market card — the product's core object. */
function HeroMarketCard() {
  const yes = 63;
  const no = 100 - yes;
  return (
    <div className="relative mx-auto w-full max-w-md">
      <div className="absolute -inset-4 -z-10 rounded-[1.6rem] bg-gradient-to-tr from-primary/20 to-yes/10 blur-2xl" />
      <div className="card p-6 shadow-2xl shadow-black/40">
        <div className="flex items-center justify-between">
          <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-medium text-primary">
            Crypto
          </span>
          <span className="flex items-center gap-1.5 text-xs text-muted">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-yes" />
            Live · closes Dec 31
          </span>
        </div>

        <h3 className="mt-4 text-lg font-semibold leading-snug">
          Will BTC close above $100,000 by year end?
        </h3>

        <Sparkline />

        <div className="mt-5 space-y-3">
          <OutcomeRow label="YES" pct={yes} color="yes" />
          <OutcomeRow label="NO" pct={no} color="no" />
        </div>

        <div className="mt-5 grid grid-cols-3 gap-3 border-t border-border pt-4 text-center">
          <MiniStat label="Volume" value="$412k" />
          <MiniStat label="Liquidity" value="$88k" />
          <MiniStat label="Traders" value="1,204" />
        </div>
      </div>
    </div>
  );
}

function Sparkline() {
  // A gentle upward YES-probability curve.
  const pts = [22, 20, 26, 24, 31, 35, 33, 42, 48, 46, 55, 58, 61, 63];
  const w = 320;
  const h = 64;
  const max = 70;
  const step = w / (pts.length - 1);
  const coords = pts.map((p, i) => [i * step, h - (p / max) * h] as const);
  const line = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${w},${h} L0,${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-4 h-16 w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="spark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#22c55e" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#spark)" />
      <path d={line} fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function OutcomeRow({ label, pct, color }: { label: string; pct: number; color: 'yes' | 'no' }) {
  const bar = color === 'yes' ? 'bg-yes' : 'bg-no';
  const text = color === 'yes' ? 'text-yes' : 'text-no';
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className={`font-semibold tabular-nums ${text}`}>{pct}¢</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-2">
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-sm font-semibold tabular-nums">{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-muted">{label}</div>
    </div>
  );
}

/* ─────────────────────────── Live stats ─────────────────────────── */

function StatsBand() {
  const stats = useStats();
  const items = [
    { label: 'Markets', value: fmtInt(stats.data?.total_markets) },
    { label: 'Open now', value: fmtInt(stats.data?.open_markets) },
    { label: 'Total volume', value: `$${formatUsdc(stats.data?.total_volume ?? '0', 0)}` },
    { label: 'Traders', value: fmtInt(stats.data?.total_traders) },
  ];
  return (
    <section className="mx-auto max-w-6xl px-4 md:px-6">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-4">
        {items.map((s) => (
          <div key={s.label} className="bg-surface/70 px-6 py-7 text-center backdrop-blur">
            <div className="text-2xl font-bold tabular-nums md:text-3xl">{s.value}</div>
            <div className="mt-1 text-xs uppercase tracking-wide text-muted">{s.label}</div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-center text-xs text-muted">Live protocol stats · Stellar testnet</p>
    </section>
  );
}

/* ─────────────────────────── How it works ─────────────────────────── */

function HowItWorks() {
  const steps: { icon: LucideIcon; title: string; body: string }[] = [
    {
      icon: PlusCircle,
      title: '1 · Create',
      body: 'Spin up a binary market on any oracle-backed question. Seed it with USDC liquidity and set the resolution feed — permissionless, no gatekeeper.',
    },
    {
      icon: TrendingUp,
      title: '2 · Trade',
      body: 'Buy YES or NO shares against a constant-product AMM. Prices move with demand and read directly as implied probability. Provide liquidity to earn fees.',
    },
    {
      icon: BadgeCheck,
      title: '3 · Resolve',
      body: 'At expiry the on-chain oracle attests the outcome. Winning shares redeem 1:1 for USDC and LPs withdraw their position plus accrued yield.',
    },
  ];
  return (
    <section id="how" className="mx-auto max-w-6xl px-4 py-24 md:px-6">
      <SectionHeading
        eyebrow="How it works"
        title="From question to settlement in three steps"
        sub="Every step is a smart-contract call. Nothing is held off-chain."
      />
      <div className="mt-12 grid gap-5 md:grid-cols-3">
        {steps.map((s) => (
          <div key={s.title} className="card p-7">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <s.icon className="h-5 w-5" />
            </div>
            <h3 className="mt-5 text-lg font-semibold">{s.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{s.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ─────────────────────────── Features ─────────────────────────── */

function Features() {
  const features: { icon: LucideIcon; title: string; body: string }[] = [
    {
      icon: Gauge,
      title: 'CPMM pricing',
      body: 'A constant-product market maker prices YES/NO shares continuously — deep, always-on liquidity with no order book to match.',
    },
    {
      icon: Layers,
      title: 'Permissionless markets',
      body: 'Anyone can deploy a market from the factory. YES, NO and LP tokens are minted as standard SEP-41 assets.',
    },
    {
      icon: ShieldCheck,
      title: 'Oracle resolution',
      body: 'Outcomes settle from a signed on-chain price registry with attestations, not a multisig committee’s discretion.',
    },
    {
      icon: Droplets,
      title: 'LP fee yield',
      body: 'Liquidity providers earn a share of every trade’s fee, accrued on-chain and claimable alongside their principal.',
    },
    {
      icon: CircleDollarSign,
      title: 'Real Circle USDC',
      body: 'Markets settle in genuine Circle testnet USDC as a Stellar Asset Contract — no mock token, no IOU.',
    },
    {
      icon: Lock,
      title: 'Non-custodial & on-chain',
      body: 'Checked-arithmetic contracts, integer stroop precision, no f64. Your funds never leave your wallet’s control.',
    },
  ];
  return (
    <section id="features" className="mx-auto max-w-6xl px-4 py-24 md:px-6">
      <SectionHeading
        eyebrow="Why StellarPredict"
        title="A prediction market that lives entirely on-chain"
        sub="Built as a Soroban contract suite — oracle registry, outcome tokens, AMM core and factory."
      />
      <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((f) => (
          <div
            key={f.title}
            className="card group p-6 transition-colors hover:border-primary/50"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-2 text-primary transition-colors group-hover:bg-primary/15">
              <f.icon className="h-5 w-5" />
            </div>
            <h3 className="mt-4 font-semibold">{f.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{f.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ─────────────────────────── Tech strip ─────────────────────────── */

function TechStrip() {
  const points: { icon: LucideIcon; label: string; value: string }[] = [
    { icon: Scale, label: 'Precision', value: '10⁷ stroop-scaled integers' },
    { icon: Gauge, label: 'Fees & odds', value: 'Basis points (10000 = 100%)' },
    { icon: LineChart, label: 'Pricing', value: 'Constant-product AMM' },
    { icon: Wallet, label: 'Wallet', value: 'Freighter · non-custodial' },
  ];
  return (
    <section className="mx-auto max-w-6xl px-4 pb-8 md:px-6">
      <div className="card grid gap-6 p-8 sm:grid-cols-2 lg:grid-cols-4">
        {points.map((p) => (
          <div key={p.label} className="flex items-start gap-3">
            <p.icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <div className="text-xs uppercase tracking-wide text-muted">{p.label}</div>
              <div className="mt-0.5 text-sm font-medium">{p.value}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ─────────────────────────── Final CTA ─────────────────────────── */

function FinalCta() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-24 md:px-6">
      <div className="relative overflow-hidden rounded-3xl border border-border bg-surface px-8 py-16 text-center">
        <div className="absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-primary/25 blur-[100px]" />
        <h2 className="relative text-3xl font-bold md:text-4xl">Ready to price the future?</h2>
        <p className="relative mx-auto mt-4 max-w-xl text-muted">
          Fund a testnet wallet from the Circle faucet, add a USDC trustline, and start
          trading — or launch your own market in a couple of clicks.
        </p>
        <div className="relative mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="/dashboard" className="btn-primary px-6 py-2.5 text-base">
            Launch app
            <ArrowRight className="h-4 w-4" />
          </Link>
          <a
            href="https://faucet.circle.com"
            target="_blank"
            rel="noreferrer"
            className="btn-ghost px-6 py-2.5 text-base"
          >
            Get testnet USDC
            <ArrowUpRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── Footer ─────────────────────────── */

function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-muted md:flex-row md:px-6">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <span className="font-medium text-white">StellarPredict</span>
          <span className="text-muted">· prediction markets on Soroban</span>
        </div>
        <div className="flex items-center gap-6">
          <Link href="/markets" className="transition-colors hover:text-white">
            Markets
          </Link>
          <Link href="/leaderboard" className="transition-colors hover:text-white">
            Leaderboard
          </Link>
          <a
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 transition-colors hover:text-white"
          >
            <Github className="h-4 w-4" />
            GitHub
          </a>
        </div>
      </div>
      <p className="pb-8 text-center text-[11px] text-muted">
        Testnet only · settles in real Circle USDC · not financial advice.
      </p>
    </footer>
  );
}

/* ─────────────────────────── Shared bits ─────────────────────────── */

function SectionHeading({
  eyebrow,
  title,
  sub,
}: {
  eyebrow: string;
  title: string;
  sub: string;
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <div className="text-xs font-semibold uppercase tracking-widest text-primary">{eyebrow}</div>
      <h2 className="mt-3 text-3xl font-bold tracking-tight md:text-4xl">{title}</h2>
      <p className="mt-4 text-muted">{sub}</p>
    </div>
  );
}

function fmtInt(n: number | undefined): string {
  return typeof n === 'number' ? n.toLocaleString('en-US') : '—';
}
