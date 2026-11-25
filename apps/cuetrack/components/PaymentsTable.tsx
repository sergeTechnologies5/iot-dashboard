"use client";

import { Fragment, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/context/Store';
import { dateTime, money, time } from '@/lib/format';
import { fmtDuration, paymentUsage } from '@/lib/games';
import type { Game, Payment } from '@/lib/types';
import { Icon } from './Icon';
import { ChannelBadge, PayStatusPill } from './ui';
import { Confirm } from './overlays';

export function PaymentsTable({ rows, showBilliard = true, showCompany = false, pageSize = 12 }: { rows: Payment[]; showBilliard?: boolean; showCompany?: boolean; pageSize?: number }) {
  const { billiardById, companyName, can, reversePayment, now, games, paymentGames } = useStore();
  const router = useRouter();
  const [page, setPage] = useState(0);
  const [reverse, setReverse] = useState<Payment | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [fetched, setFetched] = useState<Record<string, Game[]>>({});
  const toggle = (p: Payment) => {
    const next = open === p.id ? null : p.id;
    setOpen(next);
    if (next) paymentGames(p.id).then((g) => setFetched((m) => ({ ...m, [p.id]: g }))).catch(() => undefined);
  };
  const usageOf = (p: Payment) => {
    const extra = fetched[p.id] ?? [];
    const ids = new Set(extra.map((g) => g.id));
    return paymentUsage(p, [...extra, ...games.filter((g) => g.paymentId === p.id && !ids.has(g.id))]);
  };
  const cols = 8 + (showBilliard ? 1 : 0) + (showCompany ? 1 : 0) + (can('PAYMENT_REVERSE') ? 1 : 0);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, pages - 1);
  const slice = useMemo(() => rows.slice(current * pageSize, current * pageSize + pageSize), [rows, current, pageSize]);

  return (
    <>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th style={{ width: 28 }} />
              <th>Date &amp; time</th>
              {showBilliard && <th>Billiard</th>}
              {showCompany && <th>Company</th>}
              <th>Channel</th>
              <th>Reference</th>
              <th className="num">Tokens</th>
              <th className="num">Amount</th>
              <th>Received by</th>
              <th>Status</th>
              {can('PAYMENT_REVERSE') && <th />}
            </tr>
          </thead>
          <tbody>
            {slice.map((p) => {
              const b = billiardById(p.billiardId);
              const isOpen = open === p.id;
              const u = isOpen ? usageOf(p) : null;
              return (
                <Fragment key={p.id}>
                <tr className={`${now - p.at < 6000 ? 'flash' : ''} ${isOpen ? 'row-open' : ''}`}>
                  <td>
                    <button className="btn btn-ghost btn-sm expand-btn" onClick={() => toggle(p)} aria-expanded={isOpen} title="Where did this money go?" id={`expand-${p.id}`}>
                      <Icon name="chevronRight" size={13} style={{ transform: isOpen ? 'rotate(90deg)' : undefined, transition: 'transform .2s' }} />
                    </button>
                  </td>
                  <td className="muted">{dateTime(p.at)}</td>
                  {showBilliard && (
                    <td>
                      <a className="row" style={{ gap: 6, cursor: 'pointer' }} onClick={() => router.push(`/billiards/${p.billiardId}`)}>
                        <b>{b?.name}</b>
                        <span className="faint">{b?.branch}</span>
                      </a>
                    </td>
                  )}
                  {showCompany && <td className="muted">{companyName(p.companyId)}</td>}
                  <td>
                    <div className="row" style={{ gap: 6 }}>
                      <ChannelBadge channel={p.channel} />
                      <span className="faint" style={{ fontSize: 11 }}>{p.mode === 'MANUAL' ? 'Manual' : 'Online'}</span>
                    </div>
                    {p.payerMsisdn && <div className="faint mono" style={{ fontSize: 11, marginTop: 3 }}>{p.payerMsisdn}</div>}
                  </td>
                  <td className="mono muted" title={p.note ?? (p.externalRef ? `Receipt ${p.externalRef}` : undefined)}>{p.reference}{p.note && <Icon name="mail" size={12} style={{ marginLeft: 6, verticalAlign: -1 }} />}{p.externalRef && p.externalRef !== p.reference && <div className="receipt-tag" title="M-Pesa / provider receipt"><Icon name="check" size={10} strokeWidth={3} /> {p.externalRef}</div>}</td>
                  <td className="num mono">{p.tokens}</td>
                  <td className="num mono" style={{ fontWeight: 600, textDecoration: p.status === 'REVERSED' || p.status === 'FAILED' ? 'line-through' : undefined, opacity: p.status === 'COMPLETED' ? 1 : 0.6 }}>
                    {money(p.amount, p.currency)}
                  </td>
                  <td className="muted">{p.receivedBy}</td>
                  <td><PayStatusPill status={p.status} /></td>
                  {can('PAYMENT_REVERSE') && (
                    <td>
                      {p.mode === 'MANUAL' && p.status === 'COMPLETED' && (
                        <button className="btn btn-ghost btn-sm" onClick={() => setReverse(p)} title="Reverse payment">
                          <Icon name="undo" size={14} />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
                {isOpen && u && (
                  <tr className="usage-row">
                    <td colSpan={cols}>
                      <div className="usage">
                        <div className="usage-kpis">
                          <div><span>Bought</span><b className="mono">{p.games ?? p.tokens}</b></div>
                          <div><span>Played</span><b className="mono">{u.played}</b></div>
                          <div><span>In play</span><b className="mono" style={{ color: 'var(--felt-2)' }}>{u.inPlay}</b></div>
                          <div><span>Remaining</span><b className="mono" style={{ color: 'var(--brass-2)' }}>{u.remaining}</b></div>
                          <div><span>Per game</span><b className="mono">{money(u.unitPrice, p.currency)}</b></div>
                          {p.pricingRule && <div><span>Pricing</span><b>{p.pricingRule.name}</b></div>}
                        </div>
                        <div className="usage-track">
                          {Array.from({ length: Math.max(p.games ?? p.tokens, u.games.length) }, (_, i) => {
                            const g = u.games[i];
                            const cls = !g ? 'left' : g.status === 'IN_PLAY' || g.status === 'RELEASING' ? 'live' : g.status === 'FAILED' ? 'fail' : 'done';
                            return (
                              <span key={i} className={`ut ${cls}`} title={g ? `${g.status} · ${time(g.startedAt ?? g.requestedAt)} · ${fmtDuration(g.durationSec)}` : 'Unused credit'}>
                                {i + 1}
                              </span>
                            );
                          })}
                        </div>
                        {u.games.length > 0 && (
                          <div className="usage-list">
                            {u.games.map((g, i) => (
                              <div key={g.id} className="faint" style={{ fontSize: 12 }}>
                                Game {i + 1}: {time(g.startedAt ?? g.requestedAt)} · {g.status === 'IN_PLAY' ? 'in play' : fmtDuration(g.durationSec)} · released by {g.releasedBy}{g.endedBy ? ` · ended by ${g.endedBy}` : ''}
                              </div>
                            ))}
                          </div>
                        )}
                        {p.status === 'COMPLETED' && p.mode === 'MANUAL' && u.remaining > 0 && (
                          <div className="hint">Reversing now would remove {u.remaining} unused credit{u.remaining === 1 ? '' : 's'} (≈ {money(u.remaining * u.unitPrice, p.currency)}); games already played stay on record.</div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <div className="empty">No payments match the filters</div>}
      </div>
      {rows.length > pageSize && (
        <div className="row between" style={{ padding: '14px 16px' }}>
          <span className="faint" style={{ fontSize: 12 }}>
            {current * pageSize + 1}–{Math.min(rows.length, (current + 1) * pageSize)} of {rows.length}
          </span>
          <div className="row">
            <button className="btn btn-sm" disabled={current === 0} onClick={() => setPage(current - 1)}>Previous</button>
            <span className="faint mono" style={{ fontSize: 12 }}>{current + 1}/{pages}</span>
            <button className="btn btn-sm" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>Next</button>
          </div>
        </div>
      )}
      {reverse && (
        <Confirm
          title="Reverse manual payment?"
          body={<>This marks <b className="mono">{reverse.reference}</b> ({money(reverse.amount, reverse.currency)}) as reversed and removes it from revenue. {usageOf(reverse).remaining} unused credit(s) will be taken off the table. This action is logged.</>}
          confirmLabel="Reverse payment"
          danger
          onConfirm={() => reversePayment(reverse.id)}
          onClose={() => setReverse(null)}
        />
      )}
    </>
  );
}
