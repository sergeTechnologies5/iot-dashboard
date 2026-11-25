"use client";

import { useState } from 'react';
import Link from 'next/link';
import { useStore } from '@/context/Store';
import { CHANNEL_META } from '@/lib/channels';
import { money } from '@/lib/format';
import type { Billiard, PaymentChannel } from '@/lib/types';
import { CHANNEL_STATUS_LABEL } from '@/lib/types';
import { ChannelBadge } from './ui';
import { Icon } from './Icon';
import { useMpesa } from '@/context/Mpesa';

type Field = 'branch' | 'price' | 'cred' | 'ref' | 'general';

/** Route a backend / validation message to the field it is about. */
function fieldOf(msg: string): Field {
  const m = msg.toLowerCase();
  if (m.includes('account')) return 'ref';
  if (m.includes('till') || m.includes('paybill') || m.includes('shortcode') || m.includes('m-pesa') || m.includes('mpesa') || m.includes('credential')) return 'cred';
  if (m.includes('branch')) return 'branch';
  if (m.includes('price')) return 'price';
  return 'general';
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <span className="field-error"><Icon name="shield" size={12} /> {msg}</span>;
}

/**
 * Per-billiard payment configuration. Editable by the Company Super Admin of
 * the table's company; Super Admin and Company Admin see it read-only.
 * (Super Admin may additionally move the table to another branch.)
 */
export function BilliardConfigPanel({ b }: { b: Billiard }) {
  const { user, can, channelsOf, saveBilliardConfig, branchesOf } = useStore();
  const { credentialById } = useMpesa();
  const editable = can('PAYMENT_CONFIG') && user?.role === 'COMPANY_SUPER_ADMIN' && user.companyId === b.companyId;
  const branchEditable = editable || user?.role === 'SUPER_ADMIN';
  // viewers without access to company channels (Company Admin) still see the table's enabled channels as active
  const companyChannels = channelsOf(b.companyId).map((c) => (c.status === 'NOT_REQUESTED' && b.channels.includes(c.channel) ? { ...c, status: 'ACTIVE' as const } : c));
  const active = companyChannels.filter((c) => c.status === 'ACTIVE').map((c) => c.channel);
  const branches = branchesOf(b.companyId);

  const [branchId, setBranchId] = useState(b.branchId);
  const [price, setPrice] = useState(String(b.tokenPrice));
  const [cash, setCash] = useState(b.cashEnabled);
  const [channels, setChannels] = useState<PaymentChannel[]>(b.channels.filter((c) => c !== 'CASH'));
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});

  // the Paybill/Till is chosen in Payment settings; here it is read-only
  const cred = b.mpesaCredentialId ? credentialById(b.mpesaCredentialId) : undefined;
  const linked = !!b.mpesaCredentialId;
  const isTill = b.mpesaShortcodeType === 'TILL';
  const branchName = branches.find((x) => x.id === branchId)?.name ?? b.branchName ?? b.branch;
  const branchLeavesShortcode = linked && branchId !== b.branchId && !!cred && !cred.branchIds.includes(branchId);

  const priceNum = Number(price);
  const priceOk = price.trim() !== '' && isFinite(priceNum) && priceNum > 0;
  const dirty =
    branchId !== b.branchId ||
    priceNum !== b.tokenPrice ||
    cash !== b.cashEnabled ||
    channels.slice().sort().join() !== b.channels.filter((c) => c !== 'CASH').slice().sort().join();
  const noWay = !cash && channels.length === 0;
  const canSave = dirty && priceOk && !saving;

  const clearErr = (f: Field) => setErrors((e) => (e[f] || e.general ? { ...e, [f]: undefined, general: undefined } : e));
  const toggle = (c: PaymentChannel) => { if (c === 'MPESA') return; clearErr('cred'); setChannels((x) => (x.includes(c) ? x.filter((y) => y !== c) : [...x, c])); };
  const changeBranch = (id: string) => {
    setBranchId(id);
    clearErr('branch');
  };
  const reset = () => {
    setBranchId(b.branchId);
    setPrice(String(b.tokenPrice));
    setCash(b.cashEnabled);
    setChannels(b.channels.filter((c) => c !== 'CASH'));
    setErrors({});
  };
  const save = async () => {
    setSaving(true);
    setErrors({});
    // only send channels that are still active at company level; MPESA follows the shortcode link
    const chans = channels.filter((c) => active.includes(c) && (c !== 'MPESA' || linked));
    await saveBilliardConfig(
      b.id,
      {
        tokenPrice: priceNum,
        accountRef: b.accountRef,
        cashEnabled: cash,
        channels: chans,
        mpesaCredentialId: b.mpesaCredentialId,
        branchId: branchId !== b.branchId ? branchId : undefined,
      },
      linked ? { shortcode: b.mpesaShortcode, shortcodeType: b.mpesaShortcodeType ?? 'PAYBILL', label: b.mpesaLabel ?? '' } : null,
      (msg) => setErrors({ [fieldOf(msg)]: msg }),
    );
    setSaving(false);
  };

  return (
    <div className="grid grid-2-1">
      <div className="card card-pad pay-form">
        <div className="row between" style={{ flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h3>Payments &amp; collection</h3>
            <div className="faint" style={{ fontSize: 12, marginTop: 3 }}>Where {b.name} sits, what a game costs and how players pay</div>
          </div>
          {dirty ? (
            <span className="pill pill-amber" id="cfg-dirty"><span className="dot" />Unsaved changes</span>
          ) : !editable ? (
            <span className="pill pill-grey"><Icon name="lock" size={12} /> {branchEditable ? 'Branch only' : 'Read-only'}</span>
          ) : null}
        </div>

        <div className="pay-step">
          <span className="pay-step-n">1</span>
          <div className="pay-step-body">
            <div className="pay-grid">
              <div className="field">
                <label htmlFor="cfg-branch">Branch</label>
                <select id="cfg-branch" className="select" value={branchId} disabled={!branchEditable} onChange={(e) => changeBranch(e.target.value)}>
                  {branches.map((br) => <option key={br.id} value={br.id}>{br.name}{br.location ? ` · ${br.location}` : ''}</option>)}
                  {!branches.some((br) => br.id === branchId) && <option value={branchId}>{branchName}</option>}
                </select>
                <FieldError msg={errors.branch} />
                {branchLeavesShortcode && <span className="field-error">{cred?.label || b.mpesaShortcode} doesn&apos;t serve {branchName} — unlink the table in Payment settings first.</span>}
              </div>
              <div className="field">
                <label htmlFor="cfg-price">Token price ({b.currency})</label>
                <input id="cfg-price" className="input mono" type="number" min={1} value={price} disabled={!editable} onChange={(e) => { setPrice(e.target.value); clearErr('price'); }} />
                {!priceOk && <span className="field-error">Enter a price above zero</span>}
                <FieldError msg={errors.price} />
              </div>
            </div>
          </div>
        </div>

        <div className="pay-step">
          <span className="pay-step-n">2</span>
          <div className="pay-step-body">
            <div className="row between" style={{ padding: '14px 16px', borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--border)', flexWrap: 'wrap', gap: 10 }}>
              <div className="row">
                <ChannelBadge channel="CASH" />
                <span className="muted" style={{ fontSize: 13 }}>Accept cash / manual payments at the venue</span>
              </div>
              <button id="cfg-cash" className={`switch ${cash ? 'on' : ''}`} disabled={!editable} onClick={() => setCash((v) => !v)} aria-pressed={cash} aria-label="Cash enabled" />
            </div>

            <div className="field">
              <label>Online channels</label>
              <div className="chips" style={{ gap: 10 }}>
                {companyChannels.map((c) => {
                  const m = CHANNEL_META[c.channel];
                  const isMpesa = c.channel === 'MPESA';
                  const on = isMpesa ? linked && c.status === 'ACTIVE' : channels.includes(c.channel) && c.status === 'ACTIVE';
                  const usable = c.status === 'ACTIVE';
                  return (
                    <button
                      key={c.channel}
                      id={`cfg-ch-${c.channel.toLowerCase()}`}
                      className={`chan-chip ${on ? 'on' : ''}`}
                      style={{ ['--chan' as string]: m.color, ['--chan-bg' as string]: m.bg }}
                      disabled={!editable || !usable || isMpesa}
                      onClick={() => toggle(c.channel)}
                      title={isMpesa ? 'M-Pesa follows the Paybill/Till link in Payment settings' : usable ? m.label : `${m.label} is ${CHANNEL_STATUS_LABEL[c.status].toLowerCase()} for this company`}
                    >
                      <span className="tick">{on && <Icon name="check" size={11} strokeWidth={3} />}</span>
                      <Icon name={m.icon} size={14} style={{ color: m.color }} />
                      {m.label}
                      {!usable && <span className="faint" style={{ fontSize: 11 }}>· {CHANNEL_STATUS_LABEL[c.status]}</span>}
                    </button>
                  );
                })}
              </div>
              <span className="hint">Only channels your company has <b>active</b> can be enabled. Request others from Payment settings.</span>
            </div>
            {noWay && <div className="awaiting"><Icon name="shield" size={16} /> With cash and every channel off, this table cannot take payments.</div>}
          </div>
        </div>

        {active.includes('MPESA') && (
          <div className="pay-step">
            <span className="pay-step-n" style={{ ['--chan' as string]: CHANNEL_META.MPESA.color }}>3</span>
            <div className="pay-step-body">
              <label className="faint" style={{ fontSize: 12 }}>M-Pesa pays to</label>
              {linked ? (
                <div className="pay-preview" id="cfg-preview">
                  <div className="pay-path">
                    <span>{isTill ? 'Buy Goods' : 'Paybill'}</span>
                    <span>{b.mpesaLabel || cred?.label || (isTill ? 'Till' : 'Paybill')}</span>
                    <span>{isTill ? 'Till' : 'Business'} no. <b className="mono">{b.mpesaShortcode}</b></span>
                    {!isTill && <span>Account no. <b className="mono">{b.accountRef || '—'}</b></span>}
                    <span>Amount <b className="mono">{money(priceOk ? priceNum : b.tokenPrice, b.currency)}</b></span>
                  </div>
                  {isTill && <span className="hint">This Till serves only {b.name}.</span>}
                </div>
              ) : (
                <div className="awaiting">
                  <Icon name="phone" size={16} />
                  <span>{b.name} isn&apos;t linked to a Paybill or Till yet, so it can&apos;t take M-Pesa.</span>
                </div>
              )}
              <FieldError msg={errors.cred} />
              {can('PAYMENT_CONFIG') && (
                <Link href="/settings/payments" className="link-btn" id="cfg-change-shortcode">{linked ? 'Change in Payment settings' : 'Link in Payment settings'} <Icon name="chevronRight" size={12} /></Link>
              )}
            </div>
          </div>
        )}

        <FieldError msg={errors.general} />

        {branchEditable ? (
          <div className="row pay-actions">
            <button id="cfg-reset" className="btn btn-ghost" disabled={!dirty || saving} onClick={reset}>Reset</button>
            <button id="cfg-save" className="btn btn-brass" disabled={!canSave} onClick={save}>
              {saving ? <span className="spinner" /> : <Icon name="check" size={15} />} Save
            </button>
          </div>
        ) : (
          <div className="readonly-note"><Icon name="shield" size={14} /> Only the company&apos;s Company Super Admin can change this configuration.</div>
        )}
      </div>

      <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 14, alignSelf: 'start' }}>
        <h3>Player view</h3>
        <p className="faint" style={{ margin: 0, fontSize: 12 }}>What a player sees at the table (saved settings)</p>
        <div className="summary-box" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
          <span className="faint" style={{ fontSize: 12 }}>One game</span>
          <span className="mono" style={{ fontSize: 26, fontWeight: 700, color: 'var(--brass-2)' }}>{money(b.tokenPrice, b.currency)}</span>
          <span className="faint" style={{ fontSize: 12 }}><Icon name="pin" size={11} /> {b.branchName ?? b.branch}</span>
          {b.mpesaShortcode && <span className="faint" style={{ fontSize: 12 }}>{b.mpesaShortcodeType === 'TILL' ? 'Till' : 'Paybill'} <b className="mono" style={{ color: 'var(--text)' }}>{b.mpesaShortcode}</b></span>}
          {b.mpesaShortcodeType !== 'TILL' && <span className="faint" style={{ fontSize: 12 }}>Account <b className="mono" style={{ color: 'var(--text)' }}>{b.accountRef || '—'}</b></span>}
        </div>
        <div className="chips">
          {b.cashEnabled && <ChannelBadge channel="CASH" size="sm" />}
          {b.channels.filter((c) => c !== 'CASH').map((c) => <ChannelBadge key={c} channel={c} size="sm" />)}
          {!b.cashEnabled && b.channels.length === 0 && <span className="faint" style={{ fontSize: 12 }}>No payment methods enabled</span>}
        </div>
      </div>
    </div>
  );
}
