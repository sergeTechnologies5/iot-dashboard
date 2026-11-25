"use client";

import { useEffect, useState } from 'react';
import { useStore } from '@/context/Store';
import { normalisePushMsisdn, PUSH_LABEL, type PushChannel, useMpesa } from '@/context/Mpesa';
import { CHANNEL_META } from '@/lib/channels';
import { money } from '@/lib/format';
import type { Billiard, Quote } from '@/lib/types';
import { Icon } from './Icon';
import { Drawer } from './overlays';

/** Mobile-money push (M-Pesa STK, MTN MoMo, Airtel Money): phone + games/amount, then live status via STK_UPDATED. */
function StkPanel({ b, channel, onClose }: { b: Billiard; channel: PushChannel; onClose: () => void }) {
  const L = PUSH_LABEL[channel];
  const meta = CHANNEL_META[channel];
  const { startStk, stks, refreshStk, queryStk } = useMpesa();
  const [phone, setPhone] = useState('');
  const [byAmount, setByAmount] = useState(false);
  const [games, setGames] = useState(1);
  const [amountIn, setAmountIn] = useState('');
  const [stkId, setStkId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const msisdn = normalisePushMsisdn(phone, channel);
  const s = stkId ? stks.find((x) => x.id === stkId) : undefined;
  const amount = byAmount ? Number(amountIn) || 0 : games * b.tokenPrice;

  // safety net if the realtime event is missed: poll while pending
  useEffect(() => {
    if (!s || s.status !== 'PENDING') return;
    const t = setInterval(() => refreshStk(s.id), 5000);
    return () => clearInterval(t);
  }, [s, refreshStk]);

  const send = async () => {
    if (!msisdn) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await startStk(b.id, byAmount ? { msisdn, amount, channel } : { msisdn, games, channel });
      setStkId(r.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (s) {
    return (
      <div className={`stk-status s-${s.status}`} id="stk-status">
        {s.status === 'PENDING' && (
          <>
            <span className="stk-ring"><Icon name="phone" size={26} /></span>
            <b>Waiting for the customer…</b>
            <span className="muted">A prompt for <b className="mono">{money(s.amount, s.currency)}</b> was sent to <span className="mono">{s.msisdn}</span>. Ask them to enter their {L.pin}.</span>
            <span className="spinner" />
            <button id="stk-check" className="btn btn-ghost btn-sm" disabled={busy} onClick={async () => {
              setBusy(true);
              setErr(null);
              try {
                const r = await queryStk(s.id);
                if (r && r.status === 'PENDING') setErr(`${L.provider} is still processing — try again shortly.`);
              } catch (e) {
                setErr(e instanceof Error ? e.message : String(e));
              } finally {
                setBusy(false);
              }
            }}><Icon name="undo" size={13} /> Check status with {L.provider}</button>
            {err && <span className="hint" style={{ color: 'var(--danger)' }}>{err}</span>}
          </>
        )}
        {s.status === 'COMPLETED' && (
          <>
            <span className="stk-ring ok"><Icon name="check" size={28} strokeWidth={3} /></span>
            <b>Payment received</b>
            <span className="stk-receipt mono">{s.receipt}</span>
            <span className="muted">{money(s.amount, s.currency)} · {s.games} game{s.games === 1 ? '' : 's'} credited to {b.name}</span>
            <button className="btn btn-brass" onClick={onClose}>Done</button>
          </>
        )}
        {(s.status === 'FAILED' || s.status === 'CANCELLED') && (
          <>
            <span className="stk-ring bad"><Icon name="x" size={28} strokeWidth={3} /></span>
            <b>{s.status === 'CANCELLED' ? 'Cancelled by customer' : 'Payment failed'}</b>
            <span className="muted">{s.resultDesc ?? 'No payment was taken.'}{s.resultCode != null ? ` (code ${s.resultCode})` : ''}</span>
            <div className="row">
              <button className="btn btn-ghost" onClick={onClose}>Close</button>
              <button className="btn btn-brass" onClick={() => setStkId(null)}><Icon name="undo" size={14} /> Try again</button>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="field">
        <label htmlFor="stk-phone">Customer phone ({L.provider})</label>
        <input id="stk-phone" className="input mono" inputMode="tel" placeholder={L.placeholder} value={phone} onChange={(e) => setPhone(e.target.value)} />
        {phone && !msisdn && <span className="hint" style={{ color: 'var(--danger)' }}>Enter a valid {L.country} number, e.g. {L.example}</span>}
        {msisdn && <span className="hint mono">Will prompt {msisdn}</span>}
      </div>
      <div className="segmented" style={{ alignSelf: 'flex-start' }}>
        <button className={!byAmount ? 'active' : ''} onClick={() => setByAmount(false)}>By games</button>
        <button className={byAmount ? 'active' : ''} onClick={() => setByAmount(true)}>By amount</button>
      </div>
      {byAmount ? (
        <div className="field">
          <label htmlFor="stk-amount">Amount ({b.currency})</label>
          <input id="stk-amount" className="input mono" inputMode="numeric" value={amountIn} onChange={(e) => setAmountIn(e.target.value.replace(/\D/g, ''))} placeholder={String(b.tokenPrice * 2)} />
        </div>
      ) : (
        <div className="field">
          <label>Games</label>
          <div className="chips">
            {[1, 2, 3, 5, 10].map((n) => <button key={n} className={`chip ${games === n ? 'active' : ''}`} onClick={() => setGames(n)}>{n}</button>)}
          </div>
        </div>
      )}
      <div className="summary-box">
        <div>
          <div className="faint" style={{ fontSize: 12 }}>Customer will be asked to pay</div>
          <div className="mono" style={{ fontSize: 24, fontWeight: 700, color: 'var(--brass-2)' }}>{money(amount, b.currency)}</div>
        </div>
        <span className="chan-badge" style={{ ['--chan' as string]: meta.color, ['--chan-bg' as string]: meta.bg }}><Icon name="phone" size={12} /> {L.name}</span>
      </div>
      {err && <div className="awaiting" style={{ background: 'var(--danger-dim)', color: 'var(--danger)' }}><Icon name="x" size={14} /> {err}</div>}
      <button id="stk-send" className="btn btn-brass btn-lg" disabled={!msisdn || amount < b.tokenPrice || busy || b.status === 'OFFLINE'} onClick={send}>
        {busy ? <span className="spinner" /> : <Icon name="phone" size={16} />} Send {L.name} prompt
      </button>
      <p className="hint" style={{ margin: 0 }}>Credits are added automatically once {L.provider} confirms the payment.</p>
    </>
  );
}

/**
 * Record a manual (cash) payment against a billiard and credit the table.
 * If billiardId is omitted the user picks one of the billiards they can see.
 * Cash can be entered by games (bundle pricing applies) or by amount received
 * (the quote shows any remainder carried to the table wallet).
 */
export function RecordPaymentDrawer({ billiardId, onClose }: { billiardId?: string; onClose: () => void }) {
  const { billiards, recordManualPayment, addCredit, companyName, quote } = useStore();
  const [selected, setSelected] = useState(billiardId ?? billiards.find((b) => b.status !== 'OFFLINE')?.id ?? '');
  const [tokens, setTokens] = useState(1);
  const [byAmount, setByAmount] = useState(false);
  const [amountIn, setAmountIn] = useState('');
  const [note, setNote] = useState('');
  const [complimentary, setComplimentary] = useState(false);
  const [stk, setStk] = useState<PushChannel | null>(null);
  const [q, setQ] = useState<Quote | null>(null);
  const b = billiards.find((x) => x.id === selected);
  const pushChannels = (['MPESA', 'MTN_RW', 'AIRTEL_RW'] as PushChannel[]).filter((c) => b?.channels.includes(c));
  const stkMode = stk && pushChannels.includes(stk) ? stk : null;
  const cur = b?.currency ?? 'KES';
  const cashBlocked = !!b && !complimentary && !b.cashEnabled;
  const amountNum = Number(amountIn) || 0;

  useEffect(() => {
    if (!b || complimentary) return;
    let live = true;
    const t = setTimeout(() => {
      quote(b.id, byAmount ? { amount: amountNum } : { games: tokens })
        .then((r) => live && setQ(r))
        .catch(() => live && setQ(null));
    }, 180);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [b, byAmount, amountNum, tokens, complimentary, quote]);

  const games = complimentary ? tokens : byAmount ? q?.games ?? 0 : tokens;
  const amount = complimentary ? 0 : byAmount ? amountNum : q?.amount ?? (b ? tokens * b.tokenPrice : 0);
  const invalid = !b || cashBlocked || (complimentary ? tokens < 1 : byAmount ? amountNum <= 0 || games < 1 : tokens < 1);

  const submit = () => {
    if (!b) return;
    if (complimentary) addCredit(b.id, tokens);
    else if (byAmount) recordManualPayment({ billiardId: b.id, amount: amountNum, note: note || undefined });
    else recordManualPayment({ billiardId: b.id, tokens, note: note || undefined });
    onClose();
  };

  return (
    <Drawer
      title={stkMode ? `${PUSH_LABEL[stkMode].name} prompt` : complimentary ? 'Add complimentary credit' : 'Record manual payment'}
      onClose={onClose}
      footer={
        stkMode ? undefined : (
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button id="confirm-payment" className="btn btn-brass btn-lg" disabled={invalid} onClick={submit}>
            <Icon name="check" size={16} /> {complimentary ? 'Send credit' : `Confirm ${money(amount, cur)}`}
          </button>
        </>
        )
      }
    >
      <div className="field">
        <label htmlFor="pay-billiard">Billiard</label>
        <select id="pay-billiard" className="select" value={selected} onChange={(e) => setSelected(e.target.value)} disabled={!!billiardId}>
          {billiards.map((x) => (
            <option key={x.id} value={x.id} disabled={x.status === 'OFFLINE'}>
              {x.name} · {companyName(x.companyId)} · {x.branch}
              {x.status === 'OFFLINE' ? ' (offline)' : ''}
            </option>
          ))}
        </select>
      </div>

      <div className="segmented" style={{ alignSelf: 'flex-start', flexWrap: 'wrap' }}>
        <button className={!complimentary && !stkMode ? 'active' : ''} onClick={() => { setComplimentary(false); setStk(null); }}>Cash payment</button>
        {pushChannels.map((c) => (
          <button key={c} id={`pay-mode-${c.toLowerCase()}`} className={stkMode === c ? 'active' : ''} onClick={() => { setComplimentary(false); setStk(c); }}>
            {c === 'MPESA' ? 'M-Pesa prompt (STK)' : `${PUSH_LABEL[c].name} prompt`}
          </button>
        ))}
        <button className={complimentary && !stkMode ? 'active' : ''} onClick={() => { setComplimentary(true); setStk(null); }}>Complimentary</button>
      </div>

      {stkMode && b ? <StkPanel key={`${b.id}-${stkMode}`} b={b} channel={stkMode} onClose={onClose} /> : <>
      {!complimentary && (
        <div className="segmented" style={{ alignSelf: 'flex-start' }}>
          <button id="pay-by-games" className={!byAmount ? 'active' : ''} onClick={() => setByAmount(false)}>By games</button>
          <button id="pay-by-amount" className={byAmount ? 'active' : ''} onClick={() => setByAmount(true)}>By amount received</button>
        </div>
      )}

      {!complimentary && byAmount ? (
        <div className="field">
          <label htmlFor="pay-amount">Amount received ({cur})</label>
          <input id="pay-amount" className="input mono" inputMode="decimal" placeholder={b ? String(b.tokenPrice * 3) : '0'} value={amountIn} onChange={(e) => setAmountIn(e.target.value.replace(/[^\d.]/g, ''))} />
          {b && <span className="hint">Table price: {money(b.tokenPrice, cur)} per game{cashBlocked ? ' · cash is disabled on this table' : ''}</span>}
        </div>
      ) : (
        <div className="field">
          <label>Tokens (games)</label>
          <div className="row">
            <div className="stepper">
              <button onClick={() => setTokens((t) => Math.max(1, t - 1))} aria-label="Decrease">−</button>
              <input id="pay-tokens" value={tokens} onChange={(e) => setTokens(Math.max(1, Math.min(50, Number(e.target.value.replace(/\D/g, '')) || 1)))} />
              <button onClick={() => setTokens((t) => Math.min(50, t + 1))} aria-label="Increase">+</button>
            </div>
            <div className="chips">
              {[1, 2, 5, 10].map((n) => (
                <button key={n} className={`chip ${tokens === n ? 'active' : ''}`} onClick={() => setTokens(n)}>
                  {n}
                </button>
              ))}
            </div>
          </div>
          {b && <span className="hint">Table price: {money(b.tokenPrice, cur)} per token{cashBlocked ? ' · cash is disabled on this table' : ''}</span>}
        </div>
      )}

      {!complimentary && (
        <div className="field">
          <label htmlFor="pay-note">Note (optional)</label>
          <textarea id="pay-note" className="textarea" placeholder="e.g. Paid at bar, receipt #204" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      )}

      <div className="summary-box">
        <div>
          <div className="faint" style={{ fontSize: 12 }}>{complimentary ? 'Credit only, no revenue recorded' : 'Amount received'}</div>
          <div className="mono" style={{ fontSize: 24, fontWeight: 700, color: 'var(--brass-2)' }}>{money(amount, cur)}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="faint" style={{ fontSize: 12 }}>Table credited</div>
          <div className="mono" style={{ fontSize: 18, fontWeight: 700 }}>+{games}</div>
        </div>
      </div>

      {!complimentary && q && (
        <div className="quote-box" id="pay-quote">
          <div><span className="faint">Unit price</span><b className="mono">{money(q.unitPrice, cur)}</b></div>
          {q.rule && (
            <div><span className="faint">Pricing</span><span className={`pill ${q.rule.type === 'BUNDLE' ? 'pill-brass' : 'pill-felt'}`}>{q.rule.type === 'BUNDLE' ? 'Bundle' : 'Happy hour'} · {q.rule.name}</span></div>
          )}
          {byAmount && q.walletUsed > 0 && <div><span className="faint">Wallet applied</span><b className="mono">{money(q.walletUsed, cur)}</b></div>}
          {byAmount && q.remainder > 0 && <div><span className="faint">Remainder → table wallet</span><b className="mono" style={{ color: 'var(--brass-2)' }}>{money(q.remainder, cur)}</b></div>}
        </div>
      )}
      <p className="hint" style={{ margin: 0 }}>
        The credit is sent to the table controller over MQTT. The table shows the new credit once the device acknowledges.
      </p>
      </>}
    </Drawer>
  );
}
