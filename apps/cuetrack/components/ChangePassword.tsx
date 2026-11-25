'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api, DATA_SOURCE } from '@/lib/api';
import { Modal } from './overlays';

/** Self-service password change. `forced` = first login with a seeded/invite password: cannot be dismissed. */
export function ChangePasswordModal({ forced, onDone, onClose }: { forced?: boolean; onDone: () => void; onClose?: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (next.length < 8) return setError('New password must be at least 8 characters.');
    if (next !== confirm) return setError('Passwords do not match.');
    setBusy(true);
    try {
      await api.post('/me/password', { currentPassword: current, newPassword: next });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={forced ? 'Set a new password' : 'Change password'}
      onClose={forced ? () => {} : onClose ?? onDone}
      footer={
        <button className="btn btn-primary" type="submit" form="change-password-form" id="change-password-submit" disabled={busy}>
          {busy ? 'Saving…' : 'Update password'}
        </button>
      }
    >
      <form id="change-password-form" onSubmit={submit}>
        {forced && (
          <p className="faint" style={{ marginTop: 0 }}>
            You signed in with a temporary password. Choose your own password to continue.
          </p>
        )}
        <div className="field">
          <label htmlFor="cp-current">{forced ? 'Temporary password' : 'Current password'}</label>
          <input id="cp-current" className="input" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="cp-new">New password</label>
          <input id="cp-new" className="input" type="password" autoComplete="new-password" minLength={8} value={next} onChange={(e) => setNext(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="cp-confirm">Confirm new password</label>
          <input id="cp-confirm" className="input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        </div>
        {error && <p style={{ color: 'var(--danger, #e5484d)', margin: '8px 0 0' }} role="alert">{error}</p>}
      </form>
    </Modal>
  );
}

/** Blocks the app with the change-password dialog while /me reports mustChangePassword. */
export function PasswordGate({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [forced, setForced] = useState(false);

  useEffect(() => {
    if (DATA_SOURCE !== 'api') return;
    api.get<{ mustChangePassword?: boolean }>('/me')
      .then((m) => setForced(!!m?.mustChangePassword))
      .catch(() => {});
  }, []);

  if (forced) return <ChangePasswordModal forced onDone={() => setForced(false)} />;
  if (open) return <ChangePasswordModal onDone={() => onOpenChange(false)} />;
  return null;
}
