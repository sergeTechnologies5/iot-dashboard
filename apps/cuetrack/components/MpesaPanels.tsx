"use client";

import { useState } from 'react';
import { PUSH_LABEL, type PushChannel, useMpesa } from '@/context/Mpesa';
import { useStore } from '@/context/Store';
import { Icon } from './Icon';

export function CopyField({ label, value, id }: { label: string; value: string; id: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    });
  };
  return (
    <div className="copy-field">
      <span className="faint">{label}</span>
      <code className="mono" title={value}>{value}</code>
      <button className="btn btn-ghost btn-sm" onClick={copy} id={id} title="Copy">{copied ? <Icon name="check" size={13} /> : <Icon name="link" size={13} />}{copied ? 'Copied' : 'Copy'}</button>
    </div>
  );
}

export function SecretInput({ id, label, isSet, value, onChange, disabled, hint, highlight, source = 'Daraja portal' }: {
  id: string; label: string; isSet: boolean; value: string; onChange: (v: string) => void; disabled?: boolean;
  /** masked preview of the saved value (e.g. 1a2b••••9f) – revealed by Show when nothing is typed */
  hint?: string;
  /** colour the field when a value is saved */
  highlight?: boolean;
  source?: string;
}) {
  const [show, setShow] = useState(false);
  const canPreview = !value && isSet && !!hint;
  const placeholder = isSet
    ? (show && canPreview ? `${hint}  (saved – leave blank to keep)` : '•••••••••••• (leave blank to keep)')
    : `Paste from ${source}`;
  return (
    <div className={`field${highlight && isSet ? ' secret-field-set' : ''}`}>
      <label htmlFor={id}>
        {label} {isSet ? <span className="secret-set"><Icon name="check" size={10} strokeWidth={3} /> set</span> : <span className="secret-unset">not set</span>}
      </label>
      <div className="secret-input">
        <input id={id} className="input mono" type={show ? 'text' : 'password'} autoComplete="new-password" placeholder={placeholder} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShow((s) => !s)} disabled={!value && !canPreview} title={canPreview ? 'Preview the saved value (masked)' : undefined}>{show ? 'Hide' : 'Show'}</button>
      </div>
    </div>
  );
}


/** Dev-only: send push prompts and fire mock provider callbacks (M-Pesa for Kenya, MTN MoMo / Airtel Money for Rwanda). */
export function MpesaSimulator({ companyId }: { companyId?: string }) {
  const { billiards, companies } = useStore();
  const { devAvailable, stks, simulateC2b, simulateStk, startStk, credentialsOf } = useMpesa();
  const rw = !!companyId && companies.find((c) => c.id === companyId)?.country === 'RW';
  const channels: PushChannel[] = rw ? ['MTN_RW', 'AIRTEL_RW'] : ['MPESA'];
  const [channel, setChannel] = useState<PushChannel>(channels[0]);
  const ch: PushChannel = channels.includes(channel) ? channel : channels[0];
  const L = PUSH_LABEL[ch];
  const creds = companyId && !rw ? credentialsOf(companyId) : [];
  const [credId, setCredId] = useState(creds[0]?.id ?? '');
  const cred = creds.find((c) => c.id === credId);
  const tables = billiards.filter((b) => (!companyId || b.companyId === companyId) && b.channels.includes(ch) && (ch !== 'MPESA' || !cred || b.mpesaCredentialId === cred.id));
  const [billRef, setBillRef] = useState(tables[0]?.accountRef ?? '');
  const [amount, setAmount] = useState(rw ? '500' : '100');
  const [msisdn, setMsisdn] = useState(rw ? '0788123456' : '254712345678');
  const [log, setLog] = useState<string[]>([]);
  const pending = stks.filter((s) => s.status === 'PENDING' && (!companyId || s.companyId === companyId));
  if (!devAvailable) return null;

  const run = async (label: string, fn: () => Promise<string>) => {
    try {
      const r = await fn();
      setLog((l) => [`${new Date().toLocaleTimeString()} · ${label}: ${r}`, ...l].slice(0, 6));
    } catch (e) {
      setLog((l) => [`${new Date().toLocaleTimeString()} · ${label}: ${e instanceof Error ? e.message : e}`, ...l].slice(0, 6));
    }
  };
  const pickChannel = (c: PushChannel) => {
    setChannel(c);
    setMsisdn(c === 'AIRTEL_RW' ? '0730123456' : c === 'MTN_RW' ? '0788123456' : '254712345678');
  };

  return (
    <div className="card sim-card">
      <div className="row between">
        <div className="row">
          <span className="pill pill-amber"><Icon name="bolt" size={12} /> Dev</span>
          <h3>Simulate {rw ? 'MTN MoMo / Airtel Money' : 'M-Pesa'}</h3>
        </div>
        <span className="faint" style={{ fontSize: 12 }}>{rw ? 'Push prompts + mock provider results (needs cuetrack.pay.simulate=true)' : 'Mock Daraja callbacks'}</span>
      </div>
      <div className="grid" style={{ gridTemplateColumns: (rw || creds.length ? '1.2fr ' : '') + '1.2fr 1fr 1.3fr auto', gap: 10, alignItems: 'end' }}>
        {rw ? (
          <div className="field">
            <label htmlFor="sim-channel">Provider</label>
            <select id="sim-channel" className="select" value={ch} onChange={(e) => pickChannel(e.target.value as PushChannel)}>
              {channels.map((c) => <option key={c} value={c}>{PUSH_LABEL[c].name}</option>)}
            </select>
          </div>
        ) : creds.length > 0 && (
          <div className="field">
            <label htmlFor="sim-short">Shortcode</label>
            <select id="sim-short" className="select" value={credId} onChange={(e) => setCredId(e.target.value)}>
              <option value="">Any</option>
              {creds.map((c) => <option key={c.id} value={c.id}>{c.label || c.shortcode} · {c.shortcode}</option>)}
            </select>
          </div>
        )}
        <div className="field">
          <label htmlFor="sim-ref">{rw ? 'Table (account ref)' : 'Account ref (BillRef)'}</label>
          <input id="sim-ref" className="input mono" list="sim-refs" value={billRef} onChange={(e) => setBillRef(e.target.value)} placeholder={tables[0]?.accountRef ?? (rw ? `No table has ${L.name} yet` : '')} />
          <datalist id="sim-refs">{tables.map((b) => <option key={b.id} value={b.accountRef}>{b.name}</option>)}</datalist>
        </div>
        <div className="field">
          <label htmlFor="sim-amount">Amount</label>
          <input id="sim-amount" className="input mono" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} />
        </div>
        <div className="field">
          <label htmlFor="sim-msisdn">Phone</label>
          <input id="sim-msisdn" className="input mono" value={msisdn} onChange={(e) => setMsisdn(e.target.value)} />
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button id="sim-stk" className="btn btn-felt" disabled={!Number(amount)} title={`Sends a ${L.name} PIN prompt to the phone`} onClick={() => run(`${L.name} push`, async () => {
            const t = tables.find((b) => b.accountRef.toLowerCase() === (billRef.trim() || tables[0]?.accountRef || '').toLowerCase());
            if (!t) throw new Error(`No ${L.name} table with account ref "${billRef}"`);
            const s = await startStk(t.id, { msisdn, amount: Number(amount), channel: ch });
            return `prompt sent to ${s.msisdn} · ${s.checkoutRequestId} · ${s.status}`;
          })}>Send {rw ? L.name : 'STK'} prompt</button>
          {!rw && <button id="sim-c2b" className="btn btn-brass" disabled={!Number(amount)} onClick={() => run('C2B', () => simulateC2b({ companyId, shortcode: cred?.shortcode ?? undefined, billRef, amount: Number(amount), msisdn, firstName: 'Test' }))}>Send C2B</button>}
        </div>
      </div>
      {pending.length > 0 && (
        <div className="sim-pending">
          <span className="faint" style={{ fontSize: 12 }}>Pending prompts</span>
          {pending.map((s) => {
            const name = PUSH_LABEL[(s.channel as PushChannel) ?? 'MPESA']?.name ?? 'Push';
            return (
              <div key={s.id} className="row between" style={{ gap: 8, flexWrap: 'wrap' }}>
                <span className="mono" style={{ fontSize: 12 }}>{name} · {s.msisdn} · {s.currency} {s.amount} · {billiards.find((b) => b.id === s.billiardId)?.name}</span>
                <div className="row" style={{ gap: 6 }}>
                  <button className="btn btn-felt btn-sm" onClick={() => run(name, () => simulateStk({ checkoutRequestId: s.checkoutRequestId, resultCode: 0 }))}>Success</button>
                  <button className="btn btn-sm" onClick={() => run(name, () => simulateStk({ checkoutRequestId: s.checkoutRequestId, resultCode: 1032 }))}>{s.channel && s.channel !== 'MPESA' ? 'Reject' : 'Cancel'}</button>
                  <button className="btn btn-danger btn-sm" onClick={() => run(name, () => simulateStk({ checkoutRequestId: s.checkoutRequestId, resultCode: 1 }))}>Fail</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {log.length > 0 && <div className="sim-log mono">{log.map((l, i) => <div key={i}>{l}</div>)}</div>}
    </div>
  );
}
