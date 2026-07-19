'use client';

import { useEffect, useState } from 'react';
import { timeUntil } from '@/lib/format';

export function ExpiryCountdown({ expiry }: { expiry: string }) {
  const target = Number(expiry);
  const [label, setLabel] = useState(() => timeUntil(target));
  useEffect(() => {
    const id = setInterval(() => setLabel(timeUntil(target)), 1000 * 30);
    return () => clearInterval(id);
  }, [target]);
  return <span>{label === 'expired' ? 'Expired' : `Exp: ${label}`}</span>;
}
