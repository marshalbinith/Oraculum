import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'StellarPredict — Decentralized Prediction Markets',
  description: 'AMM-based binary prediction markets on Stellar Soroban.',
};

/** Root layout: html/body + global providers only. The app shell (Topbar +
 *  Sidebar) lives in the (app) route group so the `/` landing renders full-bleed. */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
