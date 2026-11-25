'use client';

import { useState } from 'react';
import type { InviteCredentials } from '@/context/Store';
import type { Role } from '@/lib/types';
import { ROLE_LABEL } from '@/lib/types';
import { Modal } from './overlays';
import { CredentialsModal } from './CredentialsModal';

type InviteInput = { name: string; email: string; role: Role; companyId?: string };

/**
 * Create a user, then show their one-time login. `initialRole` / `lockCompanyId` let the Companies page
 * open it as "add the first Company Super Admin" for a specific company.
 */
export function InviteDialog({
  roles,
  companies,
  onClose,
  onSave,
  initialRole,
  lockCompanyId,
  title = 'Invite user',
}: {
  roles: Role[];
  companies: { id: string; name: string }[];
  onClose: () => void;
  onSave: (i: InviteInput) => Promise<InviteCredentials | null>;
  initialRole?: Role;
  lockCompanyId?: string;
  title?: string;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>(initialRole ?? roles[roles.length - 1]);
  const [companyId, setCompanyId] = useState(lockCompanyId ?? companies[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [creds, setCreds] = useState<InviteCredentials | null>(null);
  const valid = name && /\S+@\S+\.\S+/.test(email) && (role === 'SUPER_ADMIN' || companyId);

  if (creds) return <CredentialsModal creds={creds} onClose={onClose} />;

  const submit = async () => {
    setBusy(true);
    const res = await onSave({ name: name.trim(), email: email.trim(), role, companyId: role === 'SUPER_ADMIN' ? undefined : companyId });
    setBusy(false);
    if (res) setCreds(res); // on failure keep the form open (error toast already shown)
  };

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-brass" id="invite-submit" disabled={!valid || busy} onClick={submit}>
            {busy ? 'Creating…' : 'Create user'}
          </button>
        </>
      }
    >
      <div className="field"><label htmlFor="invite-name">Full name</label><input id="invite-name" className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div className="field"><label htmlFor="invite-email">Email</label><input id="invite-email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      {roles.length > 1 && (
        <div className="field">
          <label>Role</label>
          <div className="segmented" style={{ alignSelf: 'flex-start', flexWrap: 'wrap' }}>
            {roles.map((r) => <button key={r} className={role === r ? 'active' : ''} onClick={() => setRole(r)}>{ROLE_LABEL[r]}</button>)}
          </div>
        </div>
      )}
      {role !== 'SUPER_ADMIN' && !lockCompanyId && companies.length > 1 && (
        <div className="field">
          <label htmlFor="invite-company">Company</label>
          <select id="invite-company" className="select" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}
      {role !== 'SUPER_ADMIN' && companies.length === 0 && (
        <p className="faint" style={{ margin: 0 }}>Create a company first, then add its users.</p>
      )}
    </Modal>
  );
}
