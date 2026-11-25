"use client";

import { useState } from 'react';
import Link from 'next/link';
import { useStore } from '@/context/Store';
import { timeAgo } from '@/lib/format';
import type { FreeGameRequest, FreeGameStatus } from '@/lib/types';
import { Icon } from '@/components/Icon';
import { Avatar } from '@/components/ui';

const STATUS_PILL: Record<FreeGameStatus, string> = {
  PENDING: 'pill-amber',
  APPROVED: 'pill-felt',
  REJECTED: 'pill-danger',
  EXPIRED: 'pill-grey',
  USED: 'pill-brass',
};

function countdown(ms: number) {
  if (ms <= 0) return 'expired';
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m left` : `${m}:${String(s).padStart(2, '0')} left`;
}

function PendingCard({ r }: { r: FreeGameRequest }) {
  const { billiardById, companyName, decideFreeGame, can, now, user } = useStore();
  const [note, setNote] = useState('');
  const b = billiardById(r.billiardId);
  const approver = can('FREE_GAME_APPROVE');
  return (
    <div className="card approval-card" id={`free-${r.id}`}>
      <div className="row between">
        <div className="row" style={{ gap: 10 }}>
          <span className="gift-ico"><Icon name="gift" size={18} /></span>
          <div>
            <b style={{ fontSize: 15 }}>{r.games} free game{r.games === 1 ? '' : 's'}</b>
            <div className="faint" style={{ fontSize: 12 }}>
              <Link href={`/billiards/${r.billiardId}`}>{b?.name ?? r.billiardId}</Link> · {user?.role === 'SUPER_ADMIN' ? companyName(r.companyId) : b?.branch}
            </div>
          </div>
        </div>
        <span className="pill pill-amber">Pending · {timeAgo(r.createdAt, now)}</span>
      </div>
      <blockquote className="approval-reason">“{r.reason}”</blockquote>
      <div className="row faint" style={{ fontSize: 12, gap: 8 }}>
        <Avatar name={r.requestedBy} size="sm" /> {r.requestedBy} · valid {r.validMinutes} min once approved
      </div>
      {approver ? (
        <>
          <input className="input" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} id={`free-note-${r.id}`} />
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn btn-danger btn-sm" onClick={() => decideFreeGame(r.id, false, note || undefined)} id={`free-reject-${r.id}`}><Icon name="x" size={13} /> Reject</button>
            <button className="btn btn-gold btn-sm" onClick={() => decideFreeGame(r.id, true, note || undefined)} id={`free-approve-${r.id}`}><Icon name="check" size={13} /> Approve</button>
          </div>
        </>
      ) : (
        <div className="awaiting"><Icon name="clock" size={14} /> Awaiting approval from your Company Super Admin</div>
      )}
    </div>
  );
}

export default function ApprovalsPage() {
  const { freeGames, can, billiardById, now } = useStore();
  const [filter, setFilter] = useState<'ALL' | FreeGameStatus>('ALL');
  if (!can('FREE_GAME_REQUEST')) {
    return <div className="card empty"><Icon name="shield" size={28} /><h3 style={{ margin: '12px 0 6px' }}>No access</h3></div>;
  }
  const pending = freeGames.filter((f) => f.status === 'PENDING').sort((a, z) => a.createdAt - z.createdAt);
  const history = freeGames.filter((f) => f.status !== 'PENDING' && (filter === 'ALL' || f.status === filter)).sort((a, z) => (z.decidedAt ?? z.createdAt) - (a.decidedAt ?? a.createdAt));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Free game approvals</h1>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            {can('FREE_GAME_APPROVE') ? 'Approve or reject complimentary games requested by your staff.' : 'Track the free games you have requested.'}
          </p>
        </div>
        <span className={`pill ${pending.length ? 'pill-amber' : 'pill-grey'}`}>{pending.length} pending</span>
      </div>

      {pending.length === 0 ? (
        <div className="card empty"><Icon name="check" size={26} /><p>Nothing waiting — all caught up.</p></div>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
          {pending.map((r) => <PendingCard key={r.id} r={r} />)}
        </div>
      )}

      <div className="card">
        <div className="card-head">
          <div><h3>History</h3><div className="sub">Decided requests and their free credits</div></div>
          <div className="segmented">
            {(['ALL', 'APPROVED', 'USED', 'REJECTED', 'EXPIRED'] as const).map((s) => (
              <button key={s} className={filter === s ? 'active' : ''} onClick={() => setFilter(s)}>{s === 'ALL' ? 'All' : s[0] + s.slice(1).toLowerCase()}</button>
            ))}
          </div>
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Requested</th><th>Table</th><th className="num">Games</th><th>Reason</th><th>By</th><th>Status</th><th>Decided by</th><th>Credits</th></tr></thead>
            <tbody>
              {history.map((r) => (
                <tr key={r.id}>
                  <td className="muted">{timeAgo(r.createdAt, now)}</td>
                  <td><Link href={`/billiards/${r.billiardId}`}><b>{billiardById(r.billiardId)?.name ?? r.billiardId}</b></Link></td>
                  <td className="num mono">{r.games}</td>
                  <td className="muted" style={{ maxWidth: 260, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.reason}>{r.reason}</td>
                  <td className="muted">{r.requestedBy}</td>
                  <td><span className={`pill ${STATUS_PILL[r.status]}`}>{r.status.toLowerCase()}</span></td>
                  <td className="muted" title={r.decisionNote ?? undefined}>{r.decidedBy ?? '—'}{r.decisionNote && <Icon name="mail" size={12} style={{ marginLeft: 6, verticalAlign: -1 }} />}</td>
                  <td className="mono">
                    {r.status === 'APPROVED' && r.expiresAt ? (
                      <span style={{ color: '#e8c45a' }}>{r.remaining} left · {countdown(r.expiresAt - now)}</span>
                    ) : r.status === 'USED' ? (
                      <span className="faint">all used</span>
                    ) : r.status === 'EXPIRED' ? (
                      <span className="faint">{r.remaining} expired</span>
                    ) : (
                      <span className="faint">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {history.length === 0 && <div className="empty">No decided requests</div>}
        </div>
      </div>
    </>
  );
}
