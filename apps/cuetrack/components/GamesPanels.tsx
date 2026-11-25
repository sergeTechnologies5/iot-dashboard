"use client";

import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@/context/Store';
import { CHANNEL_META } from '@/lib/channels';
import { DAY, dateTime, downloadCsv, duration, money, startOfDay, time } from '@/lib/format';
import { fmtDuration, gameEnded } from '@/lib/games';
import type { Billiard, Game, LedgerEntry, LedgerType } from '@/lib/types';
import { Icon } from './Icon';
import { KpiCard } from './ui';
import { Modal } from './overlays';

const GOLD = '#e8c45a';

/* ---------------- Games tab ---------------- */
export function GamesTab({ b }: { b: Billiard }) {
  const { games, payments, now, can, endGame } = useStore();
  const [day, setDay] = useState(0); // 0 = today, 1 = yesterday...
  const mine = useMemo(() => games.filter((g) => g.billiardId === b.id && g.status !== 'FAILED').sort((a, z) => z.requestedAt - a.requestedAt), [games, b.id]);
  const chanOf = useMemo(() => new Map(payments.map((p) => [p.id, p.channel])), [payments]);
  const d0 = startOfDay(now) - day * DAY;
  const dayGames = mine.filter((g) => (g.startedAt ?? g.requestedAt) >= d0 && (g.startedAt ?? g.requestedAt) < d0 + DAY);
  const done = dayGames.filter((g) => gameEnded(g) && g.durationSec);
  const avg = done.length ? done.reduce((s, g) => s + (g.durationSec ?? 0), 0) / done.length : 0;
  const playedMs = dayGames.reduce((s, g) => s + (g.durationSec ? g.durationSec * 1000 : g.startedAt ? Math.min(now, d0 + DAY) - g.startedAt : 0), 0);
  const span = Math.max(1, Math.min(now, d0 + DAY) - d0);
  const colorOf = (g: Game) => (g.free ? GOLD : CHANNEL_META[(g.paymentId && chanOf.get(g.paymentId)) || 'CASH'].color);

  return (
    <>
      <div className="grid grid-kpi">
        <KpiCard label={day ? 'Games that day' : 'Games today'} icon="play" value={String(dayGames.length)} />
        <KpiCard label="Average length" icon="clock" accent="var(--info)" value={fmtDuration(Math.round(avg))} />
        <KpiCard label="Utilisation" icon="activity" accent="var(--felt-2)" value={`${Math.min(100, Math.round((playedMs / span) * 100))}%`} />
        <KpiCard label="Free games" icon="gift" accent={GOLD} value={String(dayGames.filter((g) => g.free).length)} />
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h3>Day timeline</h3>
            <div className="sub">Each block is one game, coloured by how it was paid</div>
          </div>
          <div className="segmented">
            {[0, 1, 2].map((d) => (
              <button key={d} className={day === d ? 'active' : ''} onClick={() => setDay(d)}>{d === 0 ? 'Today' : d === 1 ? 'Yesterday' : new Date(startOfDay(now) - d * DAY).toLocaleDateString('en-KE', { weekday: 'short' })}</button>
            ))}
          </div>
        </div>
        <div className="card-pad" style={{ paddingTop: 4 }}>
          <div className="timeline" id="game-timeline">
            {Array.from({ length: 25 }, (_, h) => <i key={h} className="tl-tick" style={{ left: `${(h / 24) * 100}%` }} />)}
            {dayGames.map((g) => {
              const s = g.startedAt ?? g.requestedAt;
              const e = g.endedAt ?? (g.durationSec ? s + g.durationSec * 1000 : now);
              const left = ((s - d0) / DAY) * 100;
              const width = Math.max(0.35, ((e - s) / DAY) * 100);
              return (
                <span
                  key={g.id}
                  className={`tl-block ${g.status === 'IN_PLAY' ? 'live' : ''}`}
                  style={{ left: `${left}%`, width: `${width}%`, background: colorOf(g) }}
                  title={`${time(s)} · ${g.status === 'IN_PLAY' ? 'in play' : fmtDuration(g.durationSec)} · ${g.free ? 'Free game' : CHANNEL_META[(g.paymentId && chanOf.get(g.paymentId)) || 'CASH'].label}`}
                />
              );
            })}
            {day === 0 && <i className="tl-now" style={{ left: `${((now - d0) / DAY) * 100}%` }} />}
          </div>
          <div className="row between faint mono" style={{ fontSize: 11, marginTop: 6 }}>
            {['00', '04', '08', '12', '16', '20', '24'].map((h) => <span key={h}>{h}:00</span>)}
          </div>
          <div className="chips" style={{ marginTop: 12, gap: 14 }}>
            {(['MPESA', 'AIRTEL_KE', 'MTN_RW', 'CARD', 'CASH'] as const).map((c) => (
              <span key={c} className="legend"><i style={{ background: CHANNEL_META[c].color }} />{CHANNEL_META[c].short}</span>
            ))}
            <span className="legend"><i style={{ background: GOLD }} />Free</span>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head" style={{ paddingBottom: 10 }}><div><h3>Games</h3><div className="sub">Most recent first</div></div></div>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Started</th><th>Duration</th><th>Status</th><th>Paid via</th><th className="num">Price</th><th>Released by</th><th>Ended by</th><th /></tr></thead>
            <tbody>
              {mine.slice(0, 40).map((g) => {
                const ch = g.paymentId ? chanOf.get(g.paymentId) : undefined;
                return (
                  <tr key={g.id}>
                    <td>{dateTime(g.startedAt ?? g.requestedAt)}</td>
                    <td className="mono">{g.status === 'IN_PLAY' && g.startedAt ? duration(now - g.startedAt) : fmtDuration(g.durationSec)}</td>
                    <td><span className={`pill ${g.status === 'IN_PLAY' ? 'pill-felt pulse' : g.status === 'TIMED_OUT' ? 'pill-amber' : g.status === 'RELEASING' ? 'pill-brass' : 'pill-grey'}`}>{g.status.replace('_', ' ').toLowerCase()}</span></td>
                    <td>{g.free ? <span className="pill" style={{ color: GOLD, background: 'rgba(232,196,90,.14)' }}><Icon name="gift" size={11} /> Free</span> : <span className="legend"><i style={{ background: CHANNEL_META[ch ?? 'CASH'].color }} />{CHANNEL_META[ch ?? 'CASH'].label}</span>}</td>
                    <td className="num mono">{g.free ? '—' : money(g.unitPrice, g.currency)}</td>
                    <td className="muted">{g.releasedBy === 'AUTO' ? 'Auto release' : g.releasedBy}</td>
                    <td className="muted">{g.endedBy === 'TABLE_BUTTON' ? 'Table button' : g.endedBy === 'TIMEOUT' ? 'Timed out' : g.endedBy ?? '—'}</td>
                    <td>{g.status === 'IN_PLAY' && can('BILLIARD_CONTROL') && <button className="btn btn-ghost btn-sm" onClick={() => endGame(g.id)}><Icon name="stop" size={12} /> End</button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {mine.length === 0 && <div className="empty">No games recorded yet</div>}
        </div>
      </div>
    </>
  );
}

/* ---------------- Ledger tab ---------------- */
const LEDGER_LABEL: Record<LedgerType, string> = {
  PURCHASE: 'Purchase',
  GAME: 'Game played',
  REFUND: 'Refund',
  FREE: 'Free games granted',
  EXPIRY: 'Credits expired',
  REVERSAL: 'Payment reversed',
  ADJUSTMENT: 'Adjustment',
};

export function LedgerTab({ b }: { b: Billiard }) {
  const { getLedger, games, payments, freeGames } = useStore();
  const [rows, setRows] = useState<LedgerEntry[] | null>(null);
  // refetch when the table's credit picture changes
  const sig = `${b.credits}-${b.freeCredits}-${games.length}-${payments.length}-${freeGames.length}`;
  useEffect(() => {
    let live = true;
    getLedger(b.id).then((r) => live && setRows(r)).catch(() => live && setRows([]));
    return () => {
      live = false;
    };
  }, [b.id, getLedger, sig]);

  const exportCsv = () =>
    downloadCsv(`${b.name.replace(/\s+/g, '-')}-ledger.csv`, [
      ['Date', 'Type', 'Change', 'Balance', 'Reference', 'By'],
      ...(rows ?? []).map((r) => [new Date(r.at).toISOString(), LEDGER_LABEL[r.type] ?? r.type, r.delta, r.balanceAfter, r.refId ?? '', r.actor]),
    ]);

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h3>Credit statement</h3>
          <div className="sub">Every credit in and out of {b.name} · balance now <b className="mono">{b.credits + (b.freeCredits ?? 0)}</b>{b.walletBalance ? <> · wallet <b className="mono">{money(b.walletBalance, b.currency)}</b></> : null}</div>
        </div>
        <button id="ledger-csv" className="btn btn-sm" disabled={!rows?.length} onClick={exportCsv}><Icon name="download" size={14} /> Export CSV</button>
      </div>
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th>Date &amp; time</th><th>Entry</th><th className="num">Change</th><th className="num">Balance</th><th>Reference</th><th>By</th></tr></thead>
          <tbody>
            {(rows ?? []).slice(0, 200).map((r) => (
              <tr key={r.id}>
                <td className="muted">{dateTime(r.at)}</td>
                <td><span className={`ledger-type t-${r.type}`}>{LEDGER_LABEL[r.type] ?? r.type}</span></td>
                <td className="num mono" style={{ color: r.delta > 0 ? 'var(--felt-2)' : r.delta < 0 ? 'var(--danger)' : undefined, fontWeight: 600 }}>{r.delta > 0 ? `+${r.delta}` : r.delta}</td>
                <td className="num mono">{r.balanceAfter}</td>
                <td className="mono faint">{r.refId ?? '—'}</td>
                <td className="muted">{r.actor}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows === null && <div className="empty"><span className="spinner" /></div>}
        {rows?.length === 0 && <div className="empty">No ledger entries yet</div>}
      </div>
    </div>
  );
}

/* ---------------- Free game request ---------------- */
export function FreeGameModal({ b, onClose }: { b: Billiard; onClose: () => void }) {
  const { requestFreeGame } = useStore();
  const [n, setN] = useState(1);
  const [reason, setReason] = useState('');
  const [valid, setValid] = useState(60);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    const ok = await requestFreeGame({ billiardId: b.id, games: n, reason: reason.trim(), validMinutes: valid });
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <Modal
      title={<><Icon name="gift" size={16} style={{ color: GOLD, verticalAlign: -2 }} /> Request free game · {b.name}</>}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button id="free-submit" className="btn btn-brass" disabled={busy || reason.trim().length < 3} onClick={submit}>
            {busy ? <span className="spinner" /> : <Icon name="check" size={15} />} Send for approval
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="field">
          <label>Games</label>
          <div className="chips">
            {[1, 2, 3, 5].map((x) => <button key={x} className={`chip ${n === x ? 'active' : ''}`} onClick={() => setN(x)}>{x}</button>)}
          </div>
        </div>
        <div className="field">
          <label htmlFor="free-reason">Reason</label>
          <textarea id="free-reason" className="textarea" placeholder="e.g. Coin jammed, customer lost a game" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <div className="field">
          <label>Valid for</label>
          <div className="segmented" style={{ alignSelf: 'flex-start' }}>
            {[30, 60, 120].map((m) => <button key={m} className={valid === m ? 'active' : ''} onClick={() => setValid(m)}>{m < 60 ? `${m} min` : `${m / 60} h`}</button>)}
          </div>
          <span className="hint">Once approved, unused free credits expire after this window.</span>
        </div>
      </div>
    </Modal>
  );
}
