'use client';

import Link from 'next/link';
import { CheckCircle2, X } from 'lucide-react';
import { useToasts } from '@/stores/toast';

const TONE: Record<string, string> = {
  yes: 'text-yes',
  no: 'text-no',
  info: 'text-primary',
};

/** Bottom-right toast stack. Rendered once, globally. */
export function ToastContainer() {
  const { toasts, dismiss } = useToasts();
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
      {toasts.map((t) => (
        <div key={t.id} className="card flex items-start gap-3 p-3 shadow-lg">
          <CheckCircle2 className={`mt-0.5 h-5 w-5 shrink-0 ${TONE[t.tone ?? 'info']}`} />
          <div className="min-w-0 flex-1 text-sm">
            <p className="break-words">{t.message}</p>
            {t.href && (
              <Link
                href={t.href}
                onClick={() => dismiss(t.id)}
                className="mt-1 inline-block text-xs font-medium text-primary"
              >
                View market →
              </Link>
            )}
          </div>
          <button
            onClick={() => dismiss(t.id)}
            className="shrink-0 text-muted hover:text-white"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
