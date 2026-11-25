'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';

/* ---------- types ---------- */
type TableStatus = 'AVAILABLE' | 'IN_GAME' | 'LOCKED' | 'OFFLINE';
interface TableInfo {
  ref: string;
  tableName: string;
  venueName: string;
  currency: string;
  pricePerGame: number;
  status: TableStatus;
  lockReason: string | null;
  gameStartedAt: number | null;
  maxGames: number;
  country?: string;
  channels?: string[];
}
interface Session {
  payment: 'PENDING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  paymentMessage: string | null;
  receipt: string | null;
  amount: number;
  currency: string;
  games: number;
  gamesPaid: number;
  gamesReleased: number;
  gamesLeft: number;
  msisdnMasked: string | null;
  createdAt: number;
  paidAt: number | null;
  table: TableInfo;
  currentGame: { id: string | number; startedAt: number | null; mine: boolean } | null;
}
class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/* ---------- helpers ---------- */
const TOKEN_TTL = 12 * 3600 * 1000;
const PIN_WAIT = 60;
const PHONE_KEY = 'ct-last-phone';
const tokenKey = (ref: string) => `ct-play-${ref}`;

function loadToken(ref: string): string | null {
  try {
    const raw = localStorage.getItem(tokenKey(ref));
    if (!raw) return null;
    const { token, exp } = JSON.parse(raw) as { token: string; exp: number };
    if (!token || Date.now() > exp) { localStorage.removeItem(tokenKey(ref)); return null; }
    return token;
  } catch { return null; }
}
function saveToken(ref: string, token: string) {
  try { localStorage.setItem(tokenKey(ref), JSON.stringify({ token, exp: Date.now() + TOKEN_TTL })); } catch {}
}
function dropToken(ref: string) {
  try { localStorage.removeItem(tokenKey(ref)); } catch {}
}

async function api<T>(path: string, opts: { method?: string; body?: unknown; token?: string | null } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.token) headers['X-Play-Token'] = opts.token;
  let res: Response;
  try {
    res = await fetch(`/papi${path}`, {
      method: opts.method ?? 'GET', headers, cache: 'no-store',
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Network problem — check your connection.');
  }
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch {}
  if (!res.ok) {
    const msg = (data as { message?: string } | null)?.message
      || (res.status === 429 ? 'Too many attempts — please wait a moment.' : 'Something went wrong. Please try again.');
    throw new ApiError(res.status, msg);
  }
  return data as T;
}

const money = (n: number, cur: string) => `${cur} ${Math.round(n).toLocaleString('en-US')}`;
const digits = (s: string) => s.replace(/\D/g, '');

/* ---------- country (Kenya: M-Pesa / KES, Rwanda: MTN MoMo + Airtel Money / RWF) ---------- */
type Country = 'KE' | 'RW';
const COUNTRY: Record<Country, { code: string; flag: string; example: string; placeholder: string; valid: RegExp }> = {
  KE: { code: '254', flag: '🇰🇪', example: '0712 345 678', placeholder: '07XX XXX XXX', valid: /^0[17]\d{8}$/ },
  RW: { code: '250', flag: '🇷🇼', example: '0788 123 456', placeholder: '07XX XXX XXX', valid: /^07[2389]\d{7}$/ },
};
const asCountry = (c?: string | null): Country => (c === 'RW' ? 'RW' : 'KE');
function formatPhone(raw: string): string {
  let d = digits(raw);
  if (d.startsWith('254') || d.startsWith('250')) d = '0' + d.slice(3);
  else if (d.length === 9 && d.startsWith('7')) d = '0' + d;
  d = d.slice(0, 10);
  return [d.slice(0, 4), d.slice(4, 7), d.slice(7, 10)].filter(Boolean).join(' ');
}
const phoneValid = (f: string, c: Country) => COUNTRY[c].valid.test(digits(f));
const toMsisdn = (f: string, c: Country) => COUNTRY[c].code + digits(f).slice(1);
/** Rwanda: 078/079 = MTN MoMo, 072/073 = Airtel Money. */
function rwProvider(f: string): 'MTN_RW' | 'AIRTEL_RW' | null {
  const d = digits(f);
  if (/^07[89]/.test(d)) return 'MTN_RW';
  if (/^07[23]/.test(d)) return 'AIRTEL_RW';
  return null;
}
const PROVIDER_LABEL = { MTN_RW: 'MTN MoMo', AIRTEL_RW: 'Airtel Money' } as const;
function fmtDuration(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(sec)}` : `${p(m)}:${p(sec)}`;
}
const fmtTime = (ms: number | null) => (ms ? new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');

function useNow(active: boolean, every = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(id);
  }, [active, every]);
  return now;
}

function useCountUp(target: number) {
  const [val, setVal] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    if (a === target) return;
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / 450);
      const e = 1 - Math.pow(1 - k, 3);
      const v = a + (target - a) * e;
      setVal(v);
      from.current = v;
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return val;
}

/* ---------- small components ---------- */
function Confetti() {
  const pieces = useMemo(() => {
    const colors = ['#d4a24c', '#3bb54a', '#f1efe7', '#e5665a', '#4aa3df'];
    return Array.from({ length: 70 }, (_, i) => ({
      left: Math.random() * 100,
      delay: Math.random() * 0.6,
      dur: 2.2 + Math.random() * 1.6,
      color: colors[i % colors.length],
      rot: Math.random() * 360,
    }));
  }, []);
  return (
    <div className="confetti" aria-hidden>
      {pieces.map((p, i) => (
        <i key={i} style={{ left: `${p.left}%`, background: p.color, animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s`, transform: `rotate(${p.rot}deg)` }} />
      ))}
    </div>
  );
}

function HoldButton({ id, label, onConfirm, disabled }: { id: string; label: string; onConfirm: () => void; disabled?: boolean }) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = () => {
    if (disabled) return;
    setHolding(true);
    timer.current = setTimeout(() => { setHolding(false); onConfirm(); }, 1200);
  };
  const cancel = () => {
    setHolding(false);
    if (timer.current) clearTimeout(timer.current);
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return (
    <button
      id={id}
      className={`btn hold ${holding ? 'holding' : ''}`}
      disabled={disabled}
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) start(); }}
      onKeyUp={cancel}
    >
      <div className="hold-fill" />
      <span>{holding ? 'Keep holding…' : label}</span>
    </button>
  );
}

function StatusPill({ status }: { status: TableStatus }) {
  const map: Record<TableStatus, [string, string]> = {
    AVAILABLE: ['ok', 'Available'],
    IN_GAME: ['', 'In game'],
    LOCKED: ['bad', 'Locked'],
    OFFLINE: ['bad', 'Offline'],
  };
  const [cls, txt] = map[status];
  return <span className={`pill ${cls}`}><span className="dot" />{txt}</span>;
}

/* ---------- page ---------- */
export default function PlayPage() {
  const params = useParams<{ ref: string }>();
  const ref = decodeURIComponent(params?.ref ?? '');

  const [table, setTable] = useState<TableInfo | null>(null);
  const [tableErr, setTableErr] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const [games, setGames] = useState(1);
  const [bump, setBump] = useState(0);
  const [quote, setQuote] = useState<number | null>(null);
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [step, setStep] = useState<'games' | 'phone'>('games');
  const [doneSummary, setDoneSummary] = useState<Session | null>(null);

  /* restore token + phone */
  useEffect(() => {
    if (!ref) return;
    setToken(loadToken(ref));
    try { const p = localStorage.getItem(PHONE_KEY); if (p) setPhone(formatPhone(p)); } catch {}
    setHydrated(true);
  }, [ref]);

  const handleErr = useCallback((e: unknown) => {
    if (e instanceof ApiError) {
      if (e.status === 401) { dropToken(ref); setToken(null); setSession(null); }
      setErr(e.message);
    } else setErr('Something went wrong. Please try again.');
  }, [ref]);

  /* table fetch */
  const loadTable = useCallback(async () => {
    try { setTable(await api<TableInfo>(`/tables/${encodeURIComponent(ref)}`)); setTableErr(null); }
    catch (e) { if (e instanceof ApiError && e.status === 404) setTableErr('We could not find this table. Please re-scan the QR code.'); else if (!table) setTableErr(e instanceof Error ? e.message : 'Error'); }
  }, [ref, table]);

  /* session fetch */
  const loadSession = useCallback(async () => {
    if (!token) return;
    try {
      const s = await api<Session>(`/tables/${encodeURIComponent(ref)}/session`, { token });
      setSession(s);
      setTable(s.table);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) { dropToken(ref); setToken(null); setSession(null); }
    }
  }, [ref, token]);

  useEffect(() => { if (ref && hydrated) { loadTable(); } }, [ref, hydrated]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (token) loadSession(); }, [token, loadSession]);

  /* screen derivation */
  type Screen = 'loading' | 'welcome' | 'waiting' | 'failed' | 'paid' | 'playing' | 'done';
  const screen: Screen = useMemo(() => {
    if (doneSummary) return 'done';
    if (!hydrated || (!table && !tableErr)) return 'loading';
    if (!token) return 'welcome';
    if (!session) return 'loading';
    if (session.payment === 'PENDING') return 'waiting';
    if (session.payment === 'FAILED' || session.payment === 'CANCELLED') return 'failed';
    if (session.currentGame?.mine) return 'playing';
    if (session.gamesLeft > 0) return 'paid';
    return 'done';
  }, [doneSummary, hydrated, table, tableErr, token, session]);

  /* polling */
  useEffect(() => {
    let ms = 0;
    let fn: (() => void) | null = null;
    if (screen === 'welcome') { ms = 5000; fn = loadTable; }
    else if (screen === 'waiting') { ms = 2000; fn = loadSession; }
    else if (screen === 'playing' || screen === 'paid') { ms = 3000; fn = loadSession; }
    if (!fn) return;
    const id = setInterval(fn, ms);
    return () => clearInterval(id);
  }, [screen, loadTable, loadSession]);

  /* quote (debounced) */
  const maxGames = Math.max(1, table?.maxGames ?? 1);
  const country = asCountry(table?.country ?? session?.table?.country);
  const cc = COUNTRY[country];
  const rwChannels = (table?.channels ?? []).filter((c): c is 'MTN_RW' | 'AIRTEL_RW' => c === 'MTN_RW' || c === 'AIRTEL_RW');
  const provider = country === 'RW' ? rwProvider(phone) : null;
  /** Wallet name shown to the customer. */
  const wallet = country === 'KE' ? 'M-Pesa'
    : provider ? PROVIDER_LABEL[provider]
    : rwChannels.length === 1 ? PROVIDER_LABEL[rwChannels[0]] : 'Mobile Money';
  const walletHint = country === 'KE' ? 'M-Pesa'
    : (rwChannels.length ? rwChannels : (['MTN_RW', 'AIRTEL_RW'] as const)).map((c) => PROVIDER_LABEL[c]).join(' or ');
  const providerOff = country === 'RW' && provider != null && rwChannels.length > 0 && !rwChannels.includes(provider);
  useEffect(() => {
    if (!table || screen !== 'welcome') return;
    setQuote(null);
    const id = setTimeout(async () => {
      try {
        const q = await api<{ amount: number }>(`/tables/${encodeURIComponent(ref)}/quote`, { method: 'POST', body: { games } });
        setQuote(q.amount);
      } catch { setQuote(games * table.pricePerGame); }
    }, 300);
    return () => clearTimeout(id);
  }, [games, ref, table?.pricePerGame, screen]); // eslint-disable-line react-hooks/exhaustive-deps

  const shownAmount = useCountUp(quote ?? games * (table?.pricePerGame ?? 0));
  const setG = (n: number) => { const v = Math.min(maxGames, Math.max(1, n)); if (v !== games) { setGames(v); setBump((b) => b + 1); } };

  /* actions */
  const pay = async () => {
    if (!phoneValid(phone, country)) {
      setErr(country === 'RW' ? `Enter a valid ${walletHint} number, e.g. ${cc.example}.` : `Enter a valid Safaricom number, e.g. ${cc.example}.`);
      return;
    }
    if (providerOff && provider) { setErr(`${PROVIDER_LABEL[provider]} isn’t accepted at this table. Use ${walletHint}.`); return; }
    setBusy(true); setErr(null);
    try {
      const r = await api<{ token: string; session: Session }>(`/tables/${encodeURIComponent(ref)}/pay`, { method: 'POST', body: { games, msisdn: toMsisdn(phone, country) } });
      try { localStorage.setItem(PHONE_KEY, digits(phone)); } catch {}
      saveToken(ref, r.token);
      setSession(r.session);
      setToken(r.token);
    } catch (e) { handleErr(e); }
    finally { setBusy(false); }
  };

  const action = async (path: 'release' | 'end') => {
    if (!token) return;
    setBusy(true); setErr(null);
    try {
      const s = await api<Session>(`/tables/${encodeURIComponent(ref)}/${path}`, { method: 'POST', token });
      setSession(s); setTable(s.table);
    } catch (e) { handleErr(e); }
    finally { setBusy(false); }
  };

  const startOver = () => {
    if (session) setDoneSummary(null);
    dropToken(ref); setToken(null); setSession(null); setErr(null); setStep('games'); setGames(1);
    loadTable();
  };

  const retryPay = () => {
    const g = session?.games ?? games;
    dropToken(ref); setToken(null); setSession(null); setErr(null); setGames(Math.min(g, maxGames)); setStep('phone');
  };

  /* timers */
  const now = useNow(screen === 'waiting' || screen === 'playing' || (screen === 'welcome' && table?.status === 'IN_GAME') || screen === 'paid');
  const cur = table?.currency ?? session?.currency ?? (country === 'RW' ? 'RWF' : 'KES');

  /* ---------- render ---------- */
  let body: React.ReactNode = null;
  let cta: React.ReactNode = null;

  const header = table && (
    <header className="card glass hero fade-in">
      <div>
        <div className="label">{table.venueName}</div>
        <h1>{table.tableName}</h1>
        <div className="venue num">{money(table.pricePerGame, cur)} per game</div>
      </div>
      <StatusPill status={table.status} />
    </header>
  );

  if (tableErr && !table) {
    body = (
      <section className="card glass center fade-in">
        <div className="check icon-bad">!</div>
        <h2>Table not found</h2>
        <p className="muted">{tableErr}</p>
      </section>
    );
    cta = <button id="retry-table" className="btn btn-ghost" onClick={loadTable}>Try again</button>;
  } else if (screen === 'loading') {
    body = <section className="card glass center"><div className="spinner" /><p className="muted">Loading table…</p></section>;
  } else if (screen === 'welcome' && table) {
    if (table.status === 'IN_GAME') {
      body = (
        <section className="card glass center fade-in">
          <div className="label">Table busy</div>
          <div className="timer num">{table.gameStartedAt ? fmtDuration(Math.max(0, now - table.gameStartedAt)) : '—'}</div>
          <p className="muted">A game is in progress. This page refreshes automatically — you can pay as soon as the table is free.</p>
        </section>
      );
    } else if (table.status === 'LOCKED') {
      body = (
        <section className="card glass center fade-in">
          <div className="check icon-warn">🔒</div>
          <h2>Table locked</h2>
          <p className="muted">{table.lockReason || 'This table is temporarily unavailable.'} Please ask staff for help.</p>
        </section>
      );
    } else if (table.status === 'OFFLINE') {
      body = (
        <section className="card glass center fade-in">
          <div className="check icon-bad">⚡</div>
          <h2>Table offline</h2>
          <p className="muted">Online payment is unavailable for this table right now. Please pay at the counter.</p>
        </section>
      );
    } else if (step === 'games') {
      body = (
        <section className="card glass fade-in">
          <div className="label">How many games?</div>
          <div className="stepper">
            <button id="games-minus" className="step-btn" aria-label="Fewer games" disabled={games <= 1} onClick={() => setG(games - 1)}>−</button>
            <div key={bump} className="step-val num bounce" aria-live="polite">{games}</div>
            <button id="games-plus" className="step-btn" aria-label="More games" disabled={games >= maxGames} onClick={() => setG(games + 1)}>+</button>
          </div>
          <div className="chips">
            {[1, 3, 5].filter((n) => n <= maxGames).map((n) => (
              <button key={n} id={`games-chip-${n}`} className={`chip num ${games === n ? 'active' : ''}`} onClick={() => setG(n)}>{n} {n === 1 ? 'game' : 'games'}</button>
            ))}
          </div>
          <div className="total">
            <span className="muted">Total</span>
            <strong className="num">{money(shownAmount, cur)}</strong>
          </div>
        </section>
      );
      cta = <button id="continue-btn" className="btn btn-brass" onClick={() => { setErr(null); setStep('phone'); }}>Continue · <span className="num">{money(quote ?? games * table.pricePerGame, cur)}</span></button>;
    } else {
      body = (
        <section className="card glass fade-in">
          <div className="label">{country === 'RW' ? `${walletHint} number` : 'M-Pesa number'}</div>
          <p className="muted" style={{ marginTop: 6 }}>You’ll get a prompt on this phone to enter your {wallet} PIN.</p>
          <label className="phone-field" htmlFor="phone-input">
            <span className="muted">{cc.flag}</span>
            <input id="phone-input" inputMode="tel" autoComplete="tel" placeholder={cc.placeholder} value={phone}
              onChange={(e) => { setPhone(formatPhone(e.target.value)); setErr(null); }} />
          </label>
          {country === 'RW' && provider && !err && (
            <p className={providerOff ? 'err' : 'muted'} style={{ marginTop: 8 }}>
              {providerOff ? `${PROVIDER_LABEL[provider]} isn’t accepted at this table. Use ${walletHint}.` : `Paying with ${PROVIDER_LABEL[provider]}`}
            </p>
          )}
          {err && <p className="err" role="alert">{err}</p>}
          <div className="total">
            <span className="muted num">{games} {games === 1 ? 'game' : 'games'}</span>
            <strong className="num">{money(quote ?? games * table.pricePerGame, cur)}</strong>
          </div>
          <button id="back-to-games" className="btn btn-ghost" style={{ marginTop: 14 }} onClick={() => setStep('games')}>Change games</button>
        </section>
      );
      cta = <button id="pay-btn" className="btn btn-pay" disabled={busy || !phoneValid(phone, country) || providerOff} onClick={pay}>{busy ? 'Sending prompt…' : <>Pay <span className="num">{money(quote ?? games * table.pricePerGame, cur)}</span> with {wallet}</>}</button>;
    }
  } else if (screen === 'waiting' && session) {
    const elapsed = Math.floor((now - session.createdAt) / 1000);
    const left = Math.max(0, PIN_WAIT - elapsed);
    const C = 2 * Math.PI * 76;
    body = left > 0 ? (
      <section className="card glass center fade-in">
        <div className="label">Check your phone</div>
        <div className="ring-wrap">
          <div className="ring-pulse" />
          <svg width="170" height="170" viewBox="0 0 170 170">
            <circle className="ring-bg" cx="85" cy="85" r="76" fill="none" strokeWidth="8" />
            <circle className="ring-fg" cx="85" cy="85" r="76" fill="none" strokeWidth="8" strokeDasharray={C} strokeDashoffset={C * (1 - left / PIN_WAIT)} />
          </svg>
          <div className="ring-center num">{left}</div>
        </div>
        <h2>Enter your {wallet} PIN</h2>
        <p className="muted num">Prompt sent to {session.msisdnMasked ?? 'your phone'} for {money(session.amount, session.currency)}.</p>
      </section>
    ) : (
      <section className="card glass center fade-in">
        <div className="spinner" />
        <h2>Confirming with {wallet}…</h2>
        <p className="muted">This can take a little longer sometimes. Keep this page open — if you’ve already paid, your games will appear here automatically.</p>
      </section>
    );
  } else if (screen === 'failed' && session) {
    body = (
      <section className="card glass center fade-in">
        <div className="check icon-bad">✕</div>
        <h2>{session.payment === 'CANCELLED' ? 'Payment cancelled' : 'Payment didn’t go through'}</h2>
        <p className="muted">{session.paymentMessage || 'No money was taken. You can try again.'}</p>
      </section>
    );
    cta = <button id="retry-pay-btn" className="btn btn-pay" onClick={retryPay}>Try again</button>;
  } else if (screen === 'paid' && session) {
    const blocked = table?.status !== 'AVAILABLE';
    body = (
      <>
        {session.gamesReleased === 0 && <Confetti />}
        <section className="card glass center fade-in">
          <div className="check">✓</div>
          <h2>{session.gamesReleased === 0 ? 'Payment received!' : 'Ready for the next game'}</h2>
          <div className="games-left num">{session.gamesLeft}</div>
          <div className="muted">{session.gamesLeft === 1 ? 'game left' : 'games left'}</div>
          {blocked && table && <p className="err">{table.status === 'IN_GAME' ? 'Waiting for the current game to finish…' : table.status === 'LOCKED' ? (table.lockReason || 'Table locked — ask staff.') : 'Table offline — ask staff.'}</p>}
          {err && <p className="err" role="alert">{err}</p>}
        </section>
        <Receipt s={session} refLabel={country === 'RW' ? 'Transaction ID' : 'M-Pesa ref'} />
      </>
    );
    cta = <button id="release-btn" className="btn btn-brass btn-big" disabled={busy || blocked} onClick={() => action('release')}>{busy ? 'Releasing…' : '🎱 Release Balls'}</button>;
  } else if (screen === 'playing' && session?.currentGame) {
    body = (
      <section className="card glass center fade-in">
        <div className="label">Game in progress</div>
        <div className="timer num">{session.currentGame.startedAt ? fmtDuration(Math.max(0, now - session.currentGame.startedAt)) : <span className="starting">Releasing balls…</span>}</div>
        <p className="muted num">{session.gamesLeft} {session.gamesLeft === 1 ? 'game' : 'games'} left after this one. Good luck!</p>
        {err && <p className="err" role="alert">{err}</p>}
      </section>
    );
    cta = <HoldButton id="end-game-btn" label="Hold to end game" disabled={busy} onConfirm={() => action('end')} />;
  } else if (screen === 'done') {
    const s = doneSummary ?? session;
    body = (
      <>
        <section className="card glass center fade-in">
          <div className="check">🏁</div>
          <h2>All games played</h2>
          <p className="muted">Thanks for playing{table ? ` at ${table.venueName}` : ''}!</p>
        </section>
        {s && <Receipt s={s} refLabel={country === 'RW' ? 'Transaction ID' : 'M-Pesa ref'} />}
      </>
    );
    cta = <button id="play-again-btn" className="btn btn-brass" onClick={startOver}>Play again</button>;
  }

  return (
    <div className="layout">
      <aside className="desktop-side">
        <div className="label">CueTrack · Pay &amp; Play</div>
        <h1>Pay with {country === 'RW' ? 'Mobile Money' : 'M-Pesa'}.<br />Break in seconds.</h1>
        <p className="muted">Choose your games, approve the prompt on your phone and release the balls — no waiting at the counter.</p>
      </aside>
      <main className="shell">
        {header}
        {body}
      </main>
      {cta && <div className="cta-bar"><div>{cta}</div></div>}
    </div>
  );
}

function Receipt({ s, refLabel }: { s: Session; refLabel: string }) {
  return (
    <section className="card glass fade-in">
      <div className="label">Receipt</div>
      <dl className="receipt">
        <div><dt>{refLabel}</dt><dd>{s.receipt ?? '—'}</dd></div>
        <div><dt>Amount</dt><dd>{money(s.amount, s.currency)}</dd></div>
        <div><dt>Games paid</dt><dd>{s.gamesPaid}</dd></div>
        <div><dt>Games played</dt><dd>{s.gamesReleased}</dd></div>
        <div><dt>Phone</dt><dd>{s.msisdnMasked ?? '—'}</dd></div>
        <div><dt>Paid at</dt><dd>{fmtTime(s.paidAt)}</dd></div>
      </dl>
    </section>
  );
}
