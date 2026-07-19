'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Briefly flashes its background green (value went up) or red (down) whenever
 * `value` changes — used on live-updating numbers. `value` is the comparable
 * (raw number/bigint/string); `children` is the formatted display.
 */
export function FlashValue({
  value,
  className = '',
  children,
}: {
  value: string | number | bigint;
  className?: string;
  children: ReactNode;
}) {
  const key = String(value);
  const prev = useRef(key);
  const [flash, setFlash] = useState<'up' | 'down' | ''>('');

  useEffect(() => {
    if (prev.current === key) return;
    const a = Number(prev.current);
    const b = Number(key);
    const dir: 'up' | 'down' | '' =
      Number.isFinite(a) && Number.isFinite(b) ? (b > a ? 'up' : b < a ? 'down' : '') : 'up';
    prev.current = key;
    if (!dir) return;
    setFlash(dir);
    const t = setTimeout(() => setFlash(''), 900);
    return () => clearTimeout(t);
  }, [key]);

  return (
    <span className={`-mx-1 rounded px-1 ${flash ? `flash-${flash}` : ''} ${className}`}>
      {children}
    </span>
  );
}
