"use client";

import { useMemo, useState } from 'react';
import { useStore } from '@/context/Store';
import type { TableStatus } from '@/lib/types';
import { STATUS_LABEL } from '@/lib/types';
import { BilliardCard } from '@/components/BilliardCard';
import { ActivityFeed, Modal } from '@/components/overlays';
import { Icon } from '@/components/Icon';

const FILTERS: ('ALL' | TableStatus)[] = ['ALL', 'IN_PLAY', 'IDLE', 'OFFLINE', 'LOCKED'];

export default function BilliardsPage() {
  const { user, billiards, activity, companies, can, companyName, addBilliard, branchesOf } = useStore();
  const [status, setStatus] = useState<'ALL' | TableStatus>('ALL');
  const [branch, setBranch] = useState('ALL');
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);

  const branches = useMemo(() => {
    const m = new Map<string, { id: string; label: string; n: number }>();
    for (const b of billiards) {
      const cur = m.get(b.branchId);
      if (cur) cur.n++;
      else m.set(b.branchId, { id: b.branchId, label: user?.role === 'SUPER_ADMIN' ? `${companyName(b.companyId)} · ${b.branchName ?? b.branch}` : (b.branchName ?? b.branch), n: 1 });
    }
    return Array.from(m.values());
  }, [billiards, user?.role, companyName]);
  const list = billiards.filter(
    (b) =>
      (status === 'ALL' || b.status === status) &&
      (branch === 'ALL' || b.branchId === branch) &&
      (!q || `${b.name} ${b.branch} ${companyName(b.companyId)}`.toLowerCase().includes(q.toLowerCase())),
  );
  const showCompany = user?.role === 'SUPER_ADMIN';

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Billiards</h1>
          <p>
            {user?.role === 'COMPANY_ADMIN'
              ? 'Tables assigned to you. Add credit, release balls or lock a table.'
              : user?.role === 'COMPANY_SUPER_ADMIN'
                ? `Live floor for ${companyName(user.companyId!)}.`
                : 'Every table across all companies.'}
          </p>
        </div>
        {can('BILLIARD_CREATE') && (
          <button className="btn btn-brass" onClick={() => setAdding(true)} id="add-billiard">
            <Icon name="plus" size={16} /> Add billiard
          </button>
        )}
      </div>

      <div className="row row-wrap between">
        <div className="chips">
          {FILTERS.map((f) => (
            <button key={f} className={`chip ${status === f ? 'active' : ''}`} onClick={() => setStatus(f)} id={`filter-${f.toLowerCase()}`}>
              {f === 'ALL' ? 'All' : STATUS_LABEL[f]}
              <span className="n">{f === 'ALL' ? billiards.length : billiards.filter((b) => b.status === f).length}</span>
            </button>
          ))}
        </div>
        <div className="row">
          <label className="search" style={{ display: 'flex', maxWidth: 220 }}>
            <Icon name="search" size={15} />
            <input placeholder="Find a table" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
        </div>
      </div>
      {branches.length > 1 && (
        <div className="chips branch-filter">
          <button className={`chip ${branch === 'ALL' ? 'active' : ''}`} onClick={() => setBranch('ALL')} id="branch-all"><Icon name="pin" size={12} /> All branches</button>
          {branches.map((b) => (
            <button key={b.id} className={`chip ${branch === b.id ? 'active' : ''}`} onClick={() => setBranch(b.id)} id={`branch-${b.id}`}>
              {b.label}<span className="n">{b.n}</span>
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-main-side">
        <div className="billiard-grid">
          {list.map((b) => <BilliardCard key={b.id} b={b} showCompany={showCompany} />)}
          {list.length === 0 && <div className="card empty" style={{ gridColumn: '1/-1' }}>No billiards match these filters.</div>}
        </div>
        <ActivityFeed items={activity} limit={14} />
      </div>

      {adding && user && (
        <AddBilliardModal
          companies={user.role === 'SUPER_ADMIN' ? companies : companies.filter((c) => c.id === user.companyId)}
          onClose={() => setAdding(false)}
          onSave={addBilliard}
          branchesOf={branchesOf}
          nextIndex={billiards.length + 1}
        />
      )}
    </>
  );
}

function AddBilliardModal({
  companies,
  onClose,
  onSave,
  nextIndex,
  branchesOf,
}: {
  branchesOf: (companyId: string) => { id: string; name: string }[];
  companies: { id: string; name: string; branches: string[]; currency?: string }[];
  onClose: () => void;
  onSave: (i: { name: string; companyId: string; branchId: string; tokenPrice: number; accountRef?: string }) => void;
  nextIndex: number;
}) {
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? '');
  const company = companies.find((c) => c.id === companyId);
  const [branch, setBranch] = useState(branchesOf(companyId)[0]?.id ?? '');
  const branchOpts = branchesOf(companyId);
  const [name, setName] = useState(`Table ${String(nextIndex).padStart(2, '0')}`);
  const [price, setPrice] = useState('');
  const [accountRef, setAccountRef] = useState('');
  const priceNum = Number(price);
  const priceOk = price.trim() !== '' && isFinite(priceNum) && priceNum > 0;

  return (
    <Modal
      title="Register a billiard"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-brass"
            id="register-billiard"
            disabled={!name || !companyId || !branch || !priceOk}
            onClick={() => {
              onSave({ name, companyId, branchId: branch, tokenPrice: priceNum, accountRef: accountRef.trim() || undefined });
              onClose();
            }}
          >
            Register billiard
          </button>
        </>
      }
    >
      <div className="field">
        <label>Table name</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      {companies.length > 1 && (
        <div className="field">
          <label>Company</label>
          <select className="select" value={companyId} onChange={(e) => { setCompanyId(e.target.value); setBranch(branchesOf(e.target.value)[0]?.id ?? ''); }}>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}
      <div className="field">
        <label>Branch</label>
        <select className="select" value={branch} onChange={(e) => setBranch(e.target.value)}>
          {branchOpts.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        {branchOpts.length === 0 && <span className="hint">Add a branch to this company first (Companies → Branches).</span>}
      </div>
      <div className="field">
        <label htmlFor="new-token-price">Token price ({company?.currency ?? 'KES'}) *</label>
        <input id="new-token-price" className="input mono" type="number" min={1} required placeholder={company?.currency === 'RWF' ? 'e.g. 500' : 'e.g. 50'} value={price} onChange={(e) => setPrice(e.target.value)} />
        <span className="hint">Price of one game. Required; channels can be configured after registration.</span>
      </div>
      <div className="field">
        <label htmlFor="new-account-ref">Account reference (optional)</label>
        <input id="new-account-ref" className="input mono" placeholder="e.g. DTC-T07" value={accountRef} onChange={(e) => setAccountRef(e.target.value)} />
        <span className="hint">Shown to players as the paybill / MoMo account number.</span>
      </div>
      <p className="hint" style={{ margin: 0 }}>
        The table starts <b>offline</b> until its ESP8266 controller connects with the generated device credentials.
      </p>
    </Modal>
  );
}
