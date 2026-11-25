'use client';

import { useState } from 'react';
import type { InviteCredentials } from '@/context/Store';
import { Modal } from './overlays';
import { Icon } from './Icon';

/** Shows a new user's one-time login once, so the Super Admin can hand it over. */
export function CredentialsModal({ creds, onClose }: { creds: InviteCredentials; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const loginUrl = typeof window !== 'undefined' ? `${window.location.origin}/login` : '/login';
  const text = `CueTrack login for ${creds.name}\n${loginUrl}\nEmail: ${creds.email}\nTemporary password: ${creds.temporaryPassword}\n(You will be asked to choose a new password on first sign-in.)`;

  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal
      title="User created"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={copy} id="copy-credentials">
            <Icon name={copied ? 'check' : 'link'} size={15} /> {copied ? 'Copied' : 'Copy login details'}
          </button>
          <button className="btn btn-brass" onClick={onClose} id="credentials-done">Done</button>
        </>
      }
    >
      <p className="faint" style={{ marginTop: 0 }}>
        Share these details with <b style={{ color: 'var(--text)' }}>{creds.name}</b>. The temporary password is shown
        only once and must be changed at first sign-in.
      </p>
      <div className="field"><label>Email</label><input className="input mono" readOnly value={creds.email} id="cred-email" /></div>
      <div className="field">
        <label>Temporary password</label>
        <input className="input mono" readOnly value={creds.temporaryPassword} id="cred-password" onFocus={(e) => e.currentTarget.select()} />
      </div>
    </Modal>
  );
}
