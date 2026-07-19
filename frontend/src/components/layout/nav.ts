import {
  Droplets,
  LayoutDashboard,
  LineChart,
  PlusCircle,
  Trophy,
  User,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

export interface NavLink {
  href: string;
  label: string;
  icon: LucideIcon;
}

/** Primary navigation, matching the product wireframe (Markets / Create / LP / Profile). */
export const NAV_LINKS: NavLink[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/markets', label: 'Markets', icon: LineChart },
  { href: '/markets/create', label: 'Create', icon: PlusCircle },
  { href: '/lp', label: 'LP', icon: Droplets },
  { href: '/portfolio', label: 'Profile', icon: User },
  { href: '/wallet', label: 'Wallet', icon: Wallet },
  { href: '/leaderboard', label: 'Leaderboard', icon: Trophy },
];

/** The single active link = the longest href the current path falls under, so
 *  `/markets/create` highlights "Create" (not "Markets") and `/markets/<id>`
 *  highlights "Markets". */
export function activeHref(pathname: string): string {
  return NAV_LINKS.reduce((best, l) => {
    const match = pathname === l.href || pathname.startsWith(`${l.href}/`);
    return match && l.href.length > best.length ? l.href : best;
  }, '');
}
