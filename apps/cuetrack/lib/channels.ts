/** Payment channel metadata (labels, brand colours, icons) and helpers. */
import type { ChannelCatalogEntry, Country, Currency, PaymentChannel } from './types';

export interface ChannelMeta {
  label: string;
  short: string;
  /** brand colour */
  color: string;
  /** translucent background for badges */
  bg: string;
  icon: 'phone' | 'card' | 'cash';
  country: Country | null;
  online: boolean;
}

export const CHANNEL_META: Record<PaymentChannel, ChannelMeta> = {
  MPESA: { label: 'M-Pesa', short: 'M-Pesa', color: '#3fbf5f', bg: 'rgba(63,191,95,.14)', icon: 'phone', country: 'KE', online: true },
  AIRTEL_KE: { label: 'Airtel Money', short: 'Airtel', color: '#ef4b4b', bg: 'rgba(239,75,75,.14)', icon: 'phone', country: 'KE', online: true },
  MTN_RW: { label: 'MTN MoMo', short: 'MTN', color: '#ffcb05', bg: 'rgba(255,203,5,.14)', icon: 'phone', country: 'RW', online: true },
  AIRTEL_RW: { label: 'Airtel Money', short: 'Airtel', color: '#ef4b4b', bg: 'rgba(239,75,75,.14)', icon: 'phone', country: 'RW', online: true },
  CARD: { label: 'Card', short: 'Card', color: '#d4ad55', bg: 'rgba(212,173,85,.14)', icon: 'card', country: null, online: true },
  CASH: { label: 'Cash', short: 'Cash', color: '#a9b4ae', bg: 'rgba(169,180,174,.12)', icon: 'cash', country: null, online: false },
};

export const ALL_CHANNELS: PaymentChannel[] = ['MPESA', 'AIRTEL_KE', 'MTN_RW', 'AIRTEL_RW', 'CARD', 'CASH'];

/** Fallback when /channels/catalog is unavailable (and for local mode). */
export const DEFAULT_CATALOG: ChannelCatalogEntry[] = ALL_CHANNELS.map((c) => ({ channel: c, label: CHANNEL_META[c].label, country: CHANNEL_META[c].country }));

/** Online channels a company in `country` can request (Cash is always implicit). */
export function onlineChannelsFor(country: Country, catalog: ChannelCatalogEntry[] = DEFAULT_CATALOG): PaymentChannel[] {
  return catalog.filter((e) => e.channel !== 'CASH' && (e.country === null || e.country === country)).map((e) => e.channel);
}

export const CURRENCIES: Currency[] = ['KES', 'RWF'];

/** Defensive read of a backend money map like {KES: 1200, RWF: 0}. */
export function readMoneyMap(v: unknown): Partial<Record<Currency, number>> {
  if (typeof v === 'number') return { KES: v };
  if (!v || typeof v !== 'object') return {};
  const out: Partial<Record<Currency, number>> = {};
  for (const c of CURRENCIES) {
    const n = (v as Record<string, unknown>)[c];
    if (typeof n === 'number' && isFinite(n)) out[c] = n;
  }
  return out;
}
