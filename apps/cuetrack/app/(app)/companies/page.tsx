"use client";

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useStore } from '@/context/Store';
import { DAY, money, shortDate, startOfDay, sumBy } from '@/lib/format';
import type { Country } from '@/lib/types';
import { COUNTRY_CURRENCY, COUNTRY_LABEL } from '@/lib/types';
import { Avatar, ChannelBadge, SplitBar } from '@/components/ui';
import { Drawer, Modal } from '@/components/overlays';
import { Icon } from '@/components/Icon';
import { ChannelCard } from '@/components/ChannelCard';
import { BranchManager } from '@/components/BranchManager';
import { InviteDialog } from '@/components/InviteDialog';

function CompaniesInner() {
  const { companies, billiards, payments, allUsers, now, can, addCompany, setCompanyFilter, channelsOf, pendingChannelRequests, refreshChannels, inviteUser } = useStore();
  const highlight = useSearchParams().get('c');
  const [adding, setAdding] = useState(false);
  const [ownerFor, setOwnerFor] = useState<string | null>(null);
  const [channelsFor, setChannelsFor] = useState<string | null>(null);
  const [drawerTab, setDrawerTab] = useState<'channels' | 'branches'>('channels');
  const t0 = startOfDay(now);

  if (!can('COMPANY_MANAGE')) return <div className="card empty">Only Super Admins can manage companies.</div>;

  const drawerCompany = companies.find((c) => c.id === channelsFor);
  const openChannels = (id: string, tab: 'channels' | 'branches' = 'channels') => {
    refreshChannels(id);
    setDrawerTab(tab);
    setChannelsFor(id);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Companies</h1>
          <p>{companies.length} companies · {billiards.length} billiards on the platform.</p>
        </div>
        <div className="row">
          {can('CHANNEL_ADMIN') && pendingChannelRequests > 0 && (
            <span className="pill pill-amber pulse" id="pending-channel-requests"><Icon name="clock" size={12} /> {pendingChannelRequests} channel request{pendingChannelRequests === 1 ? '' : 's'} pending</span>
          )}
          <button className="btn btn-brass" onClick={() => setAdding(true)} id="add-company"><Icon name="plus" size={16} /> New company</button>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))' }}>
        {companies.map((c) => {
          const bs = billiards.filter((b) => b.companyId === c.id);
          const today = sumBy(payments.filter((p) => p.companyId === c.id && p.at >= t0));
          const month = sumBy(payments.filter((p) => p.companyId === c.id && p.at >= t0 - 29 * DAY));
          const owner = allUsers.find((u) => u.companyId === c.id && u.role === 'COMPANY_SUPER_ADMIN');
          const admins = allUsers.filter((u) => u.companyId === c.id && u.role === 'COMPANY_ADMIN');
          const chans = channelsOf(c.id);
          const pending = chans.filter((x) => x.status === 'PENDING').length;
          const cur = c.currency;
          return (
            <div key={c.id} className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 16, borderColor: highlight === c.id ? 'rgba(212,173,85,.5)' : undefined }}>
              <div className="row between">
                <div className="row">
                  <span className="kpi-icon" style={{ width: 44, height: 44, background: 'var(--brass-dim)', color: 'var(--brass-2)' }}><Icon name="building" /></span>
                  <div>
                    <h3>{c.name}</h3>
                    <div className="faint" style={{ fontSize: 12 }}><Icon name="pin" size={12} style={{ verticalAlign: -2 }} /> {c.city} · {COUNTRY_LABEL[c.country]} · <button className="link-btn" onClick={() => openChannels(c.id, 'branches')} id={`branches-${c.id}`}>{c.branches.length} branch{c.branches.length === 1 ? '' : 'es'}</button></div>
                  </div>
                </div>
                <span className="pill pill-grey mono" title="Company currency">{cur}</span>
              </div>
              <div className="stat-row" style={{ margin: 0 }}>
                <div className="stat"><div className="l">Billiards</div><div className="v mono">{bs.length}</div></div>
                <div className="stat"><div className="l">In play</div><div className="v mono" style={{ color: 'var(--felt-2)' }}>{bs.filter((b) => b.status === 'IN_PLAY').length}</div></div>
                <div className="stat"><div className="l">Offline</div><div className="v mono" style={{ color: bs.some((b) => b.status === 'OFFLINE') ? 'var(--danger)' : undefined }}>{bs.filter((b) => b.status === 'OFFLINE').length}</div></div>
              </div>
              <div>
                <div className="row between" style={{ marginBottom: 8 }}>
                  <span className="faint" style={{ fontSize: 12 }}>Today <b className="mono" style={{ color: 'var(--text)', marginLeft: 6 }}>{money(today.total, cur)}</b></span>
                  <span className="faint" style={{ fontSize: 12 }}>30d <b className="mono" style={{ color: 'var(--text)', marginLeft: 6 }}>{money(month.total, cur)}</b></span>
                </div>
                <SplitBar manual={month.manual} online={month.online} />
                <div className="row between faint" style={{ fontSize: 11, marginTop: 6 }}>
                  <span>Manual {money(month.manual, cur)}</span><span>Online {money(month.online, cur)}</span>
                </div>
              </div>
              <button
                className="row between"
                id={`channels-${c.id}`}
                onClick={() => openChannels(c.id)}
                style={{ padding: '10px 12px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface)', color: 'inherit', textAlign: 'left', cursor: 'pointer' }}
              >
                <span className="chips" style={{ gap: 6 }}>
                  {chans.filter((x) => x.status === 'ACTIVE').map((x) => <ChannelBadge key={x.channel} channel={x.channel} size="sm" />)}
                  {chans.every((x) => x.status !== 'ACTIVE') && <span className="faint" style={{ fontSize: 12 }}>No online channels active</span>}
                </span>
                <span className="row" style={{ gap: 6, fontSize: 12, fontWeight: 600 }}>
                  {pending > 0 && <span className="badge-count" style={{ margin: 0 }}>{pending}</span>}
                  Payment channels <Icon name="chevronRight" size={13} />
                </span>
              </button>
              <div className="row between" style={{ paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                <div className="row" style={{ gap: 8 }}>
                  {owner && <Avatar name={owner.name} size="sm" />}
                  {owner ? (
                    <span style={{ fontSize: 12 }}>{owner.name}</span>
                  ) : (
                    <button className="btn btn-sm btn-brass" onClick={() => setOwnerFor(c.id)} id={`add-owner-${c.id}`}>
                      <Icon name="plus" size={13} /> Add owner
                    </button>
                  )}
                  <span className="faint" style={{ fontSize: 12 }}>+{admins.length} admins</span>
                </div>
                <Link href="/billiards" className="btn btn-sm" onClick={() => setCompanyFilter(c.id)}>Open floor <Icon name="chevronRight" size={13} /></Link>
              </div>
              <span className="faint" style={{ fontSize: 11 }}>Since {shortDate(c.createdAt)} {new Date(c.createdAt).getFullYear()}</span>
            </div>
          );
        })}
      </div>

      {adding && <NewCompany onClose={() => setAdding(false)} onSave={addCompany} />}
      {ownerFor && (
        <InviteDialog
          title={`Add owner · ${companies.find((c) => c.id === ownerFor)?.name ?? ''}`}
          roles={['COMPANY_SUPER_ADMIN']}
          initialRole="COMPANY_SUPER_ADMIN"
          companies={companies}
          lockCompanyId={ownerFor}
          onClose={() => setOwnerFor(null)}
          onSave={inviteUser}
        />
      )}
      {drawerCompany && (
        <Drawer
          title={<>{drawerCompany.name}</>}
          onClose={() => setChannelsFor(null)}
        >
          <div className="tabs">
            <button className={`tab ${drawerTab === 'channels' ? 'active' : ''}`} onClick={() => setDrawerTab('channels')} id="drawer-tab-channels">Payment channels</button>
            <button className={`tab ${drawerTab === 'branches' ? 'active' : ''}`} onClick={() => setDrawerTab('branches')} id="drawer-tab-branches">Branches</button>
          </div>
          {drawerTab === 'branches' ? (
            <BranchManager companyId={drawerCompany.id} />
          ) : (
          <>
          <div className="readonly-note">
            <Icon name="globe" size={14} /> {COUNTRY_LABEL[drawerCompany.country]} · {drawerCompany.currency}. Approve requests, suspend or reactivate channels. Suspending removes the channel from every table of this company.
          </div>
          {channelsOf(drawerCompany.id).map((ch) => (
            <ChannelCard key={`${ch.channel}-${ch.status}`} companyId={drawerCompany.id} ch={ch} as="platform" />
          ))}
          </>
          )}
        </Drawer>
      )}
    </>
  );
}

function NewCompany({ onClose, onSave }: { onClose: () => void; onSave: (i: { name: string; city: string; branches: string[]; country: Country }) => void }) {
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [branches, setBranches] = useState('Main');
  const [country, setCountry] = useState<Country>('KE');
  return (
    <Modal
      title="New company"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-brass" id="create-company" disabled={!name || !city} onClick={() => { onSave({ name, city, country, branches: branches.split(',').map((b) => b.trim()).filter(Boolean) }); onClose(); }}>Create company</button>
        </>
      }
    >
      <div className="field"><label>Company name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Kilimani Cue House" /></div>
      <div className="field">
        <label>Country</label>
        <div className="segmented" style={{ alignSelf: 'flex-start' }} role="group" aria-label="Country">
          {(['KE', 'RW'] as Country[]).map((c) => (
            <button key={c} id={`country-${c.toLowerCase()}`} className={country === c ? 'active' : ''} onClick={() => setCountry(c)}>
              {COUNTRY_LABEL[c]} · {COUNTRY_CURRENCY[c]}
            </button>
          ))}
        </div>
        <span className="hint">Sets the currency and which payment channels can be requested ({country === 'KE' ? 'M-Pesa, Airtel Money, Card' : 'MTN MoMo, Airtel Money, Card'}).</span>
      </div>
      <div className="field"><label>City / area</label><input className="input" value={city} onChange={(e) => setCity(e.target.value)} placeholder={country === 'RW' ? 'e.g. Kigali' : 'e.g. Kilimani'} /></div>
      <div className="field"><label>Branches</label><input className="input" value={branches} onChange={(e) => setBranches(e.target.value)} /><span className="hint">Comma separated</span></div>
      <p className="hint" style={{ margin: 0 }}>Next: invite a Company Super Admin from Users &amp; Access.</p>
    </Modal>
  );
}

export default function CompaniesPage() {
  return <Suspense><CompaniesInner /></Suspense>;
}
