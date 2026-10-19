import { Cpu, Megaphone, Paintbrush, ShieldCheck, Store, type LucideIcon } from 'lucide-react';

/** The five feature pages, in reading order (used by the header, footer and page-to-page navigation). */
export const EXPLORE: Array<{ to: string; label: string; title: string; blurb: string; icon: LucideIcon; features: string[] }> = [
  { to: '/studio', label: 'Studio', title: 'Design Studio Lab', blurb: 'Make codes that look like your brand and still scan.', icon: Paintbrush, features: ['Palette from your photo', 'Picture QR codes', 'Print size calculator', 'Damage simulator', 'Animated SVG codes'] },
  { to: '/growth', label: 'Growth', title: 'Smart Links & Growth', blurb: 'Test, target and measure every printed code.', icon: Megaphone, features: ['A/B split testing', 'Country targeting', 'UTM campaign builder', 'Scan simulator', 'Year-long scan heatmap'] },
  { to: '/venues', label: 'Venues', title: 'Events & Venues', blurb: 'Run a counter, a café or an event from one dashboard.', icon: Store, features: ['Feedback forms', 'Queue tickets', 'Wi-Fi posters', 'Name-badge sheets', 'Self check-in kiosk'] },
  { to: '/trust', label: 'Trust', title: 'Trust & Safety', blurb: 'Protect people from swapped stickers and fake links.', icon: ShieldCheck, features: ['Link safety checker', 'Offline certificate check', 'View-once secret notes', 'Destination preview', 'Unusual-activity alerts'] },
  { to: '/engine', label: 'Engine', title: 'The Engine Room', blurb: 'See how a QR code really works, layer by layer.', icon: Cpu, features: ['QR X-ray inspector', 'Step-by-step encoder', 'Mask scoreboard', 'Developer API & keys', 'In-browser benchmark'] },
];
