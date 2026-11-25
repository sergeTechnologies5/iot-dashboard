"use client";

import Link from 'next/link';
import { useStore } from '@/context/Store';
import { COUNTRY_LABEL } from '@/lib/types';
import { ChannelCard } from '@/components/ChannelCard';
import { ChannelBadge } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { MpesaSimulator } from '@/components/MpesaPanels';
import { ShortcodeList } from '@/components/ShortcodeCard';
import { BranchManager } from '@/components/BranchManager';
import { MomoAccountList } from '@/components/MomoAccounts';

/** Company Super Admin: request channels and manage merchant accounts for their company. */
export default function PaymentSettingsPage() {
  const { user, can, companies, billiards, channelsOf } = useStore();
  const company = companies.find((c) => c.id === user?.companyId);

  if (!can('PAYMENT_CONFIG') || user?.role !== 'COMPANY_SUPER_ADMIN' || !company) {
    return (
      <div className="card empty">
        <Icon name="shield" size={28} />
        <h3 style={{ margin: '12px 0 6px' }}>Payment settings</h3>
        <p>Only a Company Super Admin can manage their company&apos;s payment channels.{can('CHANNEL_ADMIN') ? ' Super Admins manage channels per company from Companies.' : ''}</p>
        {can('CHANNEL_ADMIN') && <Link href="/companies" className="btn" style={{ marginTop: 10 }}>Go to Companies</Link>}
      </div>
    );
  }

  const list = channelsOf(company.id);
  const active = list.filter((c) => c.status === 'ACTIVE');
  const pending = list.filter((c) => c.status === 'PENDING').length;
  const tables = billiards.filter((b) => b.companyId === company.id);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Payment settings</h1>
          <p>
            {company.name} · {COUNTRY_LABEL[company.country]} · amounts in <b className="mono">{company.currency}</b>
          </p>
        </div>
        <div className="row">
          {pending > 0 && <span className="pill pill-amber"><Icon name="clock" size={12} /> {pending} awaiting activation</span>}
          <span className="pill pill-felt"><span className="dot" />{active.length} active</span>
        </div>
      </div>

      <div className="chan-grid">
        <div className="card chan-card" style={{ ['--chan' as string]: '#a9b4ae', ['--chan-bg' as string]: 'rgba(169,180,174,.12)' }}>
          <div className="row between">
            <div className="row">
              <span className="chan-logo"><Icon name="cash" size={20} /></span>
              <div>
                <h3>Cash</h3>
                <div className="faint" style={{ fontSize: 12 }}>Always available</div>
              </div>
            </div>
            <span className="pill pill-felt"><span className="dot" />Built-in</span>
          </div>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>Manual payments recorded by staff. Toggle per table under each billiard&apos;s Configuration tab.</p>
        </div>
        {list.map((ch) => (
          <ChannelCard key={`${ch.channel}-${ch.status}-${ch.merchantCode}-${ch.accountName}`} companyId={company.id} ch={ch} as="company" />
        ))}
      </div>

      <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <h3>Branches</h3>
          <div className="faint" style={{ fontSize: 12, marginTop: 3 }}>Every table belongs to a branch; Merchant accounts (Paybills, Tills, MTN & Airtel) are assigned per branch.</div>
        </div>
        <BranchManager companyId={company.id} />
      </div>

      {list.some((c) => c.channel === 'MPESA') && (
        <section className="shortcode-section">
          <div>
            <h2 style={{ margin: 0, fontSize: 18 }}>Where your customers pay</h2>
            <div className="faint" style={{ fontSize: 12, marginTop: 3 }}>Your M-Pesa Paybills and Tills. Each table pays to exactly one; a Till serves a single table.</div>
          </div>
          <ShortcodeList companyId={company.id} />
        </section>
      )}
      {(['MTN_RW', 'AIRTEL_RW'] as const).filter((ch) => list.some((c) => c.channel === ch && c.status === 'ACTIVE')).map((ch) => (
        <section className="shortcode-section" key={ch} id={`momo-section-${ch.toLowerCase()}`}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18 }}>{ch === 'MTN_RW' ? 'MTN MoMo accounts' : 'Airtel Money accounts'}</h2>
            <div className="faint" style={{ fontSize: 12, marginTop: 3 }}>
              {ch === 'MTN_RW'
                ? 'MoMo Open API (Collection) credentials. Customers on 078/079 approve a push prompt with their MoMo PIN.'
                : 'Airtel Open API (Collection) credentials. Customers on 072/073 approve a USSD prompt with their Airtel Money PIN.'}
            </div>
          </div>
          <MomoAccountList companyId={company.id} channel={ch} />
        </section>
      ))}
      {company.country === 'RW' && !list.some((c) => (c.channel === 'MTN_RW' || c.channel === 'AIRTEL_RW') && c.status === 'ACTIVE') && (
        <div className="hint">Request activation of MTN MoMo or Airtel Money above; once the platform activates it you can add your merchant API credentials here.</div>
      )}
      <MpesaSimulator companyId={company.id} />

      <div className="card">
        <div className="card-head">
          <div>
            <h3>Tables</h3>
            <div className="sub">Token price and channels per billiard</div>
          </div>
        </div>
        <div className="table-wrap" style={{ marginTop: 10 }}>
          <table className="data">
            <thead>
              <tr><th>Billiard</th><th>Account ref</th><th className="num">Token price</th><th>Accepts</th><th /></tr>
            </thead>
            <tbody>
              {tables.map((b) => (
                <tr key={b.id}>
                  <td><b>{b.name}</b><div className="faint" style={{ fontSize: 12 }}>{b.branch}</div></td>
                  <td className="mono muted">{b.accountRef || '—'}</td>
                  <td className="num mono">{b.currency} {b.tokenPrice.toLocaleString()}</td>
                  <td>
                    <div className="chips" style={{ gap: 6 }}>
                      {b.cashEnabled && <ChannelBadge channel="CASH" size="sm" />}
                      {b.channels.filter((c) => c !== 'CASH').map((c) => <ChannelBadge key={c} channel={c} size="sm" />)}
                    </div>
                  </td>
                  <td><Link className="btn btn-ghost btn-sm" href={`/billiards/${b.id}`}>Configure <Icon name="chevronRight" size={13} /></Link></td>
                </tr>
              ))}
            </tbody>
          </table>
          {tables.length === 0 && <div className="empty">No billiards yet</div>}
        </div>
      </div>
    </>
  );
}
