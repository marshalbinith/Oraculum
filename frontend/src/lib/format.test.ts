import { describe, expect, it } from 'vitest';
import {
  formatUsdc,
  priceToCents,
  priceToPercent,
  truncateAddress,
  usdcToStroops,
} from './format';

describe('format helpers', () => {
  it('formatUsdc scales 10^7 stroops to a human string', () => {
    expect(formatUsdc('12500000000')).toBe('1,250.00');
    expect(formatUsdc(0n)).toBe('0.00');
    expect(formatUsdc(null)).toBe('0.00');
  });

  it('usdcToStroops round-trips a human amount', () => {
    expect(usdcToStroops('1250')).toBe(12_500_000_000n);
    expect(usdcToStroops('0.5')).toBe(5_000_000n);
  });

  it('priceToPercent / priceToCents convert a 10^7 share price', () => {
    expect(priceToPercent('7000000')).toBe(70);
    expect(priceToCents('6500000')).toBe(65);
  });

  it('truncateAddress shortens a G-address', () => {
    const g = 'GCOJ7BMTKNNLMJGHX6C6IE5HL3BS6KIGJ74KGNMM7XSQFFUKGJCMZQQZ';
    expect(truncateAddress(g)).toBe('GCOJ7…ZQQZ');
    expect(truncateAddress('')).toBe('');
  });
});
