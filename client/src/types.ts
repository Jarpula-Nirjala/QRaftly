import type { QrType } from '../../shared/payloads.ts';
import type { Design } from '../../shared/qr/render.ts';

export type Kind = 'static' | 'dynamic' | 'profile' | 'medical';

export interface Rule {
  label?: string;
  days?: number[];
  from?: string;
  to?: string;
  os?: Array<'ios' | 'android' | 'windows' | 'mac' | 'linux'>;
  lang?: string[];
  country?: string[];
  target: string;
}

export interface Qr {
  id: string;
  slug: string;
  kind: Kind;
  type: QrType;
  title: string;
  data: Record<string, any>;
  design: Design;
  rules: Rule[];
  security: { expiresAt?: number | null; maxScans?: number | null; preview?: boolean; hasPin: boolean; hasPrivatePin: boolean };
  timezone: string;
  scanCount: number;
  active: boolean;
  createdAt: number;
  updatedAt: number;
  content: string;
  shortUrl: string | null;
}

export interface Stats {
  total: number;
  unique: number;
  blocked: number;
  bots: number;
  byDay: Array<{ day: string; n: number }>;
  byHour: number[];
  os: Array<{ name: string; n: number }>;
  device: Array<{ name: string; n: number }>;
  browser: Array<{ name: string; n: number }>;
  country: Array<{ name: string; n: number }>;
  lang: Array<{ name: string; n: number }>;
  targets: Array<{ name: string; n: number }>;
  recent: Array<{ at: number; device: string; os: string; browser: string; country: string; outcome: string }>;
}

export const KIND_LABEL: Record<Kind, string> = { static: 'Static', dynamic: 'Dynamic', profile: 'Profile', medical: 'Medical' };
