/** Minimal Tailwind UI primitives (hand-rolled in lieu of shadcn CLI). */
import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`card p-5 ${className}`}>{children}</div>;
}

export function Button({
  children,
  variant = 'primary',
  loading = false,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost';
  loading?: boolean;
}) {
  return (
    <button
      className={`${variant === 'primary' ? 'btn-primary' : 'btn-ghost'} ${className}`}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className="input" {...props} />;
}

export function Badge({ children, color = 'gray' }: { children: ReactNode; color?: string }) {
  const map: Record<string, string> = {
    green: 'bg-yes/15 text-yes',
    red: 'bg-no/15 text-no',
    blue: 'bg-primary/15 text-primary',
    gray: 'bg-surface-2 text-muted',
    amber: 'bg-amber-500/15 text-amber-400',
  };
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${map[color] ?? map.gray}`}>
      {children}
    </span>
  );
}

export function Spinner() {
  return (
    <div className="flex justify-center py-16 text-muted">
      <Loader2 className="h-6 w-6 animate-spin" />
    </div>
  );
}

export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="card px-5 py-4">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}

export function LinkButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="btn-primary">
      {children}
    </Link>
  );
}
