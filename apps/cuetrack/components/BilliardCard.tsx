"use client";

import { useState } from 'react';
import Link from 'next/link';
import { useStore } from '@/context/Store';
import { duration, money, startOfDay, sumBy, timeAgo } from '@/lib/format';
import type { Billiard } from '@/lib/types';
import { Icon } from './Icon';
import { LastSeen, PresenceDot } from './DevicePresence';
import { Avatar, FeltTable, SplitBar, StatusPill } from './ui';
import { LockTableModal } from './LockTableModal';
import { TableQrModal } from './TableQrModal';
import { RecordPaymentDrawer } from './RecordPaymentDrawer';

export function CreditDots({ credits, free, max = 10 }: { credits: number; free: number; max?: number }) {
  const total = credits + free;
  const shown = Math.min(total, max);
  return (
    <span className="credit-dots" title={`${credits} paid · ${free} free credit${free === 1 ? '' : 's'}`}>
      {Array.from({ length: shown }, (_, i) => (
        <i key={i} className={i < Math.min(free, shown) ? 'free' : ''} />
      ))}
      {total > max && <em>+{total - max}</em>}
      {total === 0 && <em>no credits</em>}
    </span>
  );
}

export function BilliardCard({ b, showCompany }: { b: Billiard; showCompany?: boolean }) {
  const { now, payments, games, adminOf, companyName, releaseBalls, endGame, can } = useStore();
  const [confirmLock, setConfirmLock] = useState(false);
  const [credit, setCredit] = useState(false);
  const [qr, setQr] = useState(false);
  const cur = b.currentGame ?? null;
  const batch = cur ? games.filter((g) => g.batchId === cur.batchId && g.status !== 'FAILED').sort((a, z) => a.requestedAt - z.requestedAt) : [];
  const gameN = cur ? Math.max(1, batch.findIndex((g) => g.id === cur.id) + 1) : 0;
  const gameM = cur ? Math.max(gameN, batch.length) + b.credits + (b.freeCredits ?? 0) : 0;
  const startedAt = cur?.startedAt ?? b.startedAt;
  const today = sumBy(payments.filter((p) => p.billiardId === b.id && p.at >= startOfDay(now)));
  const admin = adminOf(b.id);
  const controllable = can('BILLIARD_CONTROL');
  const offline = b.status === 'OFFLINE';
  const locked = b.status === 'LOCKED';

  return (
    <div className={`card bcard s-${b.status}`}>
      <Link href={`/billiards/${b.id}`} id={`billiard-${b.id}`}>
        <FeltTable status={b.status} label={b.name}>
          <span className="status">
            {b.pending ? (
              <span className="pill pill-grey">
                <span className="spinner" /> Sending
              </span>
            ) : (
              <StatusPill status={b.status} />
            )}
          </span>
          {b.status === 'LOCKED' && (b.lockReason || b.lockedBy) && (
            <span className="hint" style={{ color: 'var(--amber)' }} title={b.lockedAt ? new Date(b.lockedAt).toLocaleString() : undefined}>
              {b.lockReason ?? 'Locked'}{b.lockedBy ? ` · ${b.lockedBy}` : ''}
            </span>
          )}
          {b.status === 'IN_PLAY' && startedAt && (
            <span className={`timer${cur?.free ? ' gold' : ''}`}>
              {duration(now - startedAt)}
              {cur && <small> · Game {gameN} of {gameM}</small>}
            </span>
          )}
          {offline && <span className="timer" style={{ color: 'var(--danger)' }}>seen {timeAgo(b.lastSeen, now)}</span>}
          <span className="credits">
            <Icon name="coins" size={11} style={{ verticalAlign: -1 }} /> {b.credits}
          </span>
        </FeltTable>
      </Link>

      <div className="bcard-strip">
        <CreditDots credits={b.credits} free={b.freeCredits ?? 0} />
        <span className={`mode-badge ${b.releaseMode === 'AUTO' ? 'auto' : ''}`} title={b.releaseMode === 'AUTO' ? 'Balls release automatically when credit arrives' : 'Staff release balls manually'}>
          {b.releaseMode === 'AUTO' ? 'AUTO' : 'MANUAL'}
        </span>
      </div>

      <div className="bcard-meta">
        <div>
          <div className="faint" style={{ fontSize: 12 }}>Today&apos;s revenue</div>
          <div className="rev mono">{money(today.total, b.currency)}</div>
        </div>
        <div style={{ textAlign: 'right', fontSize: 12 }} className="muted">
          {showCompany ? `${companyName(b.companyId)} · ${b.branchName ?? b.branch}` : (b.branchName ?? b.branch)}
          <div className="faint">{money(b.tokenPrice, b.currency)}/game</div>
        </div>
      </div>
      <SplitBar manual={today.manual} online={today.online} />

      <div className="bcard-foot">
        {admin ? (
          <>
            <Avatar name={admin.name} size="sm" /> {admin.name}
          </>
        ) : (
          <span className="faint">Unassigned</span>
        )}
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <PresenceDot b={b} size={8} /> <LastSeen b={b} compact />
        </span>
        <button className="btn btn-sm btn-ghost icon-btn qr-btn" id={`qr-${b.id}`} onClick={() => setQr(true)} title="Show pay QR code" aria-label="Show pay QR code">
          <QrGlyph />
        </button>
      </div>

      {controllable && (
        <div className="bcard-actions">
          <button className="btn btn-sm btn-brass" disabled={offline || locked || !!b.pending} title={locked ? "Table is locked" : undefined} onClick={() => setCredit(true)} id={`credit-${b.id}`}>
            <Icon name="plus" size={14} /> <span className="lbl">Credit</span>
          </button>
          {cur ? (
            <button className="btn btn-sm btn-ghost" disabled={!!b.pending} onClick={() => endGame(cur.id)} id={`end-${b.id}`} title="End the game in progress">
              <Icon name="stop" size={14} /> <span className="lbl">End game</span>
            </button>
          ) : (
            <button className="btn btn-sm btn-felt" disabled={offline || b.status === 'LOCKED' || b.credits + (b.freeCredits ?? 0) < 1 || !!b.pending} onClick={() => releaseBalls(b.id)} title={b.credits + (b.freeCredits ?? 0) < 1 ? 'No credits' : 'Release balls'}>
              <Icon name="release" size={14} /> <span className="lbl">Release</span>
            </button>
          )}
          <button className="btn btn-sm icon-btn" style={{ width: 34, height: 32 }} disabled={offline || !!b.pending} onClick={() => setConfirmLock(true)} title={b.status === 'LOCKED' ? 'Unlock' : 'Lock'}>
            <Icon name={b.status === 'LOCKED' ? 'unlock' : 'lock'} size={14} />
          </button>
        </div>
      )}

      {confirmLock && <LockTableModal b={b} onClose={() => setConfirmLock(false)} />}
      {qr && <TableQrModal b={b} onClose={() => setQr(false)} />}
      {credit && <RecordPaymentDrawer billiardId={b.id} onClose={() => setCredit(false)} />}
    </div>
  );
}

/** Small QR icon (no QR glyph in the icon set). */
export function QrGlyph({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3" />
    </svg>
  );
}
