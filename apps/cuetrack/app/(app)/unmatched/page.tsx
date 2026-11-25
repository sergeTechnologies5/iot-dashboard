"use client";

import { useEffect, useState } from 'react';
import { useMpesa } from '@/context/Mpesa';
import { useStore } from '@/context/Store';
import { dateTime, money, timeAgo } from '@/lib/format';
import type { UnmatchedPayment, UnmatchedReason, UnmatchedStatus } from '@/lib/types';
import { Icon } from '@/components/Icon';
import { Modal } from '@/components/overlays';
import { MpesaSimulator } from '@/components/MpesaPanels';

const REASON: Record<UnmatchedReason, { label: string; hint: string; tone: string }> = {
  UNKNOWN_REF: { label: 'Unknown account', hint: 'Account number did not match any table', tone: 'pill-amber' },
  NO_REF: { label: 'No account', hint: 'Customer left the account number blank', tone: 'pill-grey' },
  UNDERPAID: { label: 'Underpaid', hint: 'Amount is below one game on the matched table', tone: 'pill-danger' },
  STK_ORPHAN: { label: 'Orphan STK', hint: 'STK confirmation arrived without a pending request', tone: 'pill-brass' },
};

function AssignModal({ u, onClose }: { u: UnmatchedPayment; onClose: () => void }) {
  const { billiards } = useStore();
  const { assignUnmatched } = useMpesa();
  const options = billiards.filter((b) => b.companyId === u.companyId);
  const guess = options.find((b) => u.billRef && b.accountRef && b.accountRef.toUpperCase().includes(u.billRef.toUpperCase()));
  const [sel, setSel] = useState(guess?.id ?? options[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const b = options.find((x) => x.id === sel);
  const games = b ? Math.floor(u.amount / b.tokenPrice) : 0;
  const submit = async () => {
    setBusy(true);
    const ok = await assignUnmatched(u.id, sel);
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <Modal
      title={`Assign ${money(u.amount, u.currency)} to a table`}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button id="assign-confirm" className="btn btn-brass" disabled={!b || games < 1 || busy} onClick={submit}>
            {busy ? <span className="spinner" /> : <Icon name="check" size={15} />} Assign &amp; credit
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="summary-box" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
          <span className="mono" style={{ fontWeight: 700 }}>{u.transId}</span>
          <span className="faint" style={{ fontSize: 12 }}>{u.payerName ?? 'Unknown payer'} · {u.msisdn ?? '—'} · account “{u.billRef ?? '—'}” · {dateTime(u.receivedAt)}</span>
        </div>
        <div className="assign-list">
          {options.map((x) => {
            const g = Math.floor(u.amount / x.tokenPrice);
            return (
              <button key={x.id} id={`assign-${x.id}`} className={`assign-opt ${sel === x.id ? 'on' : ''}`} onClick={() => setSel(x.id)} disabled={g < 1}>
                <span className="tick">{sel === x.id && <Icon name="check" size={11} strokeWidth={3} />}</span>
                <div style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
                  <b>{x.name}</b>
                  <div className="faint" style={{ fontSize: 12 }}>{x.branch} · ref <span className="mono">{x.accountRef || '—'}</span>{guess?.id === x.id ? ' · best match' : ''}</div>
                </div>
                <span className="mono faint" style={{ fontSize: 12 }}>{g >= 1 ? `${g} game${g === 1 ? '' : 's'}` : 'below 1 game'}</span>
              </button>
            );
          })}
          {options.length === 0 && <div className="empty">No tables in this company</div>}
        </div>
      </div>
    </Modal>
  );
}

export default function UnmatchedPage() {
  const { now, billiardById, companyName, user } = useStore();
  const { unmatched, loadUnmatched } = useMpesa();
  const [status, setStatus] = useState<UnmatchedStatus>('UNMATCHED');
  const [reason, setReason] = useState<'ALL' | UnmatchedReason>('ALL');
  const [assign, setAssign] = useState<UnmatchedPayment | null>(null);
  useEffect(() => {
    loadUnmatched();
  }, [loadUnmatched]);

  const byStatus = unmatched.filter((u) => u.status === status);
  const rows = byStatus.filter((u) => reason === 'ALL' || u.reason === reason).sort((a, z) => z.receivedAt - a.receivedAt);
  const open = unmatched.filter((u) => u.status === 'UNMATCHED');
  const openTotal = open.reduce<Record<string, number>>((m, u) => ((m[u.currency] = (m[u.currency] ?? 0) + u.amount), m), {});

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Unmatched payments</h1>
          <p>M-Pesa payments that couldn&apos;t be linked to a table automatically. Assign them to credit the right table.</p>
        </div>
        <div className="row">
          <span className={`pill ${open.length ? 'pill-amber' : 'pill-felt'}`}>{open.length} open</span>
          {Object.entries(openTotal).map(([c, v]) => <span key={c} className="pill pill-brass mono">{money(v, c as UnmatchedPayment['currency'])}</span>)}
        </div>
      </div>

      <div className="card">
        <div className="card-head" style={{ flexWrap: 'wrap', gap: 12 }}>
          <div className="segmented">
            {(['UNMATCHED', 'ASSIGNED'] as const).map((s) => (
              <button key={s} className={status === s ? 'active' : ''} onClick={() => setStatus(s)}>{s === 'UNMATCHED' ? 'Needs action' : 'Assigned'}</button>
            ))}
          </div>
          <div className="chips" style={{ gap: 6 }}>
            <button className={`chip ${reason === 'ALL' ? 'active' : ''}`} onClick={() => setReason('ALL')}>All · {byStatus.length}</button>
            {(Object.keys(REASON) as UnmatchedReason[]).map((r) => (
              <button key={r} id={`reason-${r}`} className={`chip ${reason === r ? 'active' : ''}`} onClick={() => setReason(r)} title={REASON[r].hint}>
                {REASON[r].label} · {byStatus.filter((u) => u.reason === r).length}
              </button>
            ))}
          </div>
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Received</th><th>Receipt</th>{user?.role === 'SUPER_ADMIN' && <th>Company</th>}<th>Payer</th><th>Account entered</th><th className="num">Amount</th><th>Reason</th>
                <th>{status === 'UNMATCHED' ? '' : 'Assigned to'}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id} className={now - u.receivedAt < 8000 ? 'flash' : ''}>
                  <td className="muted" title={dateTime(u.receivedAt)}>{timeAgo(u.receivedAt, now)}</td>
                  <td className="mono">{u.transId}</td>
                  {user?.role === 'SUPER_ADMIN' && <td className="muted">{companyName(u.companyId)}</td>}
                  <td><b>{u.payerName ?? '—'}</b><div className="faint mono" style={{ fontSize: 11 }}>{u.msisdn ?? ''}</div></td>
                  <td className="mono">{u.billRef ? `“${u.billRef}”` : <span className="faint">blank</span>}</td>
                  <td className="num mono" style={{ fontWeight: 700 }}>{money(u.amount, u.currency)}</td>
                  <td><span className={`pill ${REASON[u.reason]?.tone ?? 'pill-grey'}`} title={REASON[u.reason]?.hint}>{REASON[u.reason]?.label ?? u.reason}</span></td>
                  <td>
                    {u.status === 'UNMATCHED' ? (
                      <button className="btn btn-brass btn-sm" onClick={() => setAssign(u)} id={`assign-open-${u.id}`}><Icon name="table" size={13} /> Assign to table</button>
                    ) : (
                      <span className="muted" style={{ fontSize: 12 }}>{billiardById(u.assignedBilliardId ?? '')?.name ?? u.assignedBilliardId} · {u.resolvedBy ?? '—'}{u.resolvedAt ? ` · ${timeAgo(u.resolvedAt, now)}` : ''}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <div className="empty"><Icon name="check" size={22} /><div style={{ marginTop: 8 }}>{status === 'UNMATCHED' ? 'Every M-Pesa payment is matched.' : 'Nothing assigned yet.'}</div></div>}
        </div>
      </div>

      <MpesaSimulator companyId={user?.role === 'SUPER_ADMIN' ? undefined : user?.companyId} />
      {assign && <AssignModal u={assign} onClose={() => setAssign(null)} />}
    </>
  );
}
