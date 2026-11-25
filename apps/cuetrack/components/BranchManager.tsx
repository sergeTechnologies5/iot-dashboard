"use client";

import { useState } from 'react';
import { useStore } from '@/context/Store';
import { Icon } from './Icon';
import { Confirm } from './overlays';
import type { Branch } from '@/lib/types';

function BranchRow({ br, editable }: { br: Branch; editable: boolean }) {
  const { updateBranch, deleteBranch } = useStore();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(br.name);
  const [location, setLocation] = useState(br.location ?? '');
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const save = async () => {
    setBusy(true);
    const ok = await updateBranch(br.id, { name: name.trim(), location: location.trim() || null });
    setBusy(false);
    if (ok) setEditing(false);
  };
  return (
    <div className="branch-row">
      <span className="branch-ico"><Icon name="pin" size={15} /></span>
      {editing ? (
        <div className="row" style={{ flex: 1, gap: 8, flexWrap: 'wrap' }}>
          <input className="input" style={{ flex: '1 1 140px' }} value={name} onChange={(e) => setName(e.target.value)} id={`br-name-${br.id}`} aria-label="Branch name" />
          <input className="input" style={{ flex: '1 1 140px' }} value={location} placeholder="Location (optional)" onChange={(e) => setLocation(e.target.value)} aria-label="Location" />
        </div>
      ) : (
        <div style={{ flex: 1, minWidth: 0 }}>
          <b>{br.name}</b>
          <div className="faint" style={{ fontSize: 12 }}>{br.location || 'No location'} · {br.tableCount} table{br.tableCount === 1 ? '' : 's'}</div>
        </div>
      )}
      {editable && (
        <div className="row" style={{ gap: 6 }}>
          {editing ? (
            <>
              <button className="btn btn-ghost btn-sm" onClick={() => { setEditing(false); setName(br.name); setLocation(br.location ?? ''); }}>Cancel</button>
              <button className="btn btn-brass btn-sm" disabled={!name.trim() || busy} onClick={save} id={`br-save-${br.id}`}>{busy ? <span className="spinner" /> : <Icon name="check" size={13} />} Save</button>
            </>
          ) : (
            <>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)} id={`br-edit-${br.id}`}>Rename</button>
              <button className="btn btn-ghost btn-sm" disabled={br.tableCount > 0} title={br.tableCount > 0 ? 'Move or remove its tables first' : 'Delete branch'} onClick={() => setConfirmDel(true)} id={`br-del-${br.id}`}><Icon name="trash" size={13} /></button>
            </>
          )}
        </div>
      )}
      {confirmDel && (
        <Confirm title={`Delete ${br.name}?`} body="The branch will be removed. Paybills/Tills serving it will no longer list it." confirmLabel="Delete branch" danger onConfirm={() => deleteBranch(br.id)} onClose={() => setConfirmDel(false)} />
      )}
    </div>
  );
}

/** Branches of one company: list, add, rename, delete. CSA (own company) and Super Admin. */
export function BranchManager({ companyId }: { companyId: string }) {
  const { user, branchesOf, addBranch } = useStore();
  const editable = user?.role === 'SUPER_ADMIN' || (user?.role === 'COMPANY_SUPER_ADMIN' && user.companyId === companyId);
  const list = branchesOf(companyId);
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [busy, setBusy] = useState(false);
  const add = async () => {
    setBusy(true);
    const ok = await addBranch(companyId, { name: name.trim(), location: location.trim() || null });
    setBusy(false);
    if (ok) { setName(''); setLocation(''); }
  };
  return (
    <div className="branch-list">
      {list.map((br) => <BranchRow key={`${br.id}-${br.name}-${br.location}`} br={br} editable={editable} />)}
      {list.length === 0 && <div className="faint" style={{ fontSize: 13 }}>No branches yet.</div>}
      {editable && (
        <div className="branch-row branch-add">
          <span className="branch-ico"><Icon name="plus" size={15} /></span>
          <input className="input" style={{ flex: '1 1 140px' }} placeholder="New branch name" value={name} onChange={(e) => setName(e.target.value)} id="br-new-name" />
          <input className="input" style={{ flex: '1 1 140px' }} placeholder="Location (optional)" value={location} onChange={(e) => setLocation(e.target.value)} id="br-new-location" />
          <button className="btn btn-brass btn-sm" disabled={!name.trim() || busy} onClick={add} id="br-add">{busy ? <span className="spinner" /> : <Icon name="plus" size={13} />} Add</button>
        </div>
      )}
    </div>
  );
}
