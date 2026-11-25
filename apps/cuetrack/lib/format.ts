import type { Currency, Payment, PaymentChannel } from './types';

export const DAY = 86_400_000;

const kes = new Intl.NumberFormat('en-KE', { maximumFractionDigits: 0 });
/** Formats as `KES 1,200` / `RWF 1,500`. Amounts in different currencies must never be summed. */
export const money = (n: number, currency: Currency = 'KES') => `${currency} ${kes.format(Math.round(n))}`;
/** Curried form for places that take a (n) => string formatter. */
export const moneyIn = (currency: Currency) => (n: number) => money(n, currency);
export const compact = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 10_000 ? `${(n / 1000).toFixed(1)}K` : kes.format(n);

export function startOfDay(t: number) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function timeAgo(t: number, now: number) {
  const s = Math.max(0, Math.floor((now - t) / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function duration(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((v) => String(v).padStart(2, '0')).join(':');
}

export const dateTime = (t: number) =>
  new Date(t).toLocaleString('en-KE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

export const shortDate = (t: number) => new Date(t).toLocaleDateString('en-KE', { day: '2-digit', month: 'short' });

export const time = (t: number) => new Date(t).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', hour12: false });

/** Only completed payments count towards revenue. */
export const counts = (p: Payment) => p.status === 'COMPLETED';

export function sumBy(list: Payment[]) {
  let manual = 0;
  let online = 0;
  for (const p of list) {
    if (!counts(p)) continue;
    if (p.mode === 'MANUAL') manual += p.amount;
    else online += p.amount;
  }
  return { manual, online, total: manual + online };
}

/** Currencies present in a list, KES first. */
export function currenciesOf(list: { currency?: Currency }[]): Currency[] {
  const s = new Set<Currency>();
  list.forEach((x) => s.add(x.currency ?? 'KES'));
  return (['KES', 'RWF'] as Currency[]).filter((c) => s.has(c));
}

/** sumBy split per currency (never sums across currencies). */
export function sumByCurrency(list: Payment[]) {
  const out: Partial<Record<Currency, ReturnType<typeof sumBy>>> = {};
  for (const c of currenciesOf(list)) out[c] = sumBy(list.filter((p) => (p.currency ?? 'KES') === c));
  return out;
}

/** Completed revenue per channel (single currency list expected). */
export function sumByChannel(list: Payment[]) {
  const out: Partial<Record<PaymentChannel, { amount: number; count: number }>> = {};
  for (const p of list) {
    if (!counts(p)) continue;
    const e = (out[p.channel] ??= { amount: 0, count: 0 });
    e.amount += p.amount;
    e.count += 1;
  }
  return out;
}

export function dailySeries(list: Payment[], days: number, now: number) {
  const start = startOfDay(now) - (days - 1) * DAY;
  const out = Array.from({ length: days }, (_, i) => ({ day: start + i * DAY, manual: 0, online: 0 }));
  for (const p of list) {
    if (!counts(p) || p.at < start) continue;
    const idx = Math.floor((startOfDay(p.at) - start) / DAY);
    if (idx < 0 || idx >= days) continue;
    if (p.mode === 'MANUAL') out[idx].manual += p.amount;
    else out[idx].online += p.amount;
  }
  return out;
}

export function initials(name: string) {
  return name
    .split(' ')
    .map((x) => x[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
