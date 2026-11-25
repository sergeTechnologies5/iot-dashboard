'use client';

import { useState } from 'react';
import type { InviteCredentials } from '@/context/Store';
import type { Role, User } from '@/lib/types';
import { ROLE_LABEL } from '@/lib/types';
import { Modal } from './overlays';
import { CredentialsModal } from './CredentialsModal';

/**
 * Edit a user's name / email, and (for users you manage, never yourself) their role.
 * `roles` = roles the current actor may assign; pass [] to hide the role picker.
 */
export function EditUserDialog({
  target,
  self,
  roles,
  onClose,
  onSave,
  onResetPassword,
}: {
  target: User;
  self: boolean;
  roles: Role[];
  onClose: () => void;
  onSave: (input: { name: string; email: string; role?: Role }) => Promise<boolean>;
  onResetPassword?: () => Promise<InviteCredentials | null>;
}) {
  const [name, setName] = useState(target.name);
  const [email, setEmail] = useState(target.email);
  const [role, setRole] = useState<Role>(target.role);
  const [busy, setBusy] = useState(false);
  const [creds, setCreds] = useState<InviteCredentials | null>(null);

  if (creds) return <CredentialsModal creds={creds} onClose={onClose} />;

  const canChangeRole = !self && roles.length > 1 && roles.includes(target.role);
  const dirty = name.trim() !== target.name || email.trim().toLowerCase() !== target.email.toLowerCase() || role !== target.role;
  const valid = name.trim() && /\S+@\S+\.\S+/.test(email);

  const save = async () => {
    setBusy(true);
    const ok = await onSave({ name: name.trim(), email: email.trim(), role: canChangeRole ? role : undefined });
    setBusy(false);
    if (ok) onClose();
  };

  const reset = async () => {
    if (!onResetPassword || !confirm(`Issue a new temporary password for ${target.name}? Their current password stops working.`)) return;
    setBusy(true);
    const res = await onResetPassword();
    setBusy(false);
    if (res) setCreds({ ...res, name: res.name || target.name, email: res.email || target.email });
  };

  return (
    <Modal
      title={self ? 'Edit my details' : `Edit ${target.name}`}
      onClose={onClose}
      footer={
        <>
          {onResetPassword && !self && (
            <button className="btn btn-ghost" onClick={reset} disabled={busy} id="reset-password" style={{ marginRight: 'auto' }}>
              Reset password
            </button>
          )}
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-brass" onClick={save} disabled={!valid || !dirty || busy} id="save-user">
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </>
      }
    >
      <div className="field"><label htmlFor="edit-name">Full name</label><input id="edit-name" className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div className="field">
        <label htmlFor="edit-email">Email (used to sign in)</label>
        <input id="edit-email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      {canChangeRole && (
        <div className="field">
          <label>Role</label>
          <div className="segmented" style={{ alignSelf: 'flex-start', flexWrap: 'wrap' }}>
            {roles.map((r) => <button key={r} className={role === r ? 'active' : ''} onClick={() => setRole(r)}>{ROLE_LABEL[r]}</button>)}
          </div>
        </div>
      )}
      {self && <p className="faint" style={{ margin: 0, fontSize: 12 }}>Your role can only be changed by someone else.</p>}
    </Modal>
  );
}
