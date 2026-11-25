"use client";

import { useState } from 'react';
import { useStore } from '@/context/Store';
import type { Role, User } from '@/lib/types';
import { ROLE_LABEL } from '@/lib/types';
import { Avatar, StatusPill } from '@/components/ui';
import { Modal } from '@/components/overlays';
import { Icon } from '@/components/Icon';
import { InviteDialog } from '@/components/InviteDialog';
import { EditUserDialog } from '@/components/EditUserDialog';

export default function UsersPage() {
  const { user, users, allUsers, companies, can, companyName, inviteUser, setAssignments, updateUser, resetUserPassword } = useStore();
  const [assigning, setAssigning] = useState<User | null>(null);
  const [editing, setEditing] = useState<User | null>(null);
  const [inviting, setInviting] = useState(false);
  const [roleFilter, setRoleFilter] = useState<'ALL' | Role>('ALL');

  if (!user || !can('USER_MANAGE')) return <div className="card empty">You don&apos;t have access to user management.</div>;

  const list = users.filter((u) => roleFilter === 'ALL' || u.role === roleFilter);
  const roles: Role[] = user.role === 'SUPER_ADMIN' ? ['SUPER_ADMIN', 'COMPANY_SUPER_ADMIN', 'COMPANY_ADMIN'] : ['COMPANY_SUPER_ADMIN', 'COMPANY_ADMIN'];
  // mirrors the backend rule: yourself, anyone (Super Admin), or non-platform users of your company (Company Super Admin)
  const canEdit = (u: User) =>
    u.id === user.id || user.role === 'SUPER_ADMIN' || (user.role === 'COMPANY_SUPER_ADMIN' && u.role !== 'SUPER_ADMIN' && u.companyId === user.companyId);
  // roles assignable to a given user: platform users stay platform, company users stay in company roles
  const rolesFor = (u: User): Role[] => (u.role === 'SUPER_ADMIN' ? [] : ['COMPANY_SUPER_ADMIN', 'COMPANY_ADMIN']);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Users &amp; Access</h1>
          <p>{user.role === 'SUPER_ADMIN' ? 'Manage everyone on the platform.' : `Manage admins at ${companyName(user.companyId!)} and the billiards they control.`}</p>
        </div>
        <button className="btn btn-brass" onClick={() => setInviting(true)} id="invite-user"><Icon name="mail" size={16} /> Invite user</button>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0,1fr))' }}>
        {([
          ['SUPER_ADMIN', 'Sees all billiards for all companies', 'shield'],
          ['COMPANY_SUPER_ADMIN', 'Sees all billiards in their company', 'building'],
          ['COMPANY_ADMIN', 'Sees only billiards assigned to them', 'table'],
        ] as const).map(([r, d, i]) => (
          <button key={r} className={`card card-pad ${roleFilter === r ? '' : ''}`} style={{ textAlign: 'left', borderColor: roleFilter === r ? 'rgba(212,173,85,.5)' : undefined, cursor: 'pointer' }} onClick={() => setRoleFilter(roleFilter === r ? 'ALL' : r)}>
            <div className="row between">
              <span className="kpi-icon" style={{ color: 'var(--brass-2)' }}><Icon name={i} size={17} /></span>
              <b className="mono" style={{ fontSize: 22 }}>{users.filter((u) => u.role === r).length}</b>
            </div>
            <h3 style={{ marginTop: 12, fontSize: 14 }}>{ROLE_LABEL[r]}</h3>
            <div className="faint" style={{ fontSize: 12, marginTop: 4 }}>{d}</div>
          </button>
        ))}
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr><th>User</th><th>Role</th>{user.role === 'SUPER_ADMIN' && <th>Company</th>}<th>Billiard access</th><th /></tr>
            </thead>
            <tbody>
              {list.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div className="row">
                      <Avatar name={u.name} />
                      <div><b>{u.name}</b>{u.id === user.id && <span className="pill pill-grey" style={{ marginLeft: 8, fontSize: 10 }}>You</span>}<div className="faint" style={{ fontSize: 12 }}>{u.email}</div></div>
                    </div>
                  </td>
                  <td><span className={`pill ${u.role === 'SUPER_ADMIN' ? 'pill-info' : u.role === 'COMPANY_SUPER_ADMIN' ? 'pill-brass' : 'pill-felt'}`}>{ROLE_LABEL[u.role]}</span></td>
                  {user.role === 'SUPER_ADMIN' && <td className="muted">{u.companyId ? companyName(u.companyId) : 'Platform'}</td>}
                  <td className="muted">
                    {u.role === 'SUPER_ADMIN' ? 'All companies' : u.role === 'COMPANY_SUPER_ADMIN' ? 'Whole company' : `${u.assigned.length} assigned billiard${u.assigned.length === 1 ? '' : 's'}`}
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {u.role === 'COMPANY_ADMIN' && can('BILLIARD_ASSIGN') && (
                      <button className="btn btn-sm" onClick={() => setAssigning(u)} id={`assign-${u.id}`}><Icon name="link" size={14} /> Assign billiards</button>
                    )}
                    {canEdit(u) && (
                      <button className="btn btn-sm" style={{ marginLeft: 6 }} onClick={() => setEditing(u)} id={`edit-${u.id}`}><Icon name="settings" size={14} /> Edit</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {assigning && <AssignDialog target={assigning} onClose={() => setAssigning(null)} onSave={(ids) => setAssignments(assigning.id, ids)} allUsers={allUsers} />}
      {editing && (
        <EditUserDialog
          target={editing}
          self={editing.id === user.id}
          roles={rolesFor(editing)}
          onClose={() => setEditing(null)}
          onSave={(input) => updateUser(editing.id, input)}
          onResetPassword={editing.id === user.id ? undefined : () => resetUserPassword(editing.id)}
        />
      )}
      {inviting && (
        <InviteDialog
          roles={roles}
          companies={user.role === 'SUPER_ADMIN' ? companies : companies.filter((c) => c.id === user.companyId)}
          onClose={() => setInviting(false)}
          onSave={inviteUser}
        />
      )}
    </>
  );
}

function AssignDialog({ target, onClose, onSave, allUsers }: { target: User; onClose: () => void; onSave: (ids: string[]) => void; allUsers: User[] }) {
  const { billiardById } = useStore();
  const { billiards: visible } = useStore();
  const candidates = visible.filter((b) => b.companyId === target.companyId);
  const [sel, setSel] = useState<string[]>(target.assigned);
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const ownerOf = (id: string) => allUsers.find((u) => u.id !== target.id && u.role === 'COMPANY_ADMIN' && u.assigned.includes(id));

  return (
    <Modal
      title={<>Assign billiards to {target.name}</>}
      onClose={onClose}
      footer={
        <>
          <span className="faint" style={{ marginRight: 'auto', fontSize: 12 }}>{sel.length} selected</span>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-brass" onClick={() => { onSave(sel); onClose(); }} id="save-assignments">Save assignments</button>
        </>
      }
    >
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        {target.name} will only see and control the billiards selected here. A billiard has one Company Admin, so selecting one assigned to someone else moves it.
      </p>
      <div className="check-list">
        {candidates.map((b) => {
          const other = ownerOf(b.id);
          const on = sel.includes(b.id);
          return (
            <div key={b.id} className={`check-item ${on ? 'on' : ''}`} onClick={() => toggle(b.id)} role="checkbox" aria-checked={on}>
              <span className="check-box">{on && <Icon name="check" size={13} strokeWidth={3} />}</span>
              <div style={{ flex: 1 }}>
                <b>{billiardById(b.id)?.name}</b>
                <div className="faint" style={{ fontSize: 12 }}>{b.branch}{other && !on ? ` · currently ${other.name}` : ''}</div>
              </div>
              <StatusPill status={b.status} />
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

