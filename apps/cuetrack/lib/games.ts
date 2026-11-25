/** Game-management helpers: pricing quotes, ledger derivation and game stats (shared by local mode and UI). */
import type { Billiard, FreeGameRequest, Game, GameStats, LedgerEntry, Payment, PricingRule, Quote, RuleRef } from './types';
import { DAY, startOfDay } from './format';

export const ISO_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const toMin = (hhmm: string | null) => {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  return isFinite(h) && isFinite(m) ? h * 60 + m : null;
};

/** ISO weekday, Mon=1..Sun=7 */
export const isoDay = (t: number) => ((new Date(t).getDay() + 6) % 7) + 1;

export function happyHourActive(r: PricingRule, at: number) {
  if (r.type !== 'HAPPY_HOUR' || !r.active || !r.unitPrice) return false;
  if (r.daysOfWeek?.length && !r.daysOfWeek.includes(isoDay(at))) return false;
  const s = toMin(r.startTime);
  const e = toMin(r.endTime);
  if (s === null || e === null) return true;
  const d = new Date(at);
  const m = d.getHours() * 60 + d.getMinutes();
  return s <= e ? m >= s && m < e : m >= s || m < e; // window may wrap midnight
}

export const ruleRef = (r: PricingRule): RuleRef => ({ id: r.id, name: r.name, type: r.type });

/** Local mirror of GET /billiards/{id}/quote. Wallet balance tops up an amount-based purchase. */
export function computeQuote(b: Billiard, rules: PricingRule[], input: { amount?: number; games?: number }, at = Date.now()): Quote {
  const hh = rules.find((r) => happyHourActive(r, at));
  const unit = Math.max(1, hh?.unitPrice ?? b.tokenPrice);
  const bundles = rules.filter((r) => r.type === 'BUNDLE' && r.active && r.games && r.price).sort((a, z) => z.games! - a.games!);

  if (input.games !== undefined) {
    const n = Math.max(0, Math.floor(input.games));
    const exact = bundles.find((r) => r.games === n && r.price! < n * unit);
    if (exact) return { games: n, unitPrice: exact.price! / n, amount: exact.price!, remainder: 0, walletUsed: 0, rule: ruleRef(exact) };
    return { games: n, unitPrice: unit, amount: n * unit, remainder: 0, walletUsed: 0, rule: hh ? ruleRef(hh) : null };
  }

  const amount = Math.max(0, input.amount ?? 0);
  const wallet = b.walletBalance ?? 0;
  let budget = amount + wallet;
  let games = 0;
  let rule: Quote['rule'] = hh ? ruleRef(hh) : null;
  const bundle = bundles.find((r) => r.price! <= budget && r.price! < r.games! * unit);
  if (bundle) {
    games += bundle.games!;
    budget -= bundle.price!;
    rule = ruleRef(bundle);
  }
  games += Math.floor(budget / unit);
  const remainder = Math.round((budget % unit) * 100) / 100;
  return { games, unitPrice: games ? (amount + wallet - remainder) / games : unit, amount, remainder, walletUsed: wallet, rule };
}

/** Local mirror of GET /billiards/{id}/ledger: derived from payments, games and free-game grants. */
export function deriveLedger(b: Billiard, payments: Payment[], games: Game[], free: FreeGameRequest[]): LedgerEntry[] {
  type Ev = Omit<LedgerEntry, 'balanceAfter'>;
  const ev: Ev[] = [];
  for (const p of payments) {
    if (p.billiardId !== b.id || p.status === 'FAILED' || p.status === 'PENDING') continue;
    ev.push({ id: `l-p-${p.id}`, billiardId: b.id, type: 'PURCHASE', delta: p.games, refType: 'PAYMENT', refId: p.id, actor: p.receivedBy, at: p.at });
    if (p.status === 'REVERSED') {
      const used = games.filter((g) => g.paymentId === p.id).length;
      const back = Math.max(0, p.games - used);
      if (back) ev.push({ id: `l-r-${p.id}`, billiardId: b.id, type: 'REVERSAL', delta: -back, refType: 'PAYMENT', refId: p.id, actor: 'Reversal', at: p.at + 1 });
    }
  }
  for (const f of free) {
    if (f.billiardId !== b.id || !f.decidedAt || (f.status !== 'APPROVED' && f.status !== 'USED' && f.status !== 'EXPIRED')) continue;
    ev.push({ id: `l-f-${f.id}`, billiardId: b.id, type: 'FREE', delta: f.games, refType: 'FREE_GAME', refId: f.id, actor: f.decidedBy ?? '—', at: f.decidedAt });
    if (f.status === 'EXPIRED' && f.remaining > 0 && f.expiresAt)
      ev.push({ id: `l-e-${f.id}`, billiardId: b.id, type: 'EXPIRY', delta: -f.remaining, refType: 'FREE_GAME', refId: f.id, actor: 'System', at: f.expiresAt });
  }
  for (const g of games) {
    if (g.billiardId !== b.id || g.status === 'FAILED') continue;
    ev.push({ id: `l-g-${g.id}`, billiardId: b.id, type: 'GAME', delta: -1, refType: 'GAME', refId: g.id, actor: g.releasedBy, at: g.requestedAt });
  }
  ev.sort((a, z) => a.at - z.at);
  // anchor so the running balance ends at the table's current credits
  const net = ev.reduce((s, e) => s + e.delta, 0);
  let bal = b.credits + (b.freeCredits ?? 0) - net;
  const out: LedgerEntry[] = [];
  if (bal !== 0 && ev.length) out.push({ id: `l-open-${b.id}`, billiardId: b.id, type: 'ADJUSTMENT', delta: bal, balanceAfter: bal, refType: null, refId: null, actor: 'Opening balance', at: ev[0].at - 1 });
  for (const e of ev) {
    bal += e.delta;
    out.push({ ...e, balanceAfter: bal });
  }
  return out.reverse();
}

export const gameEnded = (g: Game) => g.status === 'COMPLETED' || g.status === 'TIMED_OUT';

/** Client-side mirror of GET /stats/games. */
export function computeGameStats(games: Game[], billiards: Billiard[], days: number, now: number): GameStats {
  const t0 = startOfDay(now);
  const start = t0 - (days - 1) * DAY;
  const ids = new Set(billiards.map((b) => b.id));
  const mine = games.filter((g) => ids.has(g.billiardId) && g.status !== 'FAILED');
  const today = mine.filter((g) => g.requestedAt >= t0);
  const done = mine.filter((g) => gameEnded(g) && g.durationSec);
  const avg = done.length ? done.reduce((s, g) => s + (g.durationSec ?? 0), 0) / done.length : 0;
  const daily = Array.from({ length: days }, (_, i) => ({ day: start + i * DAY, games: 0 }));
  const heat = new Map<string, number[]>(billiards.map((b) => [b.id, Array(24).fill(0)]));
  let playedSec = 0;
  for (const g of mine) {
    if (g.requestedAt < start) continue;
    const idx = Math.floor((startOfDay(g.requestedAt) - start) / DAY);
    if (idx >= 0 && idx < days) daily[idx].games++;
    heat.get(g.billiardId)![new Date(g.startedAt ?? g.requestedAt).getHours()]++;
    if (g.requestedAt >= t0) playedSec += g.durationSec ?? (g.startedAt ? (now - g.startedAt) / 1000 : 0);
  }
  const openSec = Math.max(1, (now - t0) / 1000) * Math.max(1, billiards.filter((b) => b.status !== 'OFFLINE').length);
  return {
    gamesToday: today.length,
    avgDurationSec: Math.round(avg),
    utilisationPct: Math.min(100, Math.round((playedSec / openSec) * 1000) / 10),
    outstandingCredits: billiards.reduce((s, b) => s + b.credits + (b.freeCredits ?? 0), 0),
    daily,
    heatmap: Array.from(heat.entries()).map(([billiardId, hours]) => ({ billiardId, hours })),
  };
}

/** Breakdown of a payment's games ("where did my money go"). */
export function paymentUsage(p: Payment, games: Game[]) {
  const mine = games.filter((g) => g.paymentId === p.id).sort((a, z) => a.requestedAt - z.requestedAt);
  const played = mine.filter(gameEnded).length;
  const inPlay = mine.filter((g) => g.status === 'IN_PLAY' || g.status === 'RELEASING').length;
  const remaining = p.status === 'REVERSED' ? 0 : Math.max(0, p.games - mine.filter((g) => g.status !== 'FAILED').length);
  return { games: mine, played, inPlay, remaining, unitPrice: p.games ? p.amount / p.games : 0 };
}

export const fmtDuration = (sec: number | null | undefined) => {
  if (!sec && sec !== 0) return '—';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m ${String(s).padStart(2, '0')}s`;
};
