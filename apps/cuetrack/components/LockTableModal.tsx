"use client";

import { useState } from 'react';
import { Modal } from '@/components/overlays';
import { Icon } from '@/components/Icon';
import { useStore } from '@/context/Store';
import { Billiard } from '@/lib/types';

const REASONS = ['Maintenance', 'Closed for the day', 'Reserved', 'Payment dispute'];

/** Lock (with optional reason shown on the table screen) or unlock a table. */
export function LockTableModal({ b, onClose }: { b: Billiard; onClose: () => void }) {
  const { toggleLock } = useStore();
  const locking = b.status !== 'LOCKED';
  const playing = !!b.currentGame || b.status === 'IN_PLAY';
  const [reason, setReason] = useState('');

  const confirm = () => {
    toggleLock(b.id, locking ? reason.trim() || undefined : undefined);
    onClose();
  };

  return (
    <Modal
      title={locking ? `Lock ${b.name}?` : `Unlock ${b.name}?`}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button id="lock-confirm" className={`btn ${locking ? 'btn-danger' : 'btn-brass'}`} disabled={locking && playing} onClick={confirm}>
            <Icon name={locking ? 'lock' : 'unlock'} size={14} /> {locking ? 'Lock table' : 'Unlock table'}
          </button>
        </>
      }
    >
      {locking ? (
        <>
          {playing && (
            <div className="hint" style={{ color: 'var(--danger)', marginBottom: 12 }}>
              <Icon name="lock" size={13} /> A game is in progress. End it first, then lock the table.
            </div>
          )}
          <p className="muted" style={{ marginTop: 0 }}>
            No balls are released and no remote credits are accepted. The table screen shows <b>LOCKED</b>.
            M-Pesa payments made while locked are kept as credit and start when you unlock.
          </p>
          <div className="field">
            <label htmlFor="lock-reason">Reason (shown on the table screen)</label>
            <div className="chips" style={{ marginBottom: 8 }}>
              {REASONS.map((r) => (
                <button key={r} className={`chip ${reason === r ? 'active' : ''}`} onClick={() => setReason(r)}>{r}</button>
              ))}
            </div>
            <input id="lock-reason" className="input" maxLength={32} placeholder="Optional, e.g. Cloth repair" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </>
      ) : (
        <p className="muted" style={{ marginTop: 0 }}>
          Players can start games again.{b.credits > 0 ? ` ${b.credits} credit${b.credits === 1 ? '' : 's'} waiting will start automatically in AUTO mode.` : ''}
          {b.lockReason ? <><br />Locked for: <b>{b.lockReason}</b>{b.lockedBy ? ` (by ${b.lockedBy})` : ''}</> : null}
        </p>
      )}
    </Modal>
  );
}
