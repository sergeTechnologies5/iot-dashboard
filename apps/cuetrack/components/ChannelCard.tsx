"use client";

import { useState } from 'react';
import { useStore } from '@/context/Store';
import { CHANNEL_META } from '@/lib/channels';
import { timeAgo } from '@/lib/format';
import type { CompanyChannel } from '@/lib/types';
import { ChannelStatusPill } from './ui';
import { Icon } from './Icon';

/**
 * One company payment channel.
 * - `as="company"` (Company Super Admin): request activation, edit merchant details when ACTIVE.
 * - `as="platform"` (Super Admin): approve / suspend / reactivate; merchant details read-only.
 */
export function ChannelCard({ companyId, ch, as }: { companyId: string; ch: CompanyChannel; as: 'company' | 'platform' }) {
  const { now, requestChannel, setChannelStatus, setMerchant } = useStore();
  const m = CHANNEL_META[ch.channel];
  const [code, setCode] = useState(ch.merchantCode ?? '');
  const [name, setName] = useState(ch.accountName ?? '');
  const dirty = code !== (ch.merchantCode ?? '') || name !== (ch.accountName ?? '');
  const id = `${companyId}-${ch.channel.toLowerCase()}`;
  const codeLabel = ch.channel === 'MPESA' ? 'Paybill / Till number' : ch.channel === 'CARD' ? 'Merchant ID (MID)' : 'Merchant code';

  return (
    <div className="card chan-card" style={{ ['--chan' as string]: m.color, ['--chan-bg' as string]: m.bg }} id={`channel-${id}`}>
      <div className="row between">
        <div className="row">
          <span className="chan-logo"><Icon name={m.icon} size={20} /></span>
          <div>
            <h3>{m.label}</h3>
            <div className="faint" style={{ fontSize: 12 }}>
              {m.country ? (m.country === 'KE' ? 'Kenya' : 'Rwanda') : 'All countries'}
              {ch.updatedAt ? ` · updated ${timeAgo(ch.updatedAt, now)}` : ''}
            </div>
          </div>
        </div>
        <ChannelStatusPill status={ch.status} />
      </div>

      {/* ---------- Company Super Admin ---------- */}
      {as === 'company' && ch.status === 'NOT_REQUESTED' && (
        <>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>Let players pay with {m.label}. The platform team reviews and activates the channel.</p>
          <button className="btn btn-brass" id={`request-${id}`} onClick={() => requestChannel(companyId, ch.channel)}>
            <Icon name="bolt" size={15} /> Request activation
          </button>
        </>
      )}
      {as === 'company' && ch.status === 'PENDING' && (
        <div className="awaiting"><span className="spinner" /> Awaiting platform activation</div>
      )}
      {as === 'company' && ch.status === 'SUSPENDED' && (
        <>
          <div className="readonly-note" style={{ color: 'var(--danger)' }}><Icon name="shield" size={14} /> Suspended by the platform. Tables can&apos;t use it.</div>
          <button className="btn" id={`request-${id}`} onClick={() => requestChannel(companyId, ch.channel)}>
            <Icon name="undo" size={15} /> Request reactivation
          </button>
        </>
      )}
      {as === 'company' && ch.status === 'ACTIVE' && (
        <>
          <div className="field">
            <label htmlFor={`code-${id}`}>{codeLabel}</label>
            <input id={`code-${id}`} className="input mono" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Required to receive payouts" />
          </div>
          <div className="field">
            <label htmlFor={`name-${id}`}>Account name</label>
            <input id={`name-${id}`} className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name shown to payers" />
          </div>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn btn-felt btn-sm" id={`save-${id}`} disabled={!dirty || !code.trim()} onClick={() => setMerchant(companyId, ch.channel, { merchantCode: code.trim(), accountName: name.trim() })}>
              <Icon name="check" size={14} /> Save details
            </button>
          </div>
        </>
      )}

      {/* ---------- Super Admin ---------- */}
      {as === 'platform' && (
        <>
          <dl className="kv" style={{ margin: 0 }}>
            <dt>{codeLabel}</dt>
            <dd className="mono">{ch.merchantCode || <span className="faint">—</span>}</dd>
            <dt>Account name</dt>
            <dd>{ch.accountName || <span className="faint">—</span>}</dd>
          </dl>
          <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
            {ch.status === 'PENDING' && (
              <>
                <button className="btn btn-ghost btn-sm" id={`reject-${id}`} onClick={() => setChannelStatus(companyId, ch.channel, 'SUSPENDED')}>Reject</button>
                <button className="btn btn-felt btn-sm" id={`approve-${id}`} onClick={() => setChannelStatus(companyId, ch.channel, 'ACTIVE')}><Icon name="check" size={14} /> Approve</button>
              </>
            )}
            {ch.status === 'ACTIVE' && (
              <button className="btn btn-danger btn-sm" id={`suspend-${id}`} onClick={() => setChannelStatus(companyId, ch.channel, 'SUSPENDED')}><Icon name="lock" size={14} /> Suspend</button>
            )}
            {ch.status === 'SUSPENDED' && (
              <button className="btn btn-felt btn-sm" id={`reactivate-${id}`} onClick={() => setChannelStatus(companyId, ch.channel, 'ACTIVE')}><Icon name="unlock" size={14} /> Reactivate</button>
            )}
            {ch.status === 'NOT_REQUESTED' && (
              <button className="btn btn-sm" id={`enable-${id}`} onClick={() => setChannelStatus(companyId, ch.channel, 'ACTIVE')}><Icon name="bolt" size={14} /> Enable</button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
