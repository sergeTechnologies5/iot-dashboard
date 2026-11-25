"use client";

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { buildSeed, branches as seedBranches, companies as seedCompanies, companyChannels as seedChannels, gatewayName, makeReference, maskedMsisdn, mulberry32, pickOnlineChannel, users as seedUsers, adminFor } from '@/lib/mock';
import type { PingResult, ServoConfig } from '@/lib/types';
import { DEFAULT_SERVO } from '@/lib/types';
import type { Activity, Billiard, BilliardConfig, Branch, ChannelCatalogEntry, ChannelStatus, Company, CompanyChannel, Country, FreeGameRequest, Game, LedgerEntry, PayMode, PaymentChannel, Payment, PricingRule, Quote, ReleaseMode, User } from '@/lib/types';
import { computeQuote, deriveLedger } from '@/lib/games';
import { COUNTRY_CURRENCY } from '@/lib/types';
import { money } from '@/lib/format';
import { CHANNEL_META, DEFAULT_CATALOG, onlineChannelsFor } from '@/lib/channels';
import { api, ApiError, DATA_SOURCE, getToken, setToken, setUnauthorizedHandler } from '@/lib/api';
import { connectRealtime, RealtimeEvent } from '@/lib/realtime';

export type Permission =
  | 'COMPANY_MANAGE'
  | 'USER_MANAGE'
  | 'BILLIARD_CREATE'
  | 'BILLIARD_ASSIGN'
  | 'BILLIARD_CONTROL'
  | 'DEVICE_VIEW'
  | 'PAYMENT_RECORD'
  | 'PAYMENT_REVERSE'
  | 'PAYMENT_CONFIG'
  | 'CHANNEL_ADMIN'
  | 'FREE_GAME_REQUEST'
  | 'FREE_GAME_APPROVE';

/** Used only in local demo mode; in API mode permissions come from /me. */
const ROLE_PERMS: Record<User['role'], Permission[]> = {
  SUPER_ADMIN: ['COMPANY_MANAGE', 'USER_MANAGE', 'BILLIARD_CREATE', 'BILLIARD_ASSIGN', 'BILLIARD_CONTROL', 'DEVICE_VIEW', 'PAYMENT_RECORD', 'PAYMENT_REVERSE', 'PAYMENT_CONFIG', 'CHANNEL_ADMIN', 'FREE_GAME_REQUEST', 'FREE_GAME_APPROVE'],
  COMPANY_SUPER_ADMIN: ['USER_MANAGE', 'BILLIARD_CREATE', 'BILLIARD_ASSIGN', 'BILLIARD_CONTROL', 'DEVICE_VIEW', 'PAYMENT_RECORD', 'PAYMENT_REVERSE', 'PAYMENT_CONFIG', 'FREE_GAME_REQUEST', 'FREE_GAME_APPROVE'],
  COMPANY_ADMIN: ['BILLIARD_CONTROL', 'PAYMENT_RECORD', 'FREE_GAME_REQUEST'],
};

export interface Toast {
  id: number;
  tone: 'success' | 'info' | 'danger';
  title: string;
  detail?: string;
}

export interface InviteCredentials { name: string; email: string; temporaryPassword: string }

interface MeView {
  id: string;
  name: string;
  email: string;
  role: User['role'];
  companyId: string | null;
  assigned: string[];
  permissions: string[];
}

interface Store {
  ready: boolean;
  source: 'api' | 'local';
  /** realtime connection state (API mode) */
  connected: boolean;
  now: number;
  user: User | null;
  allUsers: User[];
  companies: Company[];
  /** Data already scoped to what the current user may see */
  billiards: Billiard[];
  payments: Payment[];
  activity: Activity[];
  users: User[];
  companyFilter: string; // 'ALL' or companyId (Super Admin only)
  setCompanyFilter: (id: string) => void;
  can: (p: Permission) => boolean;
  /** Resolves to an error message, or null on success */
  login: (email: string, password: string) => Promise<string | null>;
  logout: () => void;
  companyName: (id: string) => string;
  billiardById: (id: string) => Billiard | undefined;
  adminOf: (billiardId: string) => User | undefined;
  // actions
  addCredit: (billiardId: string, tokens?: number) => void;
  releaseBalls: (billiardId: string) => void;
  toggleLock: (billiardId: string, reason?: string) => void;
  recordManualPayment: (input: { billiardId: string; tokens?: number; amount?: number; note?: string }) => void;
  reversePayment: (paymentId: string) => void;
  addBilliard: (input: { name: string; companyId: string; branchId: string; tokenPrice: number; accountRef?: string }) => void;
  addCompany: (input: { name: string; city: string; branches: string[]; country: Country }) => void;
  /** Company → Branch → Billiard */
  branches: Branch[];
  branchesOf: (companyId: string) => Branch[];
  branchById: (id: string) => Branch | undefined;
  addBranch: (companyId: string, input: { name: string; location?: string | null }) => Promise<boolean>;
  updateBranch: (id: string, input: { name: string; location?: string | null }) => Promise<boolean>;
  deleteBranch: (id: string) => Promise<boolean>;
  /** local mode: patch billiards (e.g. when a shortcode is renamed/removed) */
  patchBilliardsLocal: (fn: (b: Billiard) => Billiard) => void;
  /** round-trip check of the table controller (PING -> PONG, 5 s timeout) */
  pingBilliard: (id: string) => Promise<PingResult>;
  /** link (or unlink with '') the controller's MQTT id */
  linkDevice: (id: string, deviceId: string, onError?: (msg: string) => void) => Promise<boolean>;
  /** Super Admin: save the ball-release servo calibration (pushed to the controller) */
  saveServoConfig: (id: string, cfg: ServoConfig, onError?: (msg: string) => void) => Promise<boolean>;
  /** Super Admin: calibration move without using a credit */
  servoTest: (id: string, action: 'OPEN' | 'REST' | 'ANGLE', angle?: number) => Promise<boolean>;
  /** Creates the user; resolves with the one-time login credentials to hand over, or null on failure. */
  inviteUser: (input: { name: string; email: string; role: User['role']; companyId?: string }) => Promise<InviteCredentials | null>;
  setAssignments: (userId: string, billiardIds: string[]) => void;
  /** Edit name/email (and role for users you manage). Resolves true on success. */
  updateUser: (userId: string, input: { name: string; email: string; role?: User['role'] }) => Promise<boolean>;
  /** Issue a new one-time password for someone you manage. */
  resetUserPassword: (userId: string) => Promise<InviteCredentials | null>;
  deleteUser: (userId: string) => Promise<boolean>;
  // payment channels
  catalog: ChannelCatalogEntry[];
  /** Channels for a company: one entry per channel available in its country (NOT_REQUESTED filled in). */
  channelsOf: (companyId: string) => CompanyChannel[];
  /** Channels ACTIVE at company level (online only) */
  activeChannelsOf: (companyId: string) => PaymentChannel[];
  pendingChannelRequests: number;
  refreshChannels: (companyId: string) => void;
  requestChannel: (companyId: string, channel: PaymentChannel) => void;
  setChannelStatus: (companyId: string, channel: PaymentChannel, status: ChannelStatus) => void;
  setMerchant: (companyId: string, channel: PaymentChannel, input: { merchantCode: string; accountName: string }) => void;
  /** onError receives the backend/validation message so the form can show it inline */
  saveBilliardConfig: (billiardId: string, cfg: BilliardConfig, mpesa?: { shortcode: string | null; shortcodeType: 'PAYBILL' | 'TILL' | null; label: string | null } | null, onError?: (msg: string) => void) => Promise<boolean>;
  toasts: Toast[];
  toast: (t: Omit<Toast, 'id'>) => void;
  dismissToast: (id: number) => void;
  liveEnabled: boolean;
  setLiveEnabled: (v: boolean) => void;
  // ---------- game management ----------
  /** games already scoped to visible billiards (recent; per-billiard history loads lazily) */
  games: Game[];
  freeGames: FreeGameRequest[];
  pendingFreeGames: number;
  pricingRulesOf: (billiardId: string) => PricingRule[];
  loadBilliardGames: (billiardId: string) => void;
  loadPricingRules: (billiardId: string) => void;
  endGame: (gameId: string) => void;
  getLedger: (billiardId: string) => Promise<LedgerEntry[]>;
  paymentGames: (paymentId: string) => Promise<Game[]>;
  quote: (billiardId: string, input: { amount?: number; games?: number }) => Promise<Quote>;
  saveGameSettings: (billiardId: string, s: { releaseMode: ReleaseMode; maxGameMinutes: number; creditExpiry: string | null }) => Promise<boolean>;
  savePricingRule: (rule: Omit<PricingRule, 'id'> & { id?: string }) => Promise<boolean>;
  deletePricingRule: (rule: PricingRule) => void;
  requestFreeGame: (input: { billiardId: string; games: number; reason: string; validMinutes: number }) => Promise<boolean>;
  decideFreeGame: (id: string, approve: boolean, note?: string) => void;
  onEvent: (fn: (e: RealtimeEvent) => void) => () => void;
  upsertPayment: (raw: Payment) => Payment;
  creditOnlineLocal: (input: { billiardId: string; amount: number; msisdn: string | null; receipt: string; receivedBy?: string }) => Payment | null;
}

const Ctx = createContext<Store>({} as Store);
export const useStore = () => useContext(Ctx);

const USER_KEY = 'cuetrack_user';
const API = DATA_SOURCE === 'api';

/* ---------- Defensive normalisers (tolerate older backend payloads) ---------- */
const LEGACY_SUB: Record<string, PaymentChannel> = { CASH: 'CASH', MPESA: 'MPESA', CARD: 'CARD' };

function normBranch(b: Branch): Branch {
  return { ...b, id: String(b.id), companyId: String(b.companyId), location: b.location ?? null, tableCount: b.tableCount ?? 0, createdAt: b.createdAt ?? 0 };
}

function normCompany(c: Company): Company {
  const country: Country = c.country === 'RW' ? 'RW' : 'KE';
  return { ...c, branches: c.branches ?? [], country, currency: c.currency ?? COUNTRY_CURRENCY[country] };
}

function normBilliard(b: Billiard): Billiard {
  return {
    ...b,
    tokenPrice: b.tokenPrice ?? b.pricePerGame ?? 0,
    accountRef: b.accountRef ?? '',
    cashEnabled: b.cashEnabled ?? true,
    channels: Array.isArray(b.channels) ? b.channels : [],
    currency: b.currency ?? 'KES',
    releaseMode: b.releaseMode === 'AUTO' ? 'AUTO' : 'MANUAL',
    maxGameMinutes: b.maxGameMinutes ?? 60,
    creditExpiry: b.creditExpiry ?? null,
    walletBalance: b.walletBalance ?? 0,
    currentGame: b.currentGame ? normGame(b.currentGame) : null,
    freeCredits: b.freeCredits ?? 0,
    branchId: b.branchId != null ? String(b.branchId) : '',
    branch: b.branchName ?? b.branch ?? '',
    branchName: b.branchName ?? b.branch ?? '',
    mpesaCredentialId: b.mpesaCredentialId != null ? String(b.mpesaCredentialId) : null,
    mpesaShortcode: b.mpesaShortcode ?? null,
    mpesaShortcodeType: b.mpesaShortcodeType ?? null,
    mpesaLabel: b.mpesaLabel ?? null,
    deviceId: b.deviceId ?? null,
    servo: b.servo ?? DEFAULT_SERVO,
  };
}

function normPayment(p: Payment): Payment {
  const legacy = (p as Payment & { sub?: string }).sub;
  return {
    ...p,
    channel: p.channel ?? (legacy ? LEGACY_SUB[legacy] : undefined) ?? (p.mode === 'MANUAL' ? 'CASH' : 'MPESA'),
    currency: p.currency ?? 'KES',
    games: p.games ?? p.tokens ?? 0,
    tokens: p.tokens ?? p.games ?? 0,
    pricingRule: p.pricingRule ?? null,
  };
}

function normGame(g: Game): Game {
  return {
    ...g,
    paymentId: g.paymentId ?? null,
    batchId: g.batchId ?? g.id,
    free: !!g.free,
    unitPrice: g.unitPrice ?? 0,
    currency: g.currency ?? 'KES',
    releasedBy: g.releasedBy ?? '—',
    endedBy: g.endedBy ?? null,
    requestedAt: g.requestedAt ?? g.startedAt ?? Date.now(),
    startedAt: g.startedAt ?? null,
    endedAt: g.endedAt ?? null,
    durationSec: g.durationSec ?? null,
  };
}

function normFree(f: FreeGameRequest): FreeGameRequest {
  return { ...f, reason: f.reason ?? '', remaining: f.remaining ?? f.games, decidedBy: f.decidedBy ?? null, decisionNote: f.decisionNote ?? null, decidedAt: f.decidedAt ?? null, expiresAt: f.expiresAt ?? null };
}

const asList = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

function normChannel(c: CompanyChannel): CompanyChannel {
  return { channel: c.channel, status: c.status ?? 'NOT_REQUESTED', merchantCode: c.merchantCode ?? null, accountName: c.accountName ?? null, updatedAt: c.updatedAt ?? null };
}

function upsertChannel(list: CompanyChannel[] | undefined, c: CompanyChannel): CompanyChannel[] {
  const cur = list ?? [];
  const i = cur.findIndex((x) => x.channel === c.channel);
  if (i === -1) return [...cur, c];
  const next = cur.slice();
  next[i] = c;
  return next;
}

function upsert<T extends { id: string }>(list: T[], item: T, prepend = false): T[] {
  const i = list.findIndex((x) => x.id === item.id);
  if (i === -1) return prepend ? [item, ...list] : [...list, item];
  const next = list.slice();
  next[i] = item;
  return next;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState(0);
  const [userId, setUserId] = useState<string | null>(null); // local mode
  const [me, setMe] = useState<MeView | null>(null); // api mode
  const [companies, setCompanies] = useState<Company[]>(API ? [] : seedCompanies);
  const [allUsers, setAllUsers] = useState<User[]>(API ? [] : seedUsers);
  const [billiards, setBilliards] = useState<Billiard[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [companyFilter, setCompanyFilter] = useState('ALL');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [liveEnabled, setLiveEnabled] = useState(true);
  const [connected, setConnected] = useState(false);
  const [catalog, setCatalog] = useState<ChannelCatalogEntry[]>(DEFAULT_CATALOG);
  const [channelMap, setChannelMap] = useState<Record<string, CompanyChannel[]>>(API ? {} : seedChannels);
  const [games, setGames] = useState<Game[]>([]);
  const [freeGames, setFreeGames] = useState<FreeGameRequest[]>([]);
  const [rulesMap, setRulesMap] = useState<Record<string, PricingRule[]>>({});
  const [branchList, setBranchList] = useState<Branch[]>(API ? [] : seedBranches);
  const seq = useRef(1000);
  const rnd = useRef(mulberry32(Date.now() % 100000));
  const listeners = useRef(new Set<(e: RealtimeEvent) => void>());

  const toast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = ++seq.current;
    setToasts((x) => [...x.slice(-3), { ...t, id }]);
    setTimeout(() => setToasts((x) => x.filter((y) => y.id !== id)), 4200);
  }, []);
  const dismissToast = useCallback((id: number) => setToasts((x) => x.filter((y) => y.id !== id)), []);

  const fail = useCallback(
    (title: string) => (e: unknown) => toast({ tone: 'danger', title, detail: e instanceof Error ? e.message : String(e) }),
    [toast],
  );

  // ---------- API: session loading ----------
  const clearSession = useCallback(() => {
    setToken(null);
    setMe(null);
    setBilliards([]);
    setPayments([]);
    setActivity([]);
    setCompanies([]);
    setAllUsers([]);
    setChannelMap({});
    setBranchList([]);
  }, []);

  const loadSession = useCallback(async () => {
    const m = await api.get<MeView>('/me');
    const canManageUsers = m.permissions.includes('USER_MANAGE');
    const [cs, bs, ps, as, us, cat] = await Promise.all([
      api.get<Company[]>('/companies'),
      api.get<Billiard[]>('/billiards'),
      api.get<Payment[]>('/payments'),
      api.get<Activity[]>('/activity?limit=60'),
      canManageUsers ? api.get<User[]>('/users') : Promise.resolve([] as User[]),
      api.get<ChannelCatalogEntry[]>('/channels/catalog').catch(() => DEFAULT_CATALOG),
    ]);
    const self: User = { id: m.id, name: m.name, email: m.email, role: m.role, companyId: m.companyId ?? undefined, assigned: m.assigned };
    setMe(m);
    setCompanies(cs.map(normCompany));
    setBilliards(bs.map(normBilliard));
    setPayments(ps.map(normPayment));
    setActivity(as);
    setAllUsers(us.some((u) => u.id === self.id) ? us : [self, ...us]);
    setCatalog(Array.isArray(cat) && cat.length ? cat : DEFAULT_CATALOG);
    // company channels: Super Admin sees every company, CSA only their own; others don't need them beyond billiard chips
    const ids = m.permissions.includes('CHANNEL_ADMIN') ? cs.map((c) => c.id) : m.companyId ? [m.companyId] : [];
    const results = await Promise.allSettled(ids.map((id) => api.get<CompanyChannel[]>(`/companies/${id}/channels`)));
    const map: Record<string, CompanyChannel[]> = {};
    results.forEach((r, i) => {
      if (r.status === 'fulfilled' && Array.isArray(r.value)) map[ids[i]] = r.value.map(normChannel);
    });
    setChannelMap(map);
    // branches for every visible company
    const br = await Promise.allSettled(cs.map((c) => api.get<Branch[]>(`/companies/${c.id}/branches`)));
    setBranchList(br.flatMap((r) => (r.status === 'fulfilled' && Array.isArray(r.value) ? r.value.map(normBranch) : [])));
    // game management: recent games + free-game requests (history per billiard loads lazily)
    const [gs, fg] = await Promise.all([
      api.get<Game[]>(`/games?from=${Date.now() - 7 * 86_400_000}&limit=1000`).catch(() => []),
      api.get<FreeGameRequest[]>('/free-games').catch(() => []),
    ]);
    setGames(asList<Game>(gs).map(normGame));
    setFreeGames(asList<FreeGameRequest>(fg).map(normFree));
  }, []);

  // ---------- Init ----------
  useEffect(() => {
    const t = Date.now();
    /* eslint-disable react-hooks/set-state-in-effect */
    setNow(t);
    if (API) {
      setUnauthorizedHandler(() => clearSession());
      if (getToken()) {
        loadSession()
          .catch((e) => {
            if (!(e instanceof ApiError && e.status === 401)) fail('Could not load data')(e);
            clearSession();
          })
          .finally(() => setReady(true));
      } else setReady(true);
    } else {
      const seed = buildSeed(t);
      setBilliards(seed.billiards);
      setPayments(seed.payments);
      setActivity(seed.activity);
      setGames(seed.games);
      setFreeGames(seed.freeGames);
      setRulesMap(seed.pricingRules.reduce<Record<string, PricingRule[]>>((m, r) => ((m[r.billiardId] ??= []).push(r), m), {}));
      setUserId(localStorage.getItem(USER_KEY));
      setReady(true);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(id);
      setUnauthorizedHandler(null);
    };
  }, [loadSession, clearSession, fail]);

  const user = useMemo<User | null>(() => {
    if (API) return me ? { id: me.id, name: me.name, email: me.email, role: me.role, companyId: me.companyId ?? undefined, assigned: me.assigned } : null;
    return allUsers.find((u) => u.id === userId) ?? null;
  }, [me, allUsers, userId]);

  const can = useCallback(
    (p: Permission) => (API ? !!me?.permissions.includes(p) : user ? ROLE_PERMS[user.role].includes(p) : false),
    [me, user],
  );

  // ---------- API: realtime ----------
  const applyEvent = useCallback((e: RealtimeEvent) => {
    switch (e.type) {
      case 'BILLIARD_UPDATED':
        setBilliards((x) => upsert(x, normBilliard(e.payload as Billiard)));
        break;
      case 'PAYMENT_CREATED':
      case 'PAYMENT_UPDATED':
        setPayments((x) => upsert(x, normPayment(e.payload as Payment), true));
        break;
      case 'ACTIVITY':
        setActivity((x) => upsert(x, e.payload as Activity, true).slice(0, 80));
        break;
      case 'CHANNEL_UPDATED': {
        const p = e.payload as CompanyChannel & { companyId: string };
        if (p?.companyId && p.channel) setChannelMap((m) => ({ ...m, [p.companyId]: upsertChannel(m[p.companyId], normChannel(p)) }));
        break;
      }
      case 'GAME_UPDATED': {
        const g = normGame(e.payload as Game);
        setGames((x) => upsert(x, g, true));
        const live = g.status === 'IN_PLAY' || g.status === 'RELEASING';
        setBilliards((x) => x.map((b) => (b.id !== g.billiardId ? b : live ? { ...b, currentGame: g } : b.currentGame?.id === g.id ? { ...b, currentGame: null } : b)));
        if (g.status === 'COMPLETED' || g.status === 'TIMED_OUT') {
          const name = stateRef.current.billiards.find((b) => b.id === g.billiardId)?.name ?? 'Table';
          const how = g.endedBy === 'TABLE_BUTTON' ? 'End button pressed on the table' : g.endedBy === 'TIMEOUT' ? 'Max game time reached' : `Ended by ${g.endedBy ?? 'staff'}`;
          const mins = g.durationSec != null ? ` · ${Math.floor(g.durationSec / 60)}m ${g.durationSec % 60}s` : '';
          toast({ tone: g.status === 'TIMED_OUT' ? 'danger' : 'info', title: `Game ended on ${name}`, detail: how + mins });
        }
        break;
      }
      case 'CREDITS_CHANGED': {
        const c = e.payload as { billiardId: string; credits?: number; freeCredits?: number; walletBalance?: number };
        setBilliards((x) => x.map((b) => (b.id !== c.billiardId ? b : { ...b, credits: c.credits ?? b.credits, freeCredits: c.freeCredits ?? b.freeCredits, walletBalance: c.walletBalance ?? b.walletBalance })));
        break;
      }
      case 'DEVICE_PRESENCE': {
        const d = e.payload as { billiardId: string; lastSeen?: number | null; rssi?: number | null; firmware?: string | null };
        setBilliards((x) => x.map((b) => (b.id !== String(d.billiardId) ? b : { ...b, lastSeen: d.lastSeen ?? b.lastSeen, rssi: d.rssi ?? b.rssi, firmware: d.firmware ?? b.firmware })));
        break;
      }
      case 'FREE_GAME_UPDATED':
        setFreeGames((x) => upsert(x, normFree(e.payload as FreeGameRequest), true));
        break;
    }
    // fan out to feature providers (M-Pesa STK / unmatched)
    listeners.current.forEach((fn) => fn(e));
  }, []);
  const onEvent = useCallback((fn: (e: RealtimeEvent) => void) => {
    listeners.current.add(fn);
    return () => {
      listeners.current.delete(fn);
    };
  }, []);

  useEffect(() => {
    if (!API || !me || !liveEnabled) return;
    const topic = me.role === 'SUPER_ADMIN' ? '/topic/admin/events' : `/topic/company/${me.companyId}/events`;
    const dispose = connectRealtime(topic, applyEvent, setConnected);
    return () => {
      dispose();
      setConnected(false);
    };
  }, [me, liveEnabled, applyEvent]);

  const changeLive = useCallback(
    (v: boolean) => {
      setLiveEnabled(v);
      // resuming: catch up on anything missed while paused
      if (API && v && me) loadSession().catch(fail('Could not refresh'));
    },
    [me, loadSession, fail],
  );

  const pushActivity = useCallback((a: Omit<Activity, 'id' | 'at'>) => {
    setActivity((x) => [{ ...a, id: `a${++seq.current}`, at: Date.now() }, ...x].slice(0, 60));
  }, []);

  // ---------- Role scoping (backend already scopes; this narrows for the Super Admin company filter) ----------
  const visibleIds = useMemo(() => {
    if (!user) return new Set<string>();
    let list = billiards;
    if (user.role === 'SUPER_ADMIN') {
      if (companyFilter !== 'ALL') list = list.filter((b) => b.companyId === companyFilter);
    } else if (user.role === 'COMPANY_SUPER_ADMIN') {
      list = list.filter((b) => b.companyId === user.companyId);
    } else {
      list = list.filter((b) => (API ? b.adminId === user.id : user.assigned.includes(b.id)));
    }
    return new Set(list.map((b) => b.id));
  }, [user, billiards, companyFilter]);

  const scopedBilliards = useMemo(() => billiards.filter((b) => visibleIds.has(b.id)), [billiards, visibleIds]);
  const scopedPayments = useMemo(() => payments.filter((p) => visibleIds.has(p.billiardId)), [payments, visibleIds]);
  const scopedActivity = useMemo(() => activity.filter((a) => visibleIds.has(a.billiardId)), [activity, visibleIds]);
  const scopedGames = useMemo(() => games.filter((g) => visibleIds.has(g.billiardId)), [games, visibleIds]);
  const scopedFree = useMemo(() => freeGames.filter((f) => visibleIds.has(f.billiardId)), [freeGames, visibleIds]);
  const scopedUsers = useMemo(() => {
    if (!user) return [];
    if (user.role === 'SUPER_ADMIN')
      return companyFilter === 'ALL' ? allUsers : allUsers.filter((u) => u.companyId === companyFilter || u.role === 'SUPER_ADMIN');
    if (user.role === 'COMPANY_SUPER_ADMIN') return allUsers.filter((u) => u.companyId === user.companyId);
    return [user];
  }, [user, allUsers, companyFilter]);

  const companyName = useCallback((id: string) => companies.find((c) => c.id === id)?.name ?? '—', [companies]);
  const billiardById = useCallback((id: string) => billiards.find((b) => b.id === id), [billiards]);
  const adminOf = useCallback(
    (id: string) => {
      if (!API) return adminFor(id, allUsers);
      const b = billiards.find((x) => x.id === id);
      return b?.adminId ? allUsers.find((u) => u.id === b.adminId) : undefined;
    },
    [allUsers, billiards],
  );

  // ---------- Local-mode device simulation ----------
  const sendCommand = useCallback((billiardId: string, apply: (b: Billiard) => Billiard) => {
    const cmdId = `cmd${++seq.current}`;
    setBilliards((list) => list.map((b) => (b.id === billiardId ? { ...b, pending: cmdId } : b)));
    setTimeout(() => {
      setBilliards((list) =>
        list.map((b) => (b.id !== billiardId || b.pending !== cmdId ? b : { ...apply(b), pending: undefined, lastSeen: Date.now() })),
      );
    }, 700 + Math.random() * 500);
  }, []);

  /** API command: optimistic "pending" comes back in the 202 response; the ACK arrives over WebSocket. */
  const command = useCallback(
    (path: string, body: unknown, errTitle: string) =>
      api
        .post<{ commandId: string; billiard: Billiard }>(path, body)
        .then((r) => { setBilliards((x) => upsert(x, normBilliard(r.billiard))); return true; })
        .catch((e) => { fail(errTitle)(e); return false; }),
    [fail],
  );

  // ---------- Local-mode game engine (API mode: backend owns games, ledger and credits) ----------
  const stateRef = useRef({ billiards, payments, games, freeGames, rulesMap });
  useEffect(() => {
    stateRef.current = { billiards, payments, games, freeGames, rulesMap };
  }, [billiards, payments, games, freeGames, rulesMap]);

  /** Starts a game on a table, consuming one credit (free credits first). Returns false if not possible. */
  const startGameLocal = useCallback(
    (billiardId: string, releasedBy: string) => {
      const { billiards: bs, payments: ps, games: gs } = stateRef.current;
      const b = bs.find((x) => x.id === billiardId);
      if (!b || b.currentGame || b.status === 'OFFLINE' || b.status === 'LOCKED' || b.credits + b.freeCredits < 1) return false;
      const free = b.freeCredits > 0;
      let paymentId: string | null = null;
      if (!free) {
        // FIFO: oldest recent payment of this table with games still unplayed
        const used = new Map<string, number>();
        gs.forEach((g) => g.paymentId && g.status !== 'FAILED' && used.set(g.paymentId, (used.get(g.paymentId) ?? 0) + 1));
        const cands = ps.filter((p) => p.billiardId === b.id && p.status === 'COMPLETED' && p.at > Date.now() - 2 * 86_400_000 && (used.get(p.id) ?? 0) < p.games);
        paymentId = cands.length ? cands[cands.length - 1].id : null;
      } else {
        setFreeGames((list) => {
          const f = list.filter((x) => x.billiardId === b.id && x.status === 'APPROVED' && x.remaining > 0).sort((a, z) => a.createdAt - z.createdAt)[0];
          return f ? list.map((x) => (x.id === f.id ? { ...x, remaining: x.remaining - 1, status: x.remaining - 1 <= 0 ? 'USED' : x.status } : x)) : list;
        });
      }
      const at = Date.now();
      const pay = paymentId ? ps.find((p) => p.id === paymentId) : undefined;
      const g: Game = {
        id: `g${++seq.current}`,
        billiardId: b.id,
        companyId: b.companyId,
        status: 'IN_PLAY',
        paymentId,
        batchId: `bt-${paymentId ?? 'free-' + at}`,
        free,
        unitPrice: free ? 0 : pay && pay.games ? pay.amount / pay.games : b.tokenPrice,
        currency: b.currency,
        releasedBy,
        endedBy: null,
        requestedAt: at,
        startedAt: at + 900,
        endedAt: null,
        durationSec: null,
      };
      setGames((x) => [g, ...x]);
      sendCommand(billiardId, (x) => ({
        ...x,
        credits: free ? x.credits : Math.max(0, x.credits - 1),
        freeCredits: free ? Math.max(0, x.freeCredits - 1) : x.freeCredits,
        status: 'IN_PLAY',
        startedAt: g.startedAt,
        currentGame: g,
      }));
      pushActivity({ kind: 'GAME_START', billiardId, title: free ? 'Free game started' : 'Balls released', detail: `${b.name} · ${releasedBy === 'AUTO' ? 'Auto release' : releasedBy}` });
      return true;
    },
    [sendCommand, pushActivity],
  );

  const endGameLocal = useCallback(
    (gameId: string, endedBy: string, timedOut = false) => {
      const { billiards: bs, games: gs } = stateRef.current;
      const g = gs.find((x) => x.id === gameId);
      if (!g || (g.status !== 'IN_PLAY' && g.status !== 'RELEASING')) return;
      const b = bs.find((x) => x.id === g.billiardId);
      const at = Date.now();
      const durationSec = Math.max(1, Math.round((at - (g.startedAt ?? g.requestedAt)) / 1000));
      setGames((x) => x.map((y) => (y.id === gameId ? { ...y, status: timedOut ? 'TIMED_OUT' : 'COMPLETED', endedBy, endedAt: at, durationSec } : y)));
      setBilliards((x) => x.map((y) => (y.id === g.billiardId ? { ...y, status: y.status === 'IN_PLAY' ? 'IDLE' : y.status, startedAt: undefined, currentGame: null, lastSeen: at } : y)));
      if (b) pushActivity({ kind: 'GAME_END', billiardId: b.id, title: timedOut ? 'Game timed out' : 'Game ended', detail: `${b.name} · ${endedBy === 'TABLE_BUTTON' ? 'Table button' : endedBy}` });
      // AUTO tables immediately release the next credit
      if (b?.releaseMode === 'AUTO' && b.credits + b.freeCredits > 0) setTimeout(() => startGameLocal(b.id, 'AUTO'), 1500);
    },
    [pushActivity, startGameLocal],
  );

  const addCredit = useCallback(
    (billiardId: string, tokens = 1) => {
      const b = billiards.find((x) => x.id === billiardId);
      if (!b) return;
      if (API) {
        command(`/billiards/${billiardId}/credit`, { tokens }, `Could not credit ${b.name}`);
        toast({ tone: 'success', title: `Credit sent to ${b.name}`, detail: `${tokens} token${tokens > 1 ? 's' : ''} · awaiting device ACK` });
        return;
      }
      if (b.status === 'OFFLINE') return toast({ tone: 'danger', title: `${b.name} is offline`, detail: 'Credit will not reach the device.' });
      sendCommand(billiardId, (x) => ({ ...x, credits: x.credits + tokens }));
      if (b.releaseMode === 'AUTO' && !b.currentGame) setTimeout(() => startGameLocal(billiardId, 'AUTO'), 1800);
      pushActivity({ kind: 'TOKEN', billiardId, title: `${tokens} credit${tokens > 1 ? 's' : ''} added`, detail: `${b.name} · Remote` });
      toast({ tone: 'success', title: `Credit sent to ${b.name}`, detail: `${tokens} token${tokens > 1 ? 's' : ''} · awaiting device ACK` });
    },
    [billiards, command, sendCommand, pushActivity, toast, startGameLocal],
  );

  const releaseBalls = useCallback(
    (billiardId: string) => {
      const b = billiards.find((x) => x.id === billiardId);
      if (!b) return;
      if (API)
        return void command(`/billiards/${billiardId}/release`, {}, `Could not release on ${b.name}`).then((ok) =>
          ok && toast({ tone: 'info', title: 'Release command sent', detail: `${b.name} · waiting for the controller` }),
        );
      if (b.status === 'OFFLINE' || b.status === 'LOCKED')
        return toast({ tone: 'danger', title: `Cannot release on ${b.name}`, detail: `Table is ${b.status.toLowerCase()}.` });
      if (b.currentGame) return toast({ tone: 'danger', title: 'Game in progress', detail: `End the current game on ${b.name} first.` });
      if (b.credits + b.freeCredits < 1) return toast({ tone: 'danger', title: 'No credits', detail: `Add credit to ${b.name} first.` });
      startGameLocal(billiardId, user?.name ?? 'Staff');
    },
    [billiards, command, startGameLocal, toast, user],
  );

  const toggleLock = useCallback(
    (billiardId: string, reason?: string) => {
      const b = billiards.find((x) => x.id === billiardId);
      if (!b) return;
      const locking = b.status !== 'LOCKED';
      if (API) {
        command(`/billiards/${billiardId}/${locking ? 'lock' : 'unlock'}`, locking ? { reason: reason ?? null } : {}, `Could not ${locking ? 'lock' : 'unlock'} ${b.name}`);
        toast({ tone: 'info', title: `${b.name} ${locking ? 'locking' : 'unlocking'}…` });
        return;
      }
      if (b.status === 'OFFLINE') return toast({ tone: 'danger', title: `${b.name} is offline` });
      if (locking && b.currentGame) return toast({ tone: 'danger', title: 'Game in progress', detail: `End the current game on ${b.name} first.` });
      sendCommand(billiardId, (x) => ({ ...x, status: locking ? 'LOCKED' : 'IDLE', startedAt: undefined, lockReason: locking ? reason ?? null : null, lockedBy: locking ? user?.name ?? null : null, lockedAt: locking ? Date.now() : null }));
      pushActivity({ kind: locking ? 'LOCK' : 'UNLOCK', billiardId, title: locking ? 'Table locked' : 'Table unlocked', detail: b.name + (locking && reason ? ` · ${reason}` : '') });
      toast({ tone: 'info', title: `${b.name} ${locking ? 'locked' : 'unlocked'}` });
    },
    [billiards, command, sendCommand, pushActivity, toast, user],
  );

  const recordManualPayment = useCallback(
    ({ billiardId, tokens, amount: paid, note }: { billiardId: string; tokens?: number; amount?: number; note?: string }) => {
      const b = billiards.find((x) => x.id === billiardId);
      if (!b || !user) return;
      if (API) {
        api
          .post<Payment>('/payments/manual', paid !== undefined ? { billiardId, amount: paid, note } : { billiardId, tokens, note })
          .then((raw) => {
            const p = normPayment(raw);
            setPayments((x) => upsert(x, p, true));
            toast({ tone: 'success', title: 'Manual payment recorded', detail: `${money(p.amount, p.currency)} · ${p.games} game${p.games === 1 ? '' : 's'} credited to ${b.name}` });
          })
          .catch(fail('Payment not recorded'));
        return;
      }
      if (!b.cashEnabled) return toast({ tone: 'danger', title: 'Cash disabled', detail: `${b.name} does not accept cash payments.` });
      // games/amount always derive from the table's pricing (unit price, bundles, happy hour, wallet)
      const q = computeQuote(b, rulesMap[b.id] ?? [], paid !== undefined ? { amount: paid } : { games: tokens ?? 1 });
      if (q.games < 1) return toast({ tone: 'danger', title: 'Amount too small', detail: `Not enough for one game on ${b.name}.` });
      const amount = q.amount;
      const p: Payment = {
        id: `p${++seq.current}`,
        billiardId,
        companyId: b.companyId,
        mode: 'MANUAL',
        channel: 'CASH',
        currency: b.currency,
        payerMsisdn: null,
        externalRef: null,
        reference: makeReference('CASH', rnd.current),
        tokens: q.games,
        games: q.games,
        pricingRule: q.rule,
        amount,
        receivedBy: user.name,
        status: 'COMPLETED',
        note,
        at: Date.now(),
      };
      setPayments((x) => [p, ...x]);
      const wallet = paid !== undefined ? q.remainder : b.walletBalance;
      setBilliards((x) => x.map((y) => (y.id === billiardId ? { ...y, credits: y.credits + q.games, walletBalance: wallet } : y)));
      if (b.releaseMode === 'AUTO' && !b.currentGame) setTimeout(() => startGameLocal(billiardId, 'AUTO'), 1200);
      pushActivity({ kind: 'PAYMENT', mode: 'MANUAL', billiardId, title: `Manual payment ${money(amount, b.currency)}`, detail: `${b.name} · Cash · ${q.games} game${q.games === 1 ? '' : 's'}` });
      toast({ tone: 'success', title: 'Manual payment recorded', detail: `${money(amount, b.currency)} · ${q.games} game${q.games === 1 ? '' : 's'} credited to ${b.name}${q.remainder ? ` · ${money(q.remainder, b.currency)} kept on table` : ''}` });
    },
    [billiards, user, rulesMap, startGameLocal, pushActivity, toast, fail],
  );

  /** Normalise + upsert a payment returned by the API (e.g. unmatched assignment). */
  const upsertPayment = useCallback((raw: Payment) => {
    const p = normPayment(raw);
    setPayments((x) => upsert(x, p, true));
    return p;
  }, []);

  /** Local mode: an online (M-Pesa) payment lands on a table, priced by amount like the backend. */
  const creditOnlineLocal = useCallback(
    (input: { billiardId: string; amount: number; msisdn: string | null; receipt: string; receivedBy?: string }): Payment | null => {
      const b = billiards.find((x) => x.id === input.billiardId);
      if (!b) return null;
      const q = computeQuote(b, rulesMap[b.id] ?? [], { amount: input.amount });
      if (q.games < 1) return null;
      const p: Payment = {
        id: `p${++seq.current}`,
        billiardId: b.id,
        companyId: b.companyId,
        mode: 'ONLINE',
        channel: 'MPESA',
        currency: b.currency,
        payerMsisdn: input.msisdn,
        externalRef: input.receipt,
        reference: input.receipt,
        tokens: q.games,
        games: q.games,
        pricingRule: q.rule,
        amount: input.amount,
        receivedBy: input.receivedBy ?? 'M-Pesa',
        status: 'COMPLETED',
        at: Date.now(),
      };
      setPayments((x) => [p, ...x]);
      setBilliards((x) => x.map((y) => (y.id === b.id ? { ...y, credits: y.credits + q.games, walletBalance: q.remainder } : y)));
      if (b.releaseMode === 'AUTO' && !b.currentGame) setTimeout(() => startGameLocal(b.id, 'AUTO'), 1200);
      pushActivity({ kind: 'PAYMENT', mode: 'ONLINE', billiardId: b.id, title: `M-Pesa ${money(input.amount, b.currency)}`, detail: `${b.name} · ${input.receipt} · ${q.games} game${q.games === 1 ? '' : 's'}` });
      return p;
    },
    [billiards, rulesMap, startGameLocal, pushActivity],
  );

  const reversePayment = useCallback(
    (paymentId: string) => {
      if (API) {
        api
          .post<Payment>(`/payments/${paymentId}/reverse`)
          .then((p) => {
            setPayments((x) => upsert(x, normPayment(p)));
            toast({ tone: 'info', title: 'Payment reversed' });
          })
          .catch(fail('Could not reverse payment'));
        return;
      }
      const p = payments.find((x) => x.id === paymentId);
      if (!p) return;
      // only unused credits are reversed; played games stay
      const used = games.filter((g) => g.paymentId === paymentId && g.status !== 'FAILED').length;
      const unused = Math.max(0, p.games - used);
      setPayments((x) => x.map((y) => (y.id === paymentId ? { ...y, status: 'REVERSED' } : y)));
      if (unused) setBilliards((x) => x.map((b) => (b.id === p.billiardId ? { ...b, credits: Math.max(0, b.credits - unused) } : b)));
      toast({ tone: 'info', title: 'Payment reversed', detail: `${unused} unused credit${unused === 1 ? '' : 's'} removed from the table` });
    },
    [payments, games, toast, fail],
  );

  const addBilliard = useCallback(
    (input: { name: string; companyId: string; branchId: string; tokenPrice: number; accountRef?: string }) => {
      const done = () => toast({ tone: 'success', title: `${input.name} registered`, detail: 'Flash the controller with its device credentials to bring it online.' });
      if (API) {
        api
          .post<Billiard>('/billiards', { ...input, pricePerGame: input.tokenPrice })
          .then((b) => { setBilliards((x) => upsert(x, normBilliard(b))); done(); })
          .catch(fail('Could not register billiard'));
        return;
      }
      const id = `b${++seq.current}`;
      const company = companies.find((c) => c.id === input.companyId);
      const br = branchList.find((x) => x.id === input.branchId);
      setBilliards((x) => [
        ...x,
        {
          id,
          ...input,
          branch: br?.name ?? '',
          branchName: br?.name ?? '',
          mpesaCredentialId: null,
          mpesaShortcode: null,
          mpesaShortcodeType: null,
          mpesaLabel: null,
          accountRef: input.accountRef || `${input.name.replace(/\s+/g, '-').toUpperCase()}`,
          cashEnabled: true,
          channels: [],
          currency: company?.currency ?? 'KES',
          status: 'OFFLINE',
          credits: 0,
          firmware: 'v1.2.0',
          rssi: -90,
          lastSeen: Date.now(),
          releaseMode: 'MANUAL',
          maxGameMinutes: 45,
          creditExpiry: null,
          walletBalance: 0,
          currentGame: null,
          freeCredits: 0,
        },
      ]);
      done();
    },
    [toast, fail, companies, branchList],
  );

  const addCompany = useCallback(
    (input: { name: string; city: string; branches: string[]; country: Country }) => {
      if (API) {
        api
          .post<Company>('/companies', input)
          .then(async (raw) => {
            const c = normCompany(raw);
            setCompanies((x) => upsert(x, c));
            const bs = await api.get<Branch[]>(`/companies/${c.id}/branches`).catch(() => [] as Branch[]);
            setBranchList((x) => [...x.filter((b) => b.companyId !== c.id), ...bs.map(normBranch)]);
            toast({ tone: 'success', title: `${c.name} created` });
          })
          .catch(fail('Could not create company'));
        return;
      }
      const cid = `c${++seq.current}`;
      setCompanies((x) => [...x, { id: cid, createdAt: Date.now(), currency: COUNTRY_CURRENCY[input.country], ...input }]);
      const names = input.branches.length ? input.branches : ['Main'];
      setBranchList((x) => [...x, ...names.map((name, i) => ({ id: `br-${cid}-${i}`, companyId: cid, name, location: null, tableCount: 0, createdAt: Date.now() }))]);
      toast({ tone: 'success', title: `${input.name} created` });
    },
    [toast, fail],
  );

  // ---------- Branches ----------
  const branches = useMemo(() => {
    // local mode (and partial API views) derive the table count from the billiards we know about
    const counts = new Map<string, number>();
    billiards.forEach((b) => counts.set(b.branchId, (counts.get(b.branchId) ?? 0) + 1));
    return branchList.map((b) => ({ ...b, tableCount: API ? Math.max(b.tableCount, counts.get(b.id) ?? 0) : counts.get(b.id) ?? 0 }));
  }, [branchList, billiards]);
  const branchesOf = useCallback((companyId: string) => branches.filter((b) => b.companyId === companyId).sort((a, z) => a.createdAt - z.createdAt), [branches]);
  const branchById = useCallback((id: string) => branches.find((b) => b.id === id), [branches]);

  const addBranch = useCallback(
    async (companyId: string, input: { name: string; location?: string | null }) => {
      const name = input.name.trim();
      if (!name) return false;
      if (branchList.some((b) => b.companyId === companyId && b.name.toLowerCase() === name.toLowerCase())) {
        toast({ tone: 'danger', title: 'Branch not added', detail: `${name} already exists` });
        return false;
      }
      try {
        const b = API
          ? normBranch(await api.post<Branch>(`/companies/${companyId}/branches`, { name, location: input.location || null }))
          : { id: `br${++seq.current}`, companyId, name, location: input.location || null, tableCount: 0, createdAt: Date.now() };
        setBranchList((x) => upsert(x, b));
        toast({ tone: 'success', title: `Branch ${name} added` });
        return true;
      } catch (e) {
        fail('Branch not added')(e);
        return false;
      }
    },
    [branchList, toast, fail],
  );
  const updateBranch = useCallback(
    async (id: string, input: { name: string; location?: string | null }) => {
      const name = input.name.trim();
      if (!name) return false;
      try {
        const prev = branchList.find((b) => b.id === id);
        const b = API ? normBranch(await api.put<Branch>(`/branches/${id}`, { name, location: input.location || null })) : { ...prev!, name, location: input.location || null };
        setBranchList((x) => upsert(x, b));
        setBilliards((x) => x.map((t) => (t.branchId === id ? { ...t, branch: b.name, branchName: b.name } : t)));
        toast({ tone: 'success', title: 'Branch updated', detail: b.name });
        return true;
      } catch (e) {
        fail('Branch not updated')(e);
        return false;
      }
    },
    [branchList, toast, fail],
  );
  const deleteBranch = useCallback(
    async (id: string) => {
      const used = billiards.filter((b) => b.branchId === id).length;
      if (!API && used) {
        toast({ tone: 'danger', title: 'Branch not deleted', detail: `${used} table${used === 1 ? '' : 's'} still belong to it. Move them first.` });
        return false;
      }
      try {
        if (API) await api.del(`/branches/${id}`);
        setBranchList((x) => x.filter((b) => b.id !== id));
        toast({ tone: 'info', title: 'Branch deleted' });
        return true;
      } catch (e) {
        fail('Branch not deleted')(e);
        return false;
      }
    },
    [billiards, toast, fail],
  );
  const patchBilliardsLocal = useCallback((fn: (b: Billiard) => Billiard) => setBilliards((x) => x.map(fn)), []);

  // ---------- device presence ----------
  // toast when a table we can see drops offline / comes back (works for realtime + local)
  const prevStatus = useRef<Map<string, { status: string; lastSeen: number }>>(new Map());
  useEffect(() => {
    const prev = prevStatus.current;
    const first = prev.size === 0;
    for (const b of billiards) {
      const p = prev.get(b.id);
      if (!first && p && p.status !== b.status) {
        if (b.status === 'OFFLINE') toast({ tone: 'danger', title: `${b.name} went offline`, detail: 'Releases and payments are paused until it reconnects.' });
        else if (p.status === 'OFFLINE') {
          const mins = Math.max(1, Math.round((Date.now() - p.lastSeen) / 60_000));
          toast({ tone: 'success', title: `${b.name} is back online`, detail: `Was offline about ${mins}m` });
        }
      }
      prev.set(b.id, { status: b.status, lastSeen: b.status === 'OFFLINE' ? p?.lastSeen ?? b.lastSeen : b.lastSeen });
    }
  }, [billiards, toast]);

  const pingBilliard = useCallback(async (id: string): Promise<PingResult> => {
    if (API) {
      try {
        return await api.post<PingResult>(`/billiards/${id}/ping`, {});
      } catch (e) {
        return { reachable: false, rttMs: null, lastSeen: null, status: 'UNKNOWN', message: e instanceof Error ? e.message : String(e) };
      }
    }
    const b = liveRef.current.billiards.find((x) => x.id === id);
    const up = !!b && b.status !== 'OFFLINE';
    const rtt = 60 + Math.floor(Math.random() * 180);
    await new Promise((r) => setTimeout(r, up ? rtt : 5000));
    if (up) setBilliards((x) => x.map((y) => (y.id === id ? { ...y, lastSeen: Date.now() } : y)));
    return { reachable: up, rttMs: up ? rtt : null, lastSeen: up ? Date.now() : b?.lastSeen ?? null, status: b?.status ?? 'UNKNOWN', message: up ? null : 'No reply in 5s' };
  }, []);

  const saveServoConfig = useCallback(
    async (id: string, cfg: ServoConfig, onError?: (msg: string) => void) => {
      try {
        if (API) {
          const b = await api.put<Billiard>(`/billiards/${id}/servo`, cfg);
          setBilliards((x) => upsert(x, normBilliard(b)));
        } else {
          setBilliards((x) => x.map((y) => (y.id === id ? { ...y, servo: { ...cfg } } : y)));
        }
        toast({ tone: 'success', title: 'Servo calibration saved', detail: 'Sent to the table controller' });
        return true;
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        onError?.(m);
        toast({ tone: 'danger', title: 'Calibration not saved', detail: m });
        return false;
      }
    },
    [toast],
  );

  const servoTest = useCallback(
    async (id: string, action: 'OPEN' | 'REST' | 'ANGLE', angle?: number) => {
      try {
        if (API) await api.post(`/billiards/${id}/servo/test`, { action, angle });
        else {
          const b = liveRef.current.billiards.find((x) => x.id === id);
          if (b?.status === 'OFFLINE') throw new Error(`${b.name} is offline`);
        }
        return true;
      } catch (e) {
        toast({ tone: 'danger', title: 'Test move failed', detail: e instanceof Error ? e.message : String(e) });
        return false;
      }
    },
    [toast],
  );

  const linkDevice = useCallback(
    async (id: string, deviceId: string, onError?: (msg: string) => void) => {
      const v = deviceId.trim();
      try {
        if (v && !/^[A-Za-z0-9_-]{1,40}$/.test(v)) throw new Error('Device id may only contain letters, digits, - and _');
        if (API) {
          const b = await api.put<Billiard>(`/billiards/${id}/device`, { deviceId: v });
          setBilliards((x) => upsert(x, normBilliard(b)));
        } else {
          const other = liveRef.current.billiards.find((x) => x.deviceId === v && x.id !== id);
          if (v && other) throw new Error(`Device ${v} is already linked to ${other.name}`);
          setBilliards((x) => x.map((y) => (y.id === id ? { ...y, deviceId: v || null, lastSeen: v ? Date.now() : y.lastSeen } : y)));
        }
        toast({ tone: 'success', title: v ? `Controller ${v} linked` : 'Controller unlinked' });
        return true;
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        onError?.(m);
        toast({ tone: 'danger', title: 'Could not link controller', detail: m });
        return false;
      }
    },
    [toast],
  );

  const inviteUser = useCallback(
    async (input: { name: string; email: string; role: User['role']; companyId?: string }): Promise<InviteCredentials | null> => {
      if (API) {
        try {
          const res = await api.post<{ user: User; temporaryPassword: string }>('/users/invite', input);
          setAllUsers((x) => upsert(x, res.user));
          toast({ tone: 'success', title: 'User created', detail: res.user.email });
          return { name: res.user.name, email: res.user.email, temporaryPassword: res.temporaryPassword };
        } catch (e) {
          fail('Could not invite user')(e);
          return null;
        }
      }
      setAllUsers((x) => [...x, { id: `u${++seq.current}`, assigned: [], ...input }]);
      toast({ tone: 'success', title: 'Invitation sent', detail: input.email });
      return { name: input.name, email: input.email, temporaryPassword: 'demo123' };
    },
    [toast, fail],
  );

  const updateUser = useCallback(
    async (targetId: string, input: { name: string; email: string; role?: User['role'] }): Promise<boolean> => {
      if (API) {
        try {
          const res = await api.put<{ user: User; token: string | null }>(`/users/${targetId}`, input);
          if (res.token) setToken(res.token); // you changed your own email = login name
          setAllUsers((x) => upsert(x, res.user));
          if (me && res.user.id === me.id) setMe({ ...me, name: res.user.name, email: res.user.email });
          toast({ tone: 'success', title: 'User updated', detail: res.user.email });
          return true;
        } catch (e) {
          fail('Could not update user')(e);
          return false;
        }
      }
      setAllUsers((list) => list.map((u) => (u.id === targetId ? { ...u, name: input.name, email: input.email, role: input.role ?? u.role } : u)));
      toast({ tone: 'success', title: 'User updated', detail: input.email });
      return true;
    },
    [me, toast, fail],
  );

  const resetUserPassword = useCallback(
    async (targetId: string): Promise<InviteCredentials | null> => {
      if (!API) return { name: '', email: '', temporaryPassword: 'demo123' };
      try {
        const res = await api.post<{ user: User; temporaryPassword: string }>(`/users/${targetId}/reset-password`);
        return { name: res.user.name, email: res.user.email, temporaryPassword: res.temporaryPassword };
      } catch (e) {
        fail('Could not reset password')(e);
        return null;
      }
    },
    [fail],
  );

  const deleteUser = useCallback(
    async (targetId: string): Promise<boolean> => {
      const gone = allUsers.find((u) => u.id === targetId);
      if (API) {
        try {
          await api.del<void>(`/users/${targetId}`);
          const bs = await api.get<Billiard[]>('/billiards'); // their billiards are now unassigned
          setBilliards(bs.map(normBilliard));
        } catch (e) {
          fail('Could not delete user')(e);
          return false;
        }
      }
      setAllUsers((x) => x.filter((u) => u.id !== targetId));
      toast({ tone: 'success', title: 'User deleted', detail: gone?.email });
      return true;
    },
    [allUsers, toast, fail],
  );

  const setAssignments = useCallback(
    (targetId: string, ids: string[]) => {
      const done = () => toast({ tone: 'success', title: 'Assignments updated', detail: `${ids.length} billiard${ids.length === 1 ? '' : 's'} assigned` });
      if (API) {
        api
          .put<User>(`/users/${targetId}/assignments`, { billiardIds: ids })
          .then(async () => {
            const [us, bs] = await Promise.all([api.get<User[]>('/users'), api.get<Billiard[]>('/billiards')]);
            setAllUsers((prev) => (us.length ? us : prev));
            setBilliards(bs.map(normBilliard));
            done();
          })
          .catch(fail('Could not update assignments'));
        return;
      }
      setAllUsers((list) =>
        list.map((u) => {
          if (u.id === targetId) return { ...u, assigned: ids };
          if (u.role === 'COMPANY_ADMIN') return { ...u, assigned: u.assigned.filter((b) => !ids.includes(b)) };
          return u;
        }),
      );
      done();
    },
    [toast, fail],
  );

  // ---------- Local-mode live simulation (API mode gets this from the backend) ----------
  const liveRef = useRef({ billiards });
  useEffect(() => {
    liveRef.current = { billiards };
  }, [billiards]);

  // local mode: online tables "heartbeat" every 15 s
  useEffect(() => {
    if (API || !ready) return;
    const id = setInterval(() => {
      const t = Date.now();
      setBilliards((x) => x.map((b) => (b.status === 'OFFLINE' ? b : { ...b, lastSeen: t - Math.floor(Math.random() * 1500) })));
    }, 15_000);
    return () => clearInterval(id);
  }, [ready]);

  useEffect(() => {
    if (API || !ready || !liveEnabled) return;
    const id = setInterval(() => {
      const { billiards: list } = liveRef.current;
      const online = list.filter((b) => b.status !== 'OFFLINE' && b.status !== 'LOCKED');
      if (!online.length) return;
      const r = rnd.current;
      const b = online[Math.floor(r() * online.length)];
      const roll = r();
      if (roll < 0.5) {
        const picked = r() < 0.65 ? pickOnlineChannel(b, r) : null;
        if (!picked && !b.cashEnabled) return;
        const mode: PayMode = picked ? 'ONLINE' : 'MANUAL';
        const channel: PaymentChannel = picked ?? 'CASH';
        const tokens = 1 + Math.floor(r() * 3);
        const reference = makeReference(channel, r);
        const p: Payment = {
          id: `p${++seq.current}`,
          billiardId: b.id,
          companyId: b.companyId,
          mode,
          channel,
          currency: b.currency,
          payerMsisdn: maskedMsisdn(channel, r),
          externalRef: picked ? reference : null,
          reference,
          tokens,
          games: tokens,
          pricingRule: null,
          amount: tokens * b.tokenPrice,
          receivedBy: mode === 'ONLINE' ? gatewayName(channel) : adminFor(b.id, seedUsers)?.name ?? 'Front desk',
          status: 'COMPLETED',
          at: Date.now(),
        };
        setPayments((x) => [p, ...x]);
        setBilliards((x) => x.map((y) => (y.id === b.id ? { ...y, credits: y.credits + tokens, lastSeen: Date.now() } : y)));
        if (b.releaseMode === 'AUTO' && !b.currentGame) setTimeout(() => startGameLocal(b.id, 'AUTO'), 1500);
        pushActivity({
          kind: 'PAYMENT',
          mode,
          billiardId: b.id,
          title: `${mode === 'ONLINE' ? 'Online' : 'Manual'} payment ${money(p.amount, p.currency)}`,
          detail: `${b.name} · ${mode === 'ONLINE' ? CHANNEL_META[channel].label : 'Coin slot'}`,
        });
      } else if (roll < 0.75 && b.currentGame) {
        // player pressed the end button on the table
        endGameLocal(b.currentGame.id, 'TABLE_BUTTON');
      } else if (!b.currentGame && b.credits + b.freeCredits > 0 && b.status === 'IDLE') {
        startGameLocal(b.id, b.releaseMode === 'AUTO' ? 'AUTO' : adminFor(b.id, seedUsers)?.name ?? 'Front desk');
      }
    }, 5000);
    return () => clearInterval(id);
  }, [ready, liveEnabled, pushActivity, startGameLocal, endGameLocal]);

  // local housekeeping: max game length and free-credit expiry
  useEffect(() => {
    if (API || !ready) return;
    const id = setInterval(() => {
      const t = Date.now();
      const { billiards: bs, freeGames: fg } = stateRef.current;
      for (const b of bs) {
        const g = b.currentGame;
        if (g?.startedAt && t - g.startedAt > b.maxGameMinutes * 60_000) endGameLocal(g.id, 'TIMEOUT', true);
      }
      const expired = fg.filter((f) => f.status === 'APPROVED' && f.expiresAt && f.expiresAt < t);
      if (expired.length) {
        setFreeGames((x) => x.map((f) => (expired.some((e) => e.id === f.id) ? { ...f, status: 'EXPIRED' } : f)));
        setBilliards((x) => x.map((b) => {
          const lost = expired.filter((e) => e.billiardId === b.id).reduce((s, e) => s + e.remaining, 0);
          return lost ? { ...b, freeCredits: Math.max(0, b.freeCredits - lost) } : b;
        }));
      }
    }, 4000);
    return () => clearInterval(id);
  }, [ready, endGameLocal]);

  // ---------- Game management actions ----------
  const pricingRulesOf = useCallback((id: string) => rulesMap[id] ?? [], [rulesMap]);

  const loadBilliardGames = useCallback((id: string) => {
    if (!API) return;
    api
      .get<Game[]>(`/billiards/${id}/games?from=${Date.now() - 30 * 86_400_000}`)
      .then((list) => setGames((x) => {
        const incoming = asList<Game>(list).map(normGame);
        const ids = new Set(incoming.map((g) => g.id));
        return [...incoming, ...x.filter((g) => !ids.has(g.id))].sort((a, z) => z.requestedAt - a.requestedAt);
      }))
      .catch(() => {});
  }, []);

  const loadPricingRules = useCallback((id: string) => {
    if (!API) return;
    api.get<PricingRule[]>(`/billiards/${id}/pricing-rules`).then((list) => setRulesMap((m) => ({ ...m, [id]: asList<PricingRule>(list) }))).catch(() => {});
  }, []);

  const endGame = useCallback(
    (gameId: string) => {
      if (API) {
        api.post<Game>(`/games/${gameId}/end`).then((g) => applyEvent({ type: 'GAME_UPDATED', payload: g })).catch(fail('Could not end game'));
        return;
      }
      endGameLocal(gameId, user?.name ?? 'Staff');
    },
    [applyEvent, endGameLocal, fail, user],
  );

  const getLedger = useCallback(
    async (id: string): Promise<LedgerEntry[]> => {
      if (API) return asList<LedgerEntry>(await api.get<LedgerEntry[]>(`/billiards/${id}/ledger?limit=300`).catch(() => []));
      const b = billiards.find((x) => x.id === id);
      return b ? deriveLedger(b, payments, games, freeGames) : [];
    },
    [billiards, payments, games, freeGames],
  );

  const paymentGames = useCallback(
    async (pid: string): Promise<Game[]> => {
      if (API) return asList<Game>(await api.get<Game[]>(`/payments/${pid}/games`).catch(() => [])).map(normGame);
      return games.filter((g) => g.paymentId === pid);
    },
    [games],
  );

  const quote = useCallback(
    async (id: string, input: { amount?: number; games?: number }): Promise<Quote> => {
      const b = billiards.find((x) => x.id === id)!;
      const local = computeQuote(b, rulesMap[id] ?? [], input);
      if (!API) return local;
      const qs = input.amount !== undefined ? `amount=${input.amount}` : `games=${input.games ?? 1}`;
      return api.get<Quote>(`/billiards/${id}/quote?${qs}`).then((q) => ({ ...local, ...q })).catch(() => local);
    },
    [billiards, rulesMap],
  );

  const saveGameSettings = useCallback(
    async (id: string, s: { releaseMode: ReleaseMode; maxGameMinutes: number; creditExpiry: string | null }) => {
      if (API) {
        try {
          const b = await api.put<Billiard>(`/billiards/${id}/game-settings`, s);
          setBilliards((x) => upsert(x, normBilliard(b)));
          toast({ tone: 'success', title: 'Game settings saved' });
          return true;
        } catch (e) {
          fail('Game settings not saved')(e);
          return false;
        }
      }
      setBilliards((x) => x.map((b) => (b.id === id ? { ...b, ...s } : b)));
      toast({ tone: 'success', title: 'Game settings saved' });
      return true;
    },
    [toast, fail],
  );

  const savePricingRule = useCallback(
    async (rule: Omit<PricingRule, 'id'> & { id?: string }) => {
      if (API) {
        try {
          const saved = rule.id ? await api.put<PricingRule>(`/pricing-rules/${rule.id}`, rule) : await api.post<PricingRule>(`/billiards/${rule.billiardId}/pricing-rules`, rule);
          setRulesMap((m) => ({ ...m, [rule.billiardId]: upsert(m[rule.billiardId] ?? [], saved) }));
          toast({ tone: 'success', title: `Pricing rule \u201c${saved.name}\u201d saved` });
          return true;
        } catch (e) {
          fail('Pricing rule not saved')(e);
          return false;
        }
      }
      const saved: PricingRule = { ...rule, id: rule.id ?? `pr${++seq.current}` };
      setRulesMap((m) => ({ ...m, [rule.billiardId]: upsert(m[rule.billiardId] ?? [], saved) }));
      toast({ tone: 'success', title: `Pricing rule \u201c${saved.name}\u201d saved` });
      return true;
    },
    [toast, fail],
  );

  const deletePricingRule = useCallback(
    (rule: PricingRule) => {
      const drop = () => setRulesMap((m) => ({ ...m, [rule.billiardId]: (m[rule.billiardId] ?? []).filter((r) => r.id !== rule.id) }));
      if (API) return void api.del(`/pricing-rules/${rule.id}`).then(() => { drop(); toast({ tone: 'info', title: 'Pricing rule deleted' }); }).catch(fail('Could not delete rule'));
      drop();
      toast({ tone: 'info', title: 'Pricing rule deleted' });
    },
    [toast, fail],
  );

  const requestFreeGame = useCallback(
    async (input: { billiardId: string; games: number; reason: string; validMinutes: number }) => {
      if (API) {
        try {
          const f = await api.post<FreeGameRequest>('/free-games', input);
          setFreeGames((x) => upsert(x, normFree(f), true));
          toast({ tone: 'success', title: 'Free game requested', detail: 'Waiting for approval' });
          return true;
        } catch (e) {
          fail('Request not sent')(e);
          return false;
        }
      }
      const b = billiards.find((x) => x.id === input.billiardId);
      if (!b || !user) return false;
      const f: FreeGameRequest = {
        id: `fg${++seq.current}`, ...input, companyId: b.companyId, requestedBy: user.name, requestedById: user.id, status: 'PENDING',
        decidedBy: null, decisionNote: null, createdAt: Date.now(), decidedAt: null, expiresAt: null, remaining: input.games,
      };
      setFreeGames((x) => [f, ...x]);
      toast({ tone: 'success', title: 'Free game requested', detail: `${b.name} \u00b7 waiting for approval` });
      return true;
    },
    [billiards, user, toast, fail],
  );

  const decideFreeGame = useCallback(
    (id: string, approve: boolean, note?: string) => {
      if (API) {
        api
          .post<FreeGameRequest>(`/free-games/${id}/${approve ? 'approve' : 'reject'}`, { note })
          .then((f) => { setFreeGames((x) => upsert(x, normFree(f))); toast({ tone: approve ? 'success' : 'info', title: approve ? 'Free game approved' : 'Request rejected' }); })
          .catch(fail('Could not update request'));
        return;
      }
      const f = freeGames.find((x) => x.id === id);
      if (!f || f.status !== 'PENDING') return;
      const at = Date.now();
      setFreeGames((x) => x.map((y) => (y.id === id ? { ...y, status: approve ? 'APPROVED' : 'REJECTED', decidedBy: user?.name ?? '\u2014', decisionNote: note || null, decidedAt: at, expiresAt: approve ? at + y.validMinutes * 60_000 : null } : y)));
      if (approve) {
        setBilliards((x) => x.map((b) => (b.id === f.billiardId ? { ...b, freeCredits: b.freeCredits + f.games } : b)));
        const b = billiards.find((x) => x.id === f.billiardId);
        if (b?.releaseMode === 'AUTO' && !b.currentGame) setTimeout(() => startGameLocal(b.id, 'AUTO'), 1200);
      }
      toast({ tone: approve ? 'success' : 'info', title: approve ? 'Free game approved' : 'Request rejected', detail: `${f.games} game${f.games === 1 ? '' : 's'} \u00b7 ${billiards.find((x) => x.id === f.billiardId)?.name ?? ''}` });
    },
    [freeGames, billiards, user, startGameLocal, toast, fail],
  );

  const pendingFreeGames = useMemo(() => scopedFree.filter((f) => f.status === 'PENDING').length, [scopedFree]);

  // ---------- Auth ----------
  const login = useCallback(
    async (email: string, password: string): Promise<string | null> => {
      if (API) {
        try {
          const { token } = await api.login(email.trim().toLowerCase(), password);
          setToken(token);
          await loadSession();
          setCompanyFilter('ALL');
          return null;
        } catch (e) {
          setToken(null);
          if (e instanceof ApiError && (e.status === 401 || e.status === 403)) return 'Invalid email or password';
          return e instanceof Error ? e.message : 'Sign in failed';
        }
      }
      const u = allUsers.find((x) => x.email.toLowerCase() === email.trim().toLowerCase());
      if (!u) return 'No account with that email. Pick a demo account below.';
      localStorage.setItem(USER_KEY, u.id);
      setUserId(u.id);
      setCompanyFilter('ALL');
      return null;
    },
    [allUsers, loadSession],
  );

  const logout = useCallback(() => {
    if (API) clearSession();
    localStorage.removeItem(USER_KEY);
    setUserId(null);
  }, [clearSession]);

  // ---------- Payment channels ----------
  const channelsOf = useCallback(
    (companyId: string): CompanyChannel[] => {
      const c = companies.find((x) => x.id === companyId);
      if (!c) return [];
      const have = channelMap[companyId] ?? [];
      return onlineChannelsFor(c.country, catalog).map(
        (ch) => have.find((x) => x.channel === ch) ?? { channel: ch, status: 'NOT_REQUESTED', merchantCode: null, accountName: null, updatedAt: null },
      );
    },
    [companies, channelMap, catalog],
  );

  const activeChannelsOf = useCallback(
    (companyId: string) => (channelMap[companyId] ?? []).filter((c) => c.status === 'ACTIVE' && c.channel !== 'CASH').map((c) => c.channel),
    [channelMap],
  );

  const pendingChannelRequests = useMemo(
    () => Object.values(channelMap).reduce((n, list) => n + list.filter((c) => c.status === 'PENDING').length, 0),
    [channelMap],
  );

  const refreshChannels = useCallback(
    (companyId: string) => {
      if (!API) return;
      api
        .get<CompanyChannel[]>(`/companies/${companyId}/channels`)
        .then((list) => setChannelMap((m) => ({ ...m, [companyId]: list.map(normChannel) })))
        .catch(fail('Could not load payment channels'));
    },
    [fail],
  );

  const putLocalChannel = useCallback((companyId: string, channel: PaymentChannel, patch: Partial<CompanyChannel>) => {
    setChannelMap((m) => {
      const cur = (m[companyId] ?? []).find((x) => x.channel === channel) ?? { channel, status: 'NOT_REQUESTED' as ChannelStatus, merchantCode: null, accountName: null, updatedAt: null };
      return { ...m, [companyId]: upsertChannel(m[companyId], { ...cur, ...patch, updatedAt: Date.now() }) };
    });
  }, []);

  const channelCall = useCallback(
    (companyId: string, req: Promise<CompanyChannel>, ok: string, errTitle: string) =>
      req
        .then((c) => {
          setChannelMap((m) => ({ ...m, [companyId]: upsertChannel(m[companyId], normChannel(c)) }));
          toast({ tone: 'success', title: ok });
        })
        .catch(fail(errTitle)),
    [toast, fail],
  );

  const requestChannel = useCallback(
    (companyId: string, channel: PaymentChannel) => {
      const label = CHANNEL_META[channel].label;
      if (API) return void channelCall(companyId, api.post<CompanyChannel>(`/companies/${companyId}/channels/${channel}/request`), `${label} activation requested`, 'Request failed');
      putLocalChannel(companyId, channel, { status: 'PENDING' });
      toast({ tone: 'success', title: `${label} activation requested`, detail: 'The platform team will review it shortly.' });
    },
    [channelCall, putLocalChannel, toast],
  );

  const setChannelStatus = useCallback(
    (companyId: string, channel: PaymentChannel, status: ChannelStatus) => {
      const label = `${CHANNEL_META[channel].label} ${status === 'ACTIVE' ? 'activated' : status === 'SUSPENDED' ? 'suspended' : 'updated'}`;
      if (API) return void channelCall(companyId, api.put<CompanyChannel>(`/companies/${companyId}/channels/${channel}/status`, { status }), label, 'Could not update channel');
      putLocalChannel(companyId, channel, { status });
      // suspending at company level removes the channel from every table of that company
      if (status !== 'ACTIVE')
        setBilliards((x) => x.map((b) => (b.companyId === companyId && b.channels.includes(channel) ? { ...b, channels: b.channels.filter((c) => c !== channel) } : b)));
      toast({ tone: status === 'ACTIVE' ? 'success' : 'info', title: label, detail: companies.find((c) => c.id === companyId)?.name });
    },
    [channelCall, putLocalChannel, toast, companies],
  );

  const setMerchant = useCallback(
    (companyId: string, channel: PaymentChannel, input: { merchantCode: string; accountName: string }) => {
      const label = `${CHANNEL_META[channel].label} merchant details saved`;
      if (API) return void channelCall(companyId, api.put<CompanyChannel>(`/companies/${companyId}/channels/${channel}/merchant`, input), label, 'Could not save merchant details');
      putLocalChannel(companyId, channel, input);
      toast({ tone: 'success', title: label });
    },
    [channelCall, putLocalChannel, toast],
  );

  const saveBilliardConfig = useCallback(
    async (billiardId: string, cfg: BilliardConfig, mpesa?: { shortcode: string | null; shortcodeType: 'PAYBILL' | 'TILL' | null; label: string | null } | null, onError?: (msg: string) => void) => {
      const reject = (detail: string) => {
        onError?.(detail);
        toast({ tone: 'danger', title: 'Configuration not saved', detail });
        return false;
      };
      if (API) {
        try {
          const b = await api.put<Billiard>(`/billiards/${billiardId}/config`, cfg);
          setBilliards((x) => upsert(x, normBilliard(b)));
          toast({ tone: 'success', title: 'Configuration saved', detail: b.name });
          return true;
        } catch (e) {
          onError?.(e instanceof Error ? e.message : String(e));
          fail('Configuration not saved')(e);
          return false;
        }
      }
      const b = billiards.find((x) => x.id === billiardId);
      if (!b) return false;
      const allowed = new Set(activeChannelsOf(b.companyId));
      const bad = cfg.channels.filter((c) => !allowed.has(c));
      if (bad.length) {
        return reject(`${bad.map((c) => CHANNEL_META[c].label).join(', ')} not active for this company`);
      }
      // mirror backend rules for the M-Pesa shortcode
      if (cfg.channels.includes('MPESA') && !cfg.mpesaCredentialId) {
        return reject('Choose the M-Pesa Paybill / Till for this table');
      }
      if (mpesa?.shortcodeType === 'TILL' && billiards.some((y) => y.id !== billiardId && y.mpesaCredentialId === cfg.mpesaCredentialId)) {
        return reject('This Till is already linked to another table');
      }
      const branch = cfg.branchId ? branchList.find((x) => x.id === cfg.branchId && x.companyId === b.companyId) : undefined;
      if (cfg.branchId && !branch) return reject('Branch not found for this company');
      if (mpesa?.shortcodeType === 'PAYBILL' && !cfg.accountRef.trim()) return reject('Account number is required for a Paybill');
      setBilliards((x) =>
        x.map((y) =>
          y.id === billiardId
            ? { ...y, ...cfg, branchId: branch ? branch.id : y.branchId, branch: branch ? branch.name : y.branch, branchName: branch ? branch.name : y.branchName, mpesaCredentialId: cfg.mpesaCredentialId ?? null, mpesaShortcode: mpesa?.shortcode ?? null, mpesaShortcodeType: mpesa?.shortcodeType ?? null, mpesaLabel: mpesa?.label ?? null }
            : y,
        ),
      );
      toast({ tone: 'success', title: 'Configuration saved', detail: b.name });
      return true;
    },
    [billiards, branchList, activeChannelsOf, toast, fail],
  );

  const value: Store = {
    ready,
    source: DATA_SOURCE,
    connected,
    now,
    user,
    allUsers,
    companies,
    billiards: scopedBilliards,
    payments: scopedPayments,
    activity: scopedActivity,
    users: scopedUsers,
    companyFilter,
    setCompanyFilter,
    can,
    login,
    logout,
    companyName,
    billiardById,
    adminOf,
    addCredit,
    releaseBalls,
    toggleLock,
    recordManualPayment,
    reversePayment,
    addBilliard,
    addCompany,
    inviteUser,
    setAssignments,
    updateUser,
    resetUserPassword,
    deleteUser,
    catalog,
    channelsOf,
    activeChannelsOf,
    pendingChannelRequests,
    refreshChannels,
    requestChannel,
    setChannelStatus,
    setMerchant,
    saveBilliardConfig,
    branches,
    branchesOf,
    branchById,
    addBranch,
    updateBranch,
    deleteBranch,
    patchBilliardsLocal,
    pingBilliard,
    linkDevice,
    saveServoConfig,
    servoTest,
    games: scopedGames,
    freeGames: scopedFree,
    pendingFreeGames,
    pricingRulesOf,
    loadBilliardGames,
    loadPricingRules,
    endGame,
    getLedger,
    paymentGames,
    quote,
    saveGameSettings,
    savePricingRule,
    deletePricingRule,
    requestFreeGame,
    decideFreeGame,
    onEvent,
    upsertPayment,
    creditOnlineLocal,
    toasts,
    toast,
    dismissToast,
    liveEnabled,
    setLiveEnabled: changeLive,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
