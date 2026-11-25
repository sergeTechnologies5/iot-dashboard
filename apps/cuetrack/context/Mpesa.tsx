"use client";

/**
 * M-Pesa (Daraja) feature state: STK pushes, per-company credentials, unmatched
 * C2B payments and dev callback simulation. Lives beside the main Store and
 * listens to its realtime fan-out; local mode has a small in-memory mock.
 */
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError, DATA_SOURCE } from '@/lib/api';
import type { MpesaCredential, MpesaEnvironment, ShortcodeType, StkRequest, UnmatchedPayment } from '@/lib/types';
import { useStore } from './Store';
import { mpesaCredentials as seedCreds } from '@/lib/mock';

const API = DATA_SOURCE === 'api';

export interface CredentialInput {
  shortcode: string;
  shortcodeType?: ShortcodeType;
  environment?: MpesaEnvironment;
  consumerKey?: string;
  consumerSecret?: string;
  passkey?: string;
  callbackBaseUrl?: string;
  label?: string;
  branchIds?: string[];
  /** create only: tables to link immediately */
  tables?: CredentialTableLink[];
}

export interface CredentialTableLink {
  billiardId: string;
  accountRef?: string;
}

interface Mpesa {
  stks: StkRequest[];
  startStk: (billiardId: string, input: { msisdn: string; games?: number; amount?: number; channel?: PushChannel }) => Promise<StkRequest>;
  refreshStk: (id: string) => void;
  /** Ask Safaricom for the final result (STK Query) when the callback is late. */
  queryStk: (id: string) => Promise<StkRequest | null>;
  /** Paybills/Tills of a company (tables derived from the billiards we can see) */
  credentialsOf: (companyId: string) => MpesaCredential[];
  credentialById: (id: string) => MpesaCredential | undefined;
  loadCredentials: (companyId: string) => Promise<void>;
  /** resolve to the credential id on success, null on failure (onError gets the message) */
  createCredential: (companyId: string, input: CredentialInput, onError?: (msg: string) => void) => Promise<string | null>;
  updateCredential: (credId: string, input: CredentialInput, onError?: (msg: string) => void) => Promise<string | null>;
  /** replace the set of tables paying to this shortcode (accountRef per table for a Paybill) */
  setCredentialTables: (credId: string, tables: CredentialTableLink[], onError?: (msg: string) => void, saved?: Partial<MpesaCredential>) => Promise<boolean>;
  deleteCredential: (credId: string) => Promise<boolean>;
  registerUrls: (credId: string) => Promise<boolean>;
  unmatched: UnmatchedPayment[];
  unmatchedOpen: number;
  loadUnmatched: () => void;
  assignUnmatched: (id: string, billiardId: string) => Promise<boolean>;
  devAvailable: boolean;
  simulateC2b: (input: { companyId?: string; shortcode?: string; billRef: string; amount: number; msisdn?: string; firstName?: string }) => Promise<string>;
  simulateStk: (input: { checkoutRequestId: string; resultCode?: number; receipt?: string }) => Promise<string>;
}

const Ctx = createContext<Mpesa>({} as Mpesa);
export const useMpesa = () => useContext(Ctx);

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const mask = (m: string) => {
  const d = m.replace(/\D/g, '');
  return d.length >= 9 ? `${d.slice(0, d.length - 9 + 3)}***${d.slice(-3)}` : m;
};
/** 07XXXXXXXX / 7XXXXXXXX / +2547XXXXXXXX -> 2547XXXXXXXX */
export function normaliseMsisdn(v: string): string | null {
  const d = v.replace(/\D/g, '');
  if (/^254[17]\d{8}$/.test(d)) return d;
  if (/^0[17]\d{8}$/.test(d)) return `254${d.slice(1)}`;
  if (/^[17]\d{8}$/.test(d)) return `254${d}`;
  return null;
}
/** Push channels that send a PIN prompt to the customer's phone. */
export type PushChannel = 'MPESA' | 'MTN_RW' | 'AIRTEL_RW';
export const PUSH_LABEL: Record<PushChannel, { name: string; pin: string; provider: string; country: string; placeholder: string; example: string }> = {
  MPESA: { name: 'M-Pesa', pin: 'M-Pesa PIN', provider: 'Safaricom', country: 'Kenyan', placeholder: '07XX XXX XXX', example: '0712 345 678' },
  MTN_RW: { name: 'MTN MoMo', pin: 'MoMo PIN', provider: 'MTN', country: 'MTN Rwanda (078/079)', placeholder: '078X XXX XXX', example: '0788 123 456' },
  AIRTEL_RW: { name: 'Airtel Money', pin: 'Airtel Money PIN', provider: 'Airtel', country: 'Airtel Rwanda (072/073)', placeholder: '073X XXX XXX', example: '0730 123 456' },
};
/** Normalises a phone for the channel: Kenya → 2547…, MTN RW → 25078/9…, Airtel RW → 25072/3…; null if invalid. */
export function normalisePushMsisdn(v: string, ch: PushChannel): string | null {
  if (ch === 'MPESA') return normaliseMsisdn(v);
  const d = v.replace(/\D/g, '');
  const n = /^2507\d{8}$/.test(d) ? d : /^07\d{8}$/.test(d) ? `250${d.slice(1)}` : /^7\d{8}$/.test(d) ? `250${d}` : null;
  if (!n) return null;
  const p = n.slice(3, 5);
  return (ch === 'MTN_RW' ? ['78', '79'] : ['72', '73']).includes(p) ? n : null;
}
const receiptCode = () => 'S' + Math.random().toString(36).slice(2, 11).toUpperCase().padEnd(9, 'X');

const normCred = (c: Partial<MpesaCredential> & { companyId: string }): MpesaCredential => ({
  id: c.id != null ? String(c.id) : '',
  label: c.label ?? (c.shortcode ? `${c.shortcodeType === 'TILL' ? 'Till' : 'Paybill'} ${c.shortcode}` : 'M-Pesa'),
  active: c.active ?? true,
  branchIds: Array.isArray(c.branchIds) ? c.branchIds.map(String) : [],
  tableCount: c.tableCount ?? 0,
  tables: Array.isArray(c.tables) ? c.tables.map((t) => ({ id: String(t.id), name: t.name })) : [],
  callbackBaseUrl: c.callbackBaseUrl ?? null,
  companyId: String(c.companyId),
  configured: !!c.configured,
  shortcode: c.shortcode ?? null,
  shortcodeType: c.shortcodeType ?? 'PAYBILL',
  environment: c.environment ?? 'SANDBOX',
  hasConsumerKey: !!c.hasConsumerKey,
  hasConsumerSecret: !!c.hasConsumerSecret,
  hasPasskey: !!c.hasPasskey,
  callbackUrls: c.callbackUrls ?? null,
  urlsRegisteredAt: c.urlsRegisteredAt ?? null,
  updatedAt: c.updatedAt ?? null,
});
const normStk = (s: StkRequest): StkRequest => ({ ...s, id: String(s.id), billiardId: String(s.billiardId), companyId: String(s.companyId), paymentId: s.paymentId != null ? String(s.paymentId) : null });
const normUn = (u: UnmatchedPayment): UnmatchedPayment => ({ ...u, id: String(u.id), companyId: String(u.companyId), assignedBilliardId: u.assignedBilliardId != null ? String(u.assignedBilliardId) : null });
const up = <T extends { id: string }>(list: T[], item: T) => (list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [item, ...list]);

const localUrls = (credId: string, host?: string | null) => {
  const base = (host || 'https://api.cuetrack.app').replace(/\/+$/, '');
  const tok = `tk_${credId}`;
  return {
    stk: `${base}/api/v1/cuetrack/mpesa/stk/callback/${tok}`,
    validation: `${base}/api/v1/cuetrack/mpesa/c2b/validation/${tok}`,
    confirmation: `${base}/api/v1/cuetrack/mpesa/c2b/confirmation/${tok}`,
  };
};

function seedLocal(now: number) {
  const creds: MpesaCredential[] = seedCreds.map((c) => ({ ...c, callbackUrls: localUrls(c.id), urlsRegisteredAt: now - 6 * 86_400_000 }));
  const un = (id: string, companyId: string, amount: number, billRef: string | null, reason: UnmatchedPayment['reason'], ago: number, name: string): UnmatchedPayment => ({
    id, companyId, transId: receiptCode(), amount, currency: 'KES', billRef, msisdn: '2547***' + String(100 + ago).slice(-3), payerName: name, shortcode: '522533', reason, status: 'UNMATCHED', assignedBilliardId: null, paymentId: null, resolvedBy: null, resolvedAt: null, receivedAt: now - ago * 60_000,
  });
  const unmatched = [
    un('u1', 'c1', 100, 'TABL7', 'UNKNOWN_REF', 14, 'JOHN'),
    un('u2', 'c1', 150, null, 'NO_REF', 52, 'MARY'),
    un('u3', 'c1', 20, 'DTC-T02', 'UNDERPAID', 130, 'PETER'),
    un('u4', 'c2', 200, 'POOL', 'UNKNOWN_REF', 240, 'ALICE'),
  ];
  return { creds, unmatched };
}

export function MpesaProvider({ children }: { children: ReactNode }) {
  const { ready, user, billiards, companies, companyFilter, onEvent, upsertPayment, creditOnlineLocal, patchBilliardsLocal, toast } = useStore();
  const [stks, setStks] = useState<StkRequest[]>([]);
  const [creds, setCreds] = useState<MpesaCredential[]>([]);
  const [unmatched, setUnmatched] = useState<UnmatchedPayment[]>([]);
  const [devAvailable, setDevAvailable] = useState(!API);
  const seq = useRef(5000);
  // local engine reads the latest snapshot inside timers
  const live = useRef({ billiards, creditOnlineLocal, toast });
  useEffect(() => {
    live.current = { billiards, creditOnlineLocal, toast };
  });

  // ---------- init ----------
  useEffect(() => {
    if (!ready || !user) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!API) {
      const s = seedLocal(Date.now());
      setCreds((c) => (c.length ? c : s.creds));
      setUnmatched((u) => (u.length ? u : s.unmatched));
      return;
    }
    /* eslint-enable react-hooks/set-state-in-effect */
    api.get<UnmatchedPayment[]>('/unmatched?status=UNMATCHED').then((l) => setUnmatched((Array.isArray(l) ? l : []).map(normUn))).catch(() => undefined);
    api.get<StkRequest[]>('/stk').then((l) => setStks((Array.isArray(l) ? l : []).map(normStk))).catch(() => undefined);
    // dev simulation endpoints only exist with the mock Daraja profile; anything but 404 means available
    api
      .post('/dev/simulate/stk', {})
      .then(() => setDevAvailable(true))
      .catch((e) => setDevAvailable(e instanceof ApiError && e.status !== 404 && e.status !== 403 && e.status !== 401));
  }, [ready, user]);

  // ---------- realtime ----------
  useEffect(
    () =>
      onEvent((e) => {
        if (e.type === 'STK_UPDATED') {
          const s = normStk(e.payload as StkRequest);
          setStks((x) => up(x, s));
        } else if (e.type === 'UNMATCHED_PAYMENT' || e.type === 'UNMATCHED_UPDATED') {
          const u = normUn(e.payload as UnmatchedPayment);
          setUnmatched((x) => up(x, u));
          if (e.type === 'UNMATCHED_PAYMENT') live.current.toast({ tone: 'info', title: 'Unmatched M-Pesa payment', detail: `${u.currency} ${u.amount} · ref "${u.billRef ?? '—'}"` });
        }
      }),
    [onEvent],
  );

  // ---------- local engine ----------
  const completeLocal = useCallback((checkoutRequestId: string, resultCode: number, receipt?: string) => {
    let outcome = 'not found';
    setStks((list) =>
      list.map((s) => {
        if (s.checkoutRequestId !== checkoutRequestId || s.status !== 'PENDING') return s;
        const now = Date.now();
        if (resultCode === 0) {
          const r = receipt || receiptCode();
          const p = live.current.creditOnlineLocal({ billiardId: s.billiardId, amount: s.amount, msisdn: s.msisdn, receipt: r });
          outcome = p ? `completed · ${r}` : 'completed but unpriced';
          const b = live.current.billiards.find((x) => x.id === s.billiardId);
          live.current.toast({ tone: 'success', title: `${PUSH_LABEL[(s.channel as PushChannel) ?? 'MPESA']?.name ?? 'Mobile money'} payment received`, detail: `${r} · ${s.games} game${s.games === 1 ? '' : 's'} on ${b?.name ?? s.billiardId}` });
          return { ...s, status: 'COMPLETED', resultCode: 0, resultDesc: 'The service request is processed successfully.', receipt: r, paymentId: p?.id ?? null, completedAt: now };
        }
        const cancelled = resultCode === 1032;
        outcome = cancelled ? 'cancelled' : 'failed';
        return { ...s, status: cancelled ? 'CANCELLED' : 'FAILED', resultCode, resultDesc: cancelled ? 'Request cancelled by user' : resultCode === 1 ? 'The balance is insufficient for the transaction' : 'DS timeout user cannot be reached', completedAt: now };
      }),
    );
    return outcome;
  }, []);

  // ---------- STK ----------
  const startStk = useCallback(
    async (billiardId: string, input: { msisdn: string; games?: number; amount?: number; channel?: PushChannel }) => {
      if (API) {
        const s = normStk(await api.post<StkRequest>(`/billiards/${billiardId}/stk`, input));
        setStks((x) => up(x, s));
        return s;
      }
      const b = live.current.billiards.find((x) => x.id === billiardId);
      if (!b) throw new Error('Billiard not found');
      const ch: PushChannel = input.channel ?? 'MPESA';
      if (!b.channels.includes(ch)) throw new Error(`${PUSH_LABEL[ch].name} is not enabled on this table`);
      if (ch === 'MPESA' && !b.mpesaCredentialId) throw new Error('No Paybill/Till linked to this table');
      if (b.status === 'OFFLINE') throw new Error(`${b.name} is offline`);
      const games = input.games ?? Math.max(1, Math.floor((input.amount ?? 0) / b.tokenPrice));
      const amount = input.amount ?? games * b.tokenPrice;
      const s: StkRequest = {
        id: `stk${++seq.current}`, billiardId, companyId: b.companyId, msisdn: mask(input.msisdn), amount, games, currency: b.currency,
        checkoutRequestId: `ws_CO_${Date.now()}${seq.current}`, status: 'PENDING', resultCode: null, resultDesc: null, receipt: null, paymentId: null,
        initiatedBy: user?.name ?? '—', createdAt: Date.now(), completedAt: null, channel: ch,
      };
      setStks((x) => [s, ...x]);
      // demo outcome by last digit: 1 = insufficient funds, 2 = cancelled, 3 = stays pending (use simulator), else success
      const last = input.msisdn.slice(-1);
      if (last !== '3') setTimeout(() => completeLocal(s.checkoutRequestId, last === '1' ? 1 : last === '2' ? 1032 : 0), 4500);
      return s;
    },
    [user, completeLocal],
  );

  const refreshStk = useCallback((id: string) => {
    if (!API) return;
    api.get<StkRequest>(`/stk/${id}`).then((s) => setStks((x) => up(x, normStk(s)))).catch(() => undefined);
  }, []);
  const queryStk = useCallback(async (id: string) => {
    if (!API) return null;
    const s = normStk(await api.post<StkRequest>(`/stk/${id}/query`, {}));
    setStks((x) => up(x, s));
    return s;
  }, []);

  // ---------- credentials (Paybills / Tills) ----------
  const putCred = useCallback((c: MpesaCredential) => setCreds((list) => (list.some((x) => x.id === c.id) ? list.map((x) => (x.id === c.id ? c : x)) : [...list, c])), []);
  // keep local billiards' denormalised shortcode fields in sync
  const relinkLocal = useCallback(
    (c: MpesaCredential | null, id: string) =>
      patchBilliardsLocal((b) =>
        b.mpesaCredentialId !== id ? b : c ? { ...b, mpesaShortcode: c.shortcode, mpesaShortcodeType: c.shortcodeType, mpesaLabel: c.label } : { ...b, mpesaCredentialId: null, mpesaShortcode: null, mpesaShortcodeType: null, mpesaLabel: null },
      ),
    [patchBilliardsLocal],
  );
  const withTables = useMemo(
    () =>
      creds.map((c) => {
        const mine = billiards.filter((b) => b.mpesaCredentialId === c.id).map((b) => ({ id: b.id, name: b.name }));
        // API: server list is authoritative when we can't see every table (Company Admin)
        const tables = API && c.tables.length > mine.length ? c.tables : mine;
        return { ...c, tables, tableCount: API ? Math.max(c.tableCount, tables.length) : tables.length };
      }),
    [creds, billiards],
  );
  const credentialsOf = useCallback((companyId: string) => withTables.filter((c) => c.companyId === companyId), [withTables]);
  const credentialById = useCallback((id: string) => withTables.find((c) => c.id === id), [withTables]);

  const loadCredentials = useCallback(async (companyId: string) => {
    if (!API) return;
    try {
      const list = await api.get<MpesaCredential[]>(`/companies/${companyId}/mpesa/credentials`);
      const next = (Array.isArray(list) ? list : []).map((c) => normCred({ ...c, companyId }));
      setCreds((all) => [...all.filter((c) => c.companyId !== companyId), ...next]);
    } catch {
      /* no access / none configured */
    }
  }, []);
  // load for every company the user can manage
  useEffect(() => {
    if (!API || !ready || !user) return;
    const ids = user.role === 'SUPER_ADMIN' ? companies.map((c) => c.id) : user.companyId ? [user.companyId] : [];
    ids.forEach((id) => loadCredentials(id));
  }, [ready, user, companies, loadCredentials]);

  const bodyOf = (input: CredentialInput) => {
    // blank secrets are omitted so the stored value is kept
    const body: Record<string, unknown> = { shortcode: input.shortcode.trim() };
    if (input.label !== undefined) body.label = input.label.trim();
    if (input.shortcodeType) body.shortcodeType = input.shortcodeType;
    if (input.environment) body.environment = input.environment;
    if (input.branchIds) body.branchIds = input.branchIds;
    if (input.tables) body.tables = input.tables.map((t) => ({ billiardId: t.billiardId, accountRef: input.shortcodeType === 'TILL' ? undefined : t.accountRef?.trim() }));
    for (const k of ['consumerKey', 'consumerSecret', 'passkey'] as const) if (input[k]?.trim()) body[k] = input[k]!.trim();
    // always sent: blank clears the override (platform default host)
    if (input.callbackBaseUrl !== undefined) body.callbackBaseUrl = input.callbackBaseUrl.trim();
    return body;
  };

  const createCredential = useCallback(
    async (companyId: string, input: CredentialInput, onError?: (msg: string) => void) => {
      const body = bodyOf(input);
      try {
        let newId: string;
        if (API) {
          const c = normCred({ ...(await api.post<MpesaCredential>(`/companies/${companyId}/mpesa/credentials`, body)), companyId });
          putCred(c);
          newId = c.id;
        } else {
          if (creds.some((c) => c.shortcode === body.shortcode && c.environment === (input.environment ?? 'SANDBOX'))) throw new Error(`Shortcode ${body.shortcode} is already registered`);
          const id = `mp${++seq.current}`;
          newId = id;
          const ok = !!body.consumerKey && !!body.consumerSecret && !!body.passkey;
          putCred(
            normCred({
              id, companyId, label: input.label || undefined, shortcode: String(body.shortcode), shortcodeType: input.shortcodeType ?? 'PAYBILL', environment: input.environment ?? 'SANDBOX',
              branchIds: input.branchIds ?? [], hasConsumerKey: !!body.consumerKey, hasConsumerSecret: !!body.consumerSecret, hasPasskey: !!body.passkey, configured: ok,
              callbackBaseUrl: (body.callbackBaseUrl as string) || null, callbackUrls: localUrls(id, body.callbackBaseUrl as string), updatedAt: Date.now(),
            }),
          );
          const links = new Map((input.tables ?? []).map((t) => [t.billiardId, t]));
          if (input.shortcodeType === 'TILL' && links.size > 1) throw new Error('A Till can serve only one table');
          if (links.size)
            patchBilliardsLocal((b) => {
              const l = links.get(b.id);
              if (!l) return b;
              return {
                ...b, mpesaCredentialId: id, mpesaShortcode: String(body.shortcode), mpesaShortcodeType: input.shortcodeType ?? 'PAYBILL', mpesaLabel: input.label || null,
                accountRef: input.shortcodeType === 'TILL' ? b.accountRef : l.accountRef?.trim() || b.accountRef, channels: b.channels.includes('MPESA') ? b.channels : [...b.channels, 'MPESA'],
              };
            });
        }
        toast({ tone: 'success', title: `${input.shortcodeType === 'TILL' ? 'Till' : 'Paybill'} ${input.shortcode} added` });
        return newId;
      } catch (e) {
        onError?.(errMsg(e));
        toast({ tone: 'danger', title: 'Could not add shortcode', detail: errMsg(e) });
        return null;
      }
    },
    [creds, putCred, patchBilliardsLocal, toast],
  );
  const updateCredential = useCallback(
    async (credId: string, input: CredentialInput, onError?: (msg: string) => void) => {
      const body = bodyOf(input);
      const prev = creds.find((c) => c.id === credId);
      try {
        if (API) {
          putCred(normCred({ ...(await api.put<MpesaCredential>(`/mpesa/credentials/${credId}`, body)), companyId: prev?.companyId ?? '' }));
        } else {
          if (!prev) return null;
          // can't drop a branch whose tables still use this shortcode
          if (input.branchIds) {
            const blocked = live.current.billiards.filter((b) => b.mpesaCredentialId === credId && !input.branchIds!.includes(b.branchId));
            if (blocked.length) throw new Error(`${blocked.map((b) => b.name).join(', ')} still use${blocked.length === 1 ? 's' : ''} it in a removed branch`);
          }
          if ((input.shortcodeType ?? prev.shortcodeType) === 'TILL' && live.current.billiards.filter((b) => b.mpesaCredentialId === credId).length > 1) throw new Error('A Till can serve only one table');
          const hasConsumerKey = prev.hasConsumerKey || !!body.consumerKey;
          const hasConsumerSecret = prev.hasConsumerSecret || !!body.consumerSecret;
          const hasPasskey = prev.hasPasskey || !!body.passkey;
          const next: MpesaCredential = {
            ...prev, label: input.label?.trim() || prev.label, shortcode: String(body.shortcode), shortcodeType: input.shortcodeType ?? prev.shortcodeType, environment: input.environment ?? prev.environment,
            branchIds: input.branchIds ?? prev.branchIds, hasConsumerKey, hasConsumerSecret, hasPasskey, configured: !!body.shortcode && hasConsumerKey && hasConsumerSecret && hasPasskey,
            callbackBaseUrl: (body.callbackBaseUrl as string) || null, callbackUrls: localUrls(credId, body.callbackBaseUrl as string), updatedAt: Date.now(),
          };
          putCred(next);
          relinkLocal(next, credId);
        }
        toast({ tone: 'success', title: 'Shortcode saved', detail: input.label || input.shortcode });
        return credId;
      } catch (e) {
        onError?.(errMsg(e));
        toast({ tone: 'danger', title: 'Could not save shortcode', detail: errMsg(e) });
        return null;
      }
    },
    [creds, putCred, relinkLocal, toast],
  );
  const setCredentialTables = useCallback(
    async (credId: string, links: CredentialTableLink[], onError?: (msg: string) => void, saved?: Partial<MpesaCredential>) => {
      try {
        const c0 = creds.find((x) => x.id === credId);
        if (!c0) throw new Error('Shortcode not found');
        const c: MpesaCredential = { ...c0, ...saved };
        const isTill = c.shortcodeType === 'TILL';
        const clean = links.map((l) => ({ billiardId: l.billiardId, accountRef: isTill ? undefined : (l.accountRef ?? '').trim() }));
        // mirror backend rules
        if (isTill && clean.length > 1) throw new Error('A Till can serve only one table');
        const all = live.current.billiards;
        const seen = new Set<string>();
        for (const l of clean) {
          const b = all.find((x) => x.id === l.billiardId);
          if (!b || b.companyId !== c.companyId) throw new Error('Table not found for this company');
          if (!c.branchIds.includes(b.branchId)) throw new Error(`${b.name} is not in a branch served by this shortcode`);
          if (!isTill) {
            if (!l.accountRef) throw new Error(`Account number required for ${b.name}`);
            const k = l.accountRef.toLowerCase();
            if (seen.has(k)) throw new Error(`Account number ${l.accountRef} is used twice`);
            seen.add(k);
          }
        }
        if (API) {
          const res = await api.put<MpesaCredential>(`/mpesa/credentials/${credId}/tables`, { tables: clean });
          if (res && typeof res === 'object' && 'id' in res) putCred(normCred({ ...res, companyId: c.companyId }));
        }
        const byId = new Map(clean.map((l) => [l.billiardId, l]));
        patchBilliardsLocal((b) => {
          const l = byId.get(b.id);
          if (l) {
            return {
              ...b, mpesaCredentialId: c.id, mpesaShortcode: c.shortcode, mpesaShortcodeType: c.shortcodeType, mpesaLabel: c.label,
              accountRef: l.accountRef ?? b.accountRef, channels: b.channels.includes('MPESA') ? b.channels : [...b.channels, 'MPESA'],
            };
          }
          if (b.mpesaCredentialId === c.id) {
            return { ...b, mpesaCredentialId: null, mpesaShortcode: null, mpesaShortcodeType: null, mpesaLabel: null, channels: b.channels.filter((x) => x !== 'MPESA') };
          }
          return b;
        });
        toast({ tone: 'success', title: 'Tables linked', detail: `${c.label || c.shortcode}: ${clean.length} table${clean.length === 1 ? '' : 's'}` });
        return true;
      } catch (e) {
        onError?.(errMsg(e));
        toast({ tone: 'danger', title: 'Tables not linked', detail: errMsg(e) });
        return false;
      }
    },
    [creds, putCred, patchBilliardsLocal, toast],
  );
  const deleteCredential = useCallback(
    async (credId: string) => {
      try {
        const used = live.current.billiards.filter((b) => b.mpesaCredentialId === credId).length;
        if (!API && used) throw new Error(`Still used by ${used} table${used === 1 ? '' : 's'}`);
        if (API) await api.del(`/mpesa/credentials/${credId}`);
        setCreds((list) => list.filter((c) => c.id !== credId));
        if (!API) relinkLocal(null, credId);
        toast({ tone: 'info', title: 'Shortcode removed' });
        return true;
      } catch (e) {
        toast({ tone: 'danger', title: 'Could not remove shortcode', detail: errMsg(e) });
        return false;
      }
    },
    [relinkLocal, toast],
  );
  const registerUrls = useCallback(
    async (credId: string) => {
      try {
        const prev = creds.find((c) => c.id === credId);
        if (API) putCred(normCred({ ...(await api.post<MpesaCredential>(`/mpesa/credentials/${credId}/register-urls`)), companyId: prev?.companyId ?? '' }));
        else if (prev) putCred({ ...prev, callbackUrls: localUrls(credId, prev.callbackBaseUrl), urlsRegisteredAt: Date.now() });
        toast({ tone: 'success', title: 'Callback URLs registered with Safaricom', detail: prev ? `${prev.label} · ${prev.shortcode}` : undefined });
        return true;
      } catch (e) {
        toast({ tone: 'danger', title: 'URL registration failed', detail: errMsg(e) });
        return false;
      }
    },
    [creds, putCred, toast],
  );

  // ---------- unmatched ----------
  const loadUnmatched = useCallback(() => {
    if (!API) return;
    Promise.all([api.get<UnmatchedPayment[]>('/unmatched?status=UNMATCHED'), api.get<UnmatchedPayment[]>('/unmatched?status=ASSIGNED').catch(() => [])])
      .then(([a, b]) => setUnmatched([...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])].map(normUn)))
      .catch(() => undefined);
  }, []);
  const assignUnmatched = useCallback(
    async (id: string, billiardId: string) => {
      try {
        const b = live.current.billiards.find((x) => x.id === billiardId);
        if (API) {
          const p = upsertPayment(await api.post(`/unmatched/${id}/assign`, { billiardId }));
          setUnmatched((x) => x.map((u) => (u.id === id ? { ...u, status: 'ASSIGNED', assignedBilliardId: billiardId, paymentId: p.id, resolvedBy: user?.name ?? null, resolvedAt: Date.now() } : u)));
        } else {
          const u = unmatched.find((x) => x.id === id);
          if (!u) return false;
          const p = live.current.creditOnlineLocal({ billiardId, amount: u.amount, msisdn: u.msisdn, receipt: u.transId, receivedBy: user?.name });
          if (!p) throw new Error(`Amount is below one game on ${b?.name ?? 'this table'}`);
          setUnmatched((x) => x.map((v) => (v.id === id ? { ...v, status: 'ASSIGNED', assignedBilliardId: billiardId, paymentId: p.id, resolvedBy: user?.name ?? null, resolvedAt: Date.now() } : v)));
        }
        toast({ tone: 'success', title: 'Payment assigned', detail: `Credited to ${b?.name ?? billiardId}` });
        return true;
      } catch (e) {
        toast({ tone: 'danger', title: 'Could not assign payment', detail: errMsg(e) });
        return false;
      }
    },
    [unmatched, upsertPayment, user, toast],
  );

  // ---------- dev simulation ----------
  const simulateC2b = useCallback(
    async (input: { companyId?: string; shortcode?: string; billRef: string; amount: number; msisdn?: string; firstName?: string }) => {
      if (API) {
        const r = await api.post<{ outcome: string }>('/dev/simulate/c2b', input);
        return r?.outcome ?? 'sent';
      }
      const ref = input.billRef.trim().toUpperCase();
      const sc = input.shortcode ? creds.find((c) => c.shortcode === input.shortcode) : undefined;
      const pool = live.current.billiards.filter((x) => (!input.companyId || x.companyId === input.companyId) && (!sc || x.mpesaCredentialId === sc.id));
      // a Till serves exactly one table: no account number needed
      const b = sc?.shortcodeType === 'TILL' ? pool[0] : pool.find((x) => x.accountRef?.toUpperCase() === ref);
      const transId = receiptCode();
      const companyId = b?.companyId ?? input.companyId ?? live.current.billiards[0]?.companyId ?? 'c1';
      if (b && b.channels.includes('MPESA') && input.amount >= b.tokenPrice) {
        live.current.creditOnlineLocal({ billiardId: b.id, amount: input.amount, msisdn: input.msisdn ? mask(input.msisdn) : null, receipt: transId });
        live.current.toast({ tone: 'success', title: 'M-Pesa C2B matched', detail: `${transId} → ${b.name}` });
        return `matched → ${b.name}`;
      }
      const reason: UnmatchedPayment['reason'] = !ref ? 'NO_REF' : b ? 'UNDERPAID' : 'UNKNOWN_REF';
      const u: UnmatchedPayment = {
        id: `u${++seq.current}`, companyId, transId, amount: input.amount, currency: b?.currency ?? 'KES', billRef: ref || null, msisdn: input.msisdn ? mask(input.msisdn) : null,
        payerName: input.firstName?.toUpperCase() ?? null, shortcode: sc?.shortcode ?? input.shortcode ?? null, reason, status: 'UNMATCHED', assignedBilliardId: null, paymentId: null, resolvedBy: null, resolvedAt: null, receivedAt: Date.now(),
      };
      setUnmatched((x) => [u, ...x]);
      live.current.toast({ tone: 'info', title: 'Unmatched M-Pesa payment', detail: `${u.currency} ${u.amount} · ${reason.replace('_', ' ').toLowerCase()}` });
      return `unmatched · ${reason}`;
    },
    [creds],
  );
  const simulateStk = useCallback(
    async (input: { checkoutRequestId: string; resultCode?: number; receipt?: string }) => {
      if (API) {
        const r = await api.post<{ outcome: string }>('/dev/simulate/stk', input);
        return r?.outcome ?? 'sent';
      }
      return completeLocal(input.checkoutRequestId, input.resultCode ?? 0, input.receipt);
    },
    [completeLocal],
  );

  // ---------- scoping ----------
  const scopedUnmatched = useMemo(() => {
    if (!user) return [];
    if (user.role === 'SUPER_ADMIN') return companyFilter === 'ALL' ? unmatched : unmatched.filter((u) => u.companyId === companyFilter);
    return unmatched.filter((u) => u.companyId === user.companyId);
  }, [unmatched, user, companyFilter]);
  const unmatchedOpen = scopedUnmatched.filter((u) => u.status === 'UNMATCHED').length;

  const value: Mpesa = {
    stks, startStk, refreshStk, queryStk, credentialsOf, credentialById, loadCredentials, createCredential, updateCredential, setCredentialTables, deleteCredential, registerUrls,
    unmatched: scopedUnmatched, unmatchedOpen, loadUnmatched, assignUnmatched, devAvailable, simulateC2b, simulateStk,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
