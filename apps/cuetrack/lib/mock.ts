import type { Activity, Billiard, Branch, Company, MpesaCredential, CompanyChannel, Currency, FreeGameRequest, Game, PaymentChannel, Payment, PayStatus, PricingRule, TableStatus, User } from './types';
import { CHANNEL_META } from './channels';

/** Deterministic PRNG so the demo data is stable between reloads. */
export function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAY = 86_400_000;

export const companies: Company[] = [
  { id: 'c1', name: 'Downtown Cue Club', city: 'Nairobi CBD', branches: ['CBD', 'Westlands'], createdAt: Date.UTC(2025, 2, 14), country: 'KE', currency: 'KES' },
  { id: 'c2', name: 'Eastlands Pool Lounge', city: 'Nairobi East', branches: ['Main'], createdAt: Date.UTC(2025, 6, 2), country: 'KE', currency: 'KES' },
  { id: 'c3', name: 'Westgate Billiards', city: 'Westlands', branches: ['Main'], createdAt: Date.UTC(2026, 0, 20), country: 'KE', currency: 'KES' },
  { id: 'c4', name: 'Kigali Cue Lounge', city: 'Kigali', branches: ['Main'], createdAt: Date.UTC(2026, 4, 8), country: 'RW', currency: 'RWF' },
];

const ch = (channel: PaymentChannel, status: CompanyChannel['status'], merchantCode: string | null = null, accountName: string | null = null): CompanyChannel => ({
  channel,
  status,
  merchantCode,
  accountName,
  updatedAt: Date.UTC(2026, 5, 1),
});

/** Company-level channel enablement (local demo mode). */
export const companyChannels: Record<string, CompanyChannel[]> = {
  c1: [ch('MPESA', 'ACTIVE', '522533', 'Downtown Cue Club'), ch('AIRTEL_KE', 'ACTIVE', 'DTC001', 'Downtown Cue Club'), ch('CARD', 'ACTIVE', 'MID-883012', 'Downtown Cue Club Ltd')],
  c2: [ch('MPESA', 'ACTIVE', '4089112', 'Eastlands Pool'), ch('AIRTEL_KE', 'ACTIVE', 'EPL77', 'Eastlands Pool'), ch('CARD', 'ACTIVE', 'MID-120044', 'Eastlands Pool Lounge')],
  c3: [ch('MPESA', 'ACTIVE', '880100', 'Westgate Billiards'), ch('AIRTEL_KE', 'ACTIVE', 'WGB12', 'Westgate Billiards'), ch('CARD', 'ACTIVE', 'MID-700921', 'Westgate Billiards')],
  c4: [ch('MTN_RW', 'ACTIVE', '*182*8*1*0788', 'Kigali Cue Lounge'), ch('AIRTEL_RW', 'ACTIVE', 'KCL-4410', 'Kigali Cue Lounge'), ch('CARD', 'PENDING')],
};

const tableSpec: [string, string, string, TableStatus, number][] = [
  // id, companyId, branch, status, price
  ['b1', 'c1', 'CBD', 'IN_PLAY', 50],
  ['b2', 'c1', 'CBD', 'IDLE', 50],
  ['b3', 'c1', 'CBD', 'IN_PLAY', 50],
  ['b4', 'c1', 'CBD', 'OFFLINE', 50],
  ['b5', 'c1', 'Westlands', 'IN_PLAY', 60],
  ['b6', 'c1', 'Westlands', 'IDLE', 60],
  ['b7', 'c1', 'Westlands', 'LOCKED', 60],
  ['b8', 'c1', 'Westlands', 'IN_PLAY', 60],
  ['b9', 'c2', 'Main', 'IN_PLAY', 40],
  ['b10', 'c2', 'Main', 'IDLE', 40],
  ['b11', 'c2', 'Main', 'IN_PLAY', 40],
  ['b12', 'c2', 'Main', 'OFFLINE', 40],
  ['b13', 'c3', 'Main', 'IN_PLAY', 100],
  ['b14', 'c3', 'Main', 'IDLE', 100],
  ['b15', 'c3', 'Main', 'IN_PLAY', 100],
  ['b16', 'c4', 'Main', 'IN_PLAY', 500],
  ['b17', 'c4', 'Main', 'IDLE', 500],
  ['b18', 'c4', 'Main', 'IN_PLAY', 700],
  ['b19', 'c4', 'Main', 'IDLE', 700],
];

/** Branches (Company -> Branch -> Billiard). */
const BR = (companyId: string, name: string) => `br-${companyId}-${name.toLowerCase()}`;
export const branches: Branch[] = [
  { id: BR('c1', 'CBD'), companyId: 'c1', name: 'CBD', location: 'Moi Avenue, Nairobi', tableCount: 0, createdAt: Date.UTC(2025, 2, 14) },
  { id: BR('c1', 'Westlands'), companyId: 'c1', name: 'Westlands', location: 'Woodvale Grove', tableCount: 0, createdAt: Date.UTC(2025, 8, 1) },
  { id: BR('c2', 'Main'), companyId: 'c2', name: 'Main', location: 'Donholm', tableCount: 0, createdAt: Date.UTC(2025, 6, 2) },
  { id: BR('c3', 'Main'), companyId: 'c3', name: 'Main', location: 'Westgate Mall', tableCount: 0, createdAt: Date.UTC(2026, 0, 20) },
  { id: BR('c4', 'Main'), companyId: 'c4', name: 'Main', location: 'Kimihurura, Kigali', tableCount: 0, createdAt: Date.UTC(2026, 4, 8) },
];

const cred = (id: string, companyId: string, label: string, shortcode: string, shortcodeType: 'PAYBILL' | 'TILL', branchIds: string[]): MpesaCredential => ({
  id, companyId, label, active: true, branchIds, tableCount: 0, tables: [], configured: true, shortcode, shortcodeType, environment: 'PRODUCTION',
  hasConsumerKey: true, hasConsumerSecret: true, hasPasskey: true, callbackUrls: null, urlsRegisteredAt: Date.UTC(2026, 9, 1), callbackBaseUrl: null, updatedAt: Date.UTC(2026, 9, 1),
});
/** M-Pesa Paybills/Tills (local demo mode). Kigali has none. */
export const mpesaCredentials: MpesaCredential[] = [
  cred('mp1', 'c1', 'Main Paybill', '522533', 'PAYBILL', [BR('c1', 'CBD'), BR('c1', 'Westlands')]),
  cred('mp2', 'c1', 'Westlands VIP Paybill', '522600', 'PAYBILL', [BR('c1', 'Westlands')]),
  cred('mp3', 'c1', 'Bar Till', '881234', 'TILL', [BR('c1', 'Westlands')]),
  cred('mp4', 'c2', 'Main Paybill', '4089112', 'PAYBILL', [BR('c2', 'Main')]),
  cred('mp5', 'c3', 'Main Paybill', '880100', 'PAYBILL', [BR('c3', 'Main')]),
];
/** table -> shortcode (others in the company fall back to the company's first Paybill) */
const TABLE_CRED: Record<string, string> = { b7: 'mp2', b8: 'mp3' };

const PREFIX: Record<string, string> = { c1: 'DTC', c2: 'EPL', c3: 'WGB', c4: 'KCL' };

export const users: User[] = [
  { id: 'u0', name: 'Phineas Mwangi', email: 'phineas@cuetrack.io', role: 'SUPER_ADMIN', assigned: [] },
  { id: 'u1', name: 'Grace Wanjiku', email: 'grace@downtowncue.co.ke', role: 'COMPANY_SUPER_ADMIN', companyId: 'c1', assigned: [] },
  { id: 'u2', name: 'Brian Otieno', email: 'brian@downtowncue.co.ke', role: 'COMPANY_ADMIN', companyId: 'c1', assigned: ['b1', 'b2', 'b3', 'b4'] },
  { id: 'u3', name: 'Sarah Njeri', email: 'sarah@downtowncue.co.ke', role: 'COMPANY_ADMIN', companyId: 'c1', assigned: ['b5', 'b6', 'b7', 'b8'] },
  { id: 'u4', name: 'Kevin Kamau', email: 'kevin@eastlandspool.co.ke', role: 'COMPANY_SUPER_ADMIN', companyId: 'c2', assigned: [] },
  { id: 'u5', name: 'Mercy Achieng', email: 'mercy@eastlandspool.co.ke', role: 'COMPANY_ADMIN', companyId: 'c2', assigned: ['b9', 'b10', 'b11', 'b12'] },
  { id: 'u6', name: 'David Mutua', email: 'david@westgatebilliards.co.ke', role: 'COMPANY_SUPER_ADMIN', companyId: 'c3', assigned: [] },
  { id: 'u7', name: 'Linda Chebet', email: 'linda@westgatebilliards.co.ke', role: 'COMPANY_ADMIN', companyId: 'c3', assigned: ['b13', 'b14', 'b15'] },
  { id: 'u8', name: 'Aline Uwase', email: 'aline@kigalicue.rw', role: 'COMPANY_SUPER_ADMIN', companyId: 'c4', assigned: [] },
  { id: 'u9', name: 'Eric Mugisha', email: 'eric@kigalicue.rw', role: 'COMPANY_ADMIN', companyId: 'c4', assigned: ['b16', 'b17', 'b18', 'b19'] },
];

export function adminFor(billiardId: string, list: User[]) {
  return list.find((u) => u.role === 'COMPANY_ADMIN' && u.assigned.includes(billiardId));
}

export function makeReference(channel: PaymentChannel, rnd: () => number) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
  let s = '';
  for (let i = 0; i < 10; i++) s += chars[Math.floor(rnd() * chars.length)];
  switch (channel) {
    case 'MPESA':
      return 'QK' + s.slice(0, 8);
    case 'AIRTEL_KE':
    case 'AIRTEL_RW':
      return 'AM' + s.slice(0, 9);
    case 'MTN_RW':
      return 'MP' + String(Math.floor(rnd() * 1e10)).padStart(10, '0');
    case 'CARD':
      return 'CRD-' + s.slice(0, 8);
    default:
      return 'MAN-' + s.slice(0, 6);
  }
}

/** Masked payer number for an online payment, e.g. 2547******89. */
export function maskedMsisdn(channel: PaymentChannel, rnd: () => number) {
  if (channel === 'CASH' || channel === 'CARD') return null;
  const cc = CHANNEL_META[channel].country === 'RW' ? '2507' : '2547';
  return `${cc}******${String(Math.floor(rnd() * 100)).padStart(2, '0')}`;
}

export function gatewayName(channel: PaymentChannel) {
  return `${CHANNEL_META[channel].label} Gateway`;
}

/** Picks an online channel from a table's config, weighted towards the dominant mobile wallet. */
export function pickOnlineChannel(b: Billiard, rnd: () => number): PaymentChannel | null {
  const online = b.channels.filter((c) => c !== 'CASH');
  if (!online.length) return null;
  const weight = (c: PaymentChannel) => (c === 'MPESA' || c === 'MTN_RW' ? 6 : c === 'CARD' ? 1 : 2);
  const total = online.reduce((a, c) => a + weight(c), 0);
  let r = rnd() * total;
  for (const c of online) {
    r -= weight(c);
    if (r <= 0) return c;
  }
  return online[0];
}

function mpesaLink(id: string, companyId: string, mpesaOn: boolean) {
  const c = mpesaOn ? mpesaCredentials.find((x) => x.id === TABLE_CRED[id]) ?? mpesaCredentials.find((x) => x.companyId === companyId && x.shortcodeType === 'PAYBILL') : undefined;
  return { mpesaCredentialId: c?.id ?? null, mpesaShortcode: c?.shortcode ?? null, mpesaShortcodeType: c?.shortcodeType ?? null, mpesaLabel: c?.label ?? null };
}

export function buildSeed(now: number) {
  const rnd = mulberry32(20261113);

  const billiards: Billiard[] = tableSpec.map(([id, companyId, branch, status, price], i) => {
    const company = companies.find((c) => c.id === companyId)!;
    const active = companyChannels[companyId].filter((c) => c.status === 'ACTIVE').map((c) => c.channel);
    return {
      id,
      name: `Table ${String(i + 1).padStart(2, '0')}`,
      companyId,
      branch,
      branchId: BR(companyId, branch),
      branchName: branch,
      ...mpesaLink(id, companyId, active.includes('MPESA')),
      status,
      credits: status === 'IN_PLAY' ? Math.floor(rnd() * 3) : status === 'IDLE' ? Math.floor(rnd() * 2) : 0,
      tokenPrice: price,
      accountRef: `${PREFIX[companyId]}-T${String(i + 1).padStart(2, '0')}`,
      cashEnabled: true,
      // Card stays off on a couple of tables to make the config visible
      channels: active.filter((c) => c !== 'CARD' || i % 3 !== 0),
      currency: company.currency,
      releaseMode: i % 4 === 1 ? 'AUTO' : 'MANUAL',
      maxGameMinutes: 45,
      creditExpiry: companyId === 'c3' ? '23:59' : null,
      walletBalance: i % 5 === 2 ? Math.round(price * 0.4) : 0,
      currentGame: null,
      freeCredits: 0,
      startedAt: status === 'IN_PLAY' ? now - Math.floor(rnd() * 40 + 3) * 60_000 : undefined,
      firmware: rnd() > 0.3 ? 'v1.2.0' : 'v1.1.4',
      rssi: -45 - Math.floor(rnd() * 35),
      lastSeen: status === 'OFFLINE' ? now - Math.floor(rnd() * 120 + 20) * 60_000 : now - Math.floor(rnd() * 20) * 1000,
    };
  });

  const payments: Payment[] = [];
  let n = 0;
  for (const b of billiards) {
    const admin = adminFor(b.id, users);
    for (let d = 29; d >= 0; d--) {
      // busier on weekends + slight growth trend
      const dayStart = new Date(now - d * DAY);
      dayStart.setHours(0, 0, 0, 0);
      const weekday = dayStart.getDay();
      const busy = (weekday === 5 || weekday === 6 ? 1.6 : 1) * (1 + (29 - d) / 60);
      const count = Math.floor((rnd() * 4 + 2) * busy);
      for (let k = 0; k < count; k++) {
        const hour = 11 + Math.floor(rnd() * 12);
        const at = dayStart.getTime() + hour * 3_600_000 + Math.floor(rnd() * 3_600_000);
        if (at > now) continue;
        const picked = rnd() < 0.62 ? pickOnlineChannel(b, rnd) : null;
        const online = picked !== null;
        const channel: PaymentChannel = picked ?? 'CASH';
        const tokens = 1 + Math.floor(rnd() * (online ? 4 : 3));
        const r = rnd();
        const status: PayStatus = r < 0.93 ? 'COMPLETED' : r < 0.97 ? 'PENDING' : r < 0.99 ? 'FAILED' : 'REVERSED';
        const reference = makeReference(channel, rnd);
        payments.push({
          id: `p${++n}`,
          billiardId: b.id,
          companyId: b.companyId,
          mode: online ? 'ONLINE' : 'MANUAL',
          channel,
          currency: b.currency,
          payerMsisdn: maskedMsisdn(channel, rnd),
          externalRef: online ? reference : null,
          reference,
          tokens,
          games: tokens,
          amount: tokens * b.tokenPrice,
          receivedBy: online ? gatewayName(channel) : admin?.name ?? 'Front desk',
          status: d === 0 && status === 'PENDING' ? 'PENDING' : status === 'PENDING' ? 'COMPLETED' : status,
          at,
        });
      }
    }
  }
  payments.sort((a, b) => b.at - a.at);

  const activity: Activity[] = payments.slice(0, 14).map((p, i) => {
    const b = billiards.find((x) => x.id === p.billiardId)!;
    return {
      id: `a${i}`,
      at: p.at,
      kind: 'PAYMENT',
      billiardId: p.billiardId,
      mode: p.mode,
      title: `${p.mode === 'ONLINE' ? 'Online' : 'Manual'} payment ${p.currency} ${p.amount.toLocaleString()}`,
      detail: `${b.name} · ${CHANNEL_META[p.channel].label}`,
    };
  });

  // ---- games: each completed payment token became one game, played back-to-back after the payment ----
  const games: Game[] = [];
  let gn = 0;
  for (const p of payments) {
    if (p.status !== 'COMPLETED') continue;
    const b = billiards.find((x) => x.id === p.billiardId)!;
    let t = p.at + 60_000;
    for (let i = 0; i < p.games; i++) {
      const dur = (12 + Math.floor(rnd() * 24)) * 60 + Math.floor(rnd() * 60);
      const end = t + dur * 1000;
      if (end > now - 60_000) break; // unplayed tokens stay as outstanding credit
      const timedOut = dur > b.maxGameMinutes * 60;
      games.push({
        id: `g${++gn}`,
        billiardId: b.id,
        companyId: b.companyId,
        status: timedOut ? 'TIMED_OUT' : 'COMPLETED',
        paymentId: p.id,
        batchId: `bt-${p.id}`,
        free: false,
        unitPrice: b.tokenPrice,
        currency: b.currency,
        releasedBy: b.releaseMode === 'AUTO' ? 'AUTO' : p.mode === 'MANUAL' ? p.receivedBy : 'AUTO',
        endedBy: timedOut ? 'TIMEOUT' : 'TABLE_BUTTON',
        requestedAt: t - 4000,
        startedAt: t,
        endedAt: end,
        durationSec: timedOut ? b.maxGameMinutes * 60 : dur,
      });
      t = end + (2 + Math.floor(rnd() * 15)) * 60_000;
    }
  }
  // tables currently in play get a live game linked to their latest payment
  for (const b of billiards) {
    if (b.status !== 'IN_PLAY' || !b.startedAt) continue;
    const last = payments.find((p) => p.billiardId === b.id && p.status === 'COMPLETED');
    const g: Game = {
      id: `g${++gn}`,
      billiardId: b.id,
      companyId: b.companyId,
      status: 'IN_PLAY',
      paymentId: last?.id ?? null,
      batchId: `bt-${last?.id ?? b.id}`,
      free: false,
      unitPrice: b.tokenPrice,
      currency: b.currency,
      releasedBy: b.releaseMode === 'AUTO' ? 'AUTO' : adminFor(b.id, users)?.name ?? 'Front desk',
      endedBy: null,
      requestedAt: b.startedAt - 3000,
      startedAt: b.startedAt,
      endedAt: null,
      durationSec: null,
    };
    games.push(g);
    b.currentGame = g;
  }
  games.sort((a, z) => z.requestedAt - a.requestedAt);

  // ---- pricing rules ----
  const pricingRules: PricingRule[] = [];
  let rn = 0;
  for (const b of billiards) {
    pricingRules.push({ id: `pr${++rn}`, billiardId: b.id, type: 'BUNDLE', name: '5 for 4', active: true, games: 5, price: b.tokenPrice * 4, daysOfWeek: null, startTime: null, endTime: null, unitPrice: null });
    if (b.companyId === 'c1' || b.companyId === 'c4')
      pricingRules.push({ id: `pr${++rn}`, billiardId: b.id, type: 'HAPPY_HOUR', name: 'Weekday happy hour', active: true, games: null, price: null, daysOfWeek: [1, 2, 3, 4, 5], startTime: '14:00', endTime: '17:00', unitPrice: Math.round(b.tokenPrice * 0.7) });
  }

  // ---- free-game requests ----
  const freeGames: FreeGameRequest[] = [
    { id: 'fg1', billiardId: 'b2', companyId: 'c1', requestedBy: 'Brian Otieno', requestedById: 'u2', games: 2, reason: 'Ball got stuck mid-game, customer lost a frame', validMinutes: 60, status: 'PENDING', decidedBy: null, decisionNote: null, createdAt: now - 6 * 60_000, decidedAt: null, expiresAt: null, remaining: 2 },
    { id: 'fg2', billiardId: 'b6', companyId: 'c1', requestedBy: 'Sarah Njeri', requestedById: 'u3', games: 1, reason: 'Loyal regular, birthday', validMinutes: 120, status: 'PENDING', decidedBy: null, decisionNote: null, createdAt: now - 22 * 60_000, decidedAt: null, expiresAt: null, remaining: 1 },
    { id: 'fg3', billiardId: 'b17', companyId: 'c4', requestedBy: 'Eric Mugisha', requestedById: 'u9', games: 1, reason: 'Coin slot jammed, refund as game', validMinutes: 30, status: 'PENDING', decidedBy: null, decisionNote: null, createdAt: now - 3 * 60_000, decidedAt: null, expiresAt: null, remaining: 1 },
    { id: 'fg4', billiardId: 'b1', companyId: 'c1', requestedBy: 'Brian Otieno', requestedById: 'u2', games: 1, reason: 'Cue tip broke', validMinutes: 60, status: 'USED', decidedBy: 'Grace Wanjiku', decisionNote: 'OK', createdAt: now - 2 * DAY, decidedAt: now - 2 * DAY + 300_000, expiresAt: now - 2 * DAY + 3_900_000, remaining: 0 },
  ];

  return { billiards, payments, activity, games, pricingRules, freeGames };
}

export type { Currency };
