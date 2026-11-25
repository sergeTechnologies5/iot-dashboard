"use client";

/**
 * Payment settings: one card per M-Pesa shortcode (Paybill or Till).
 * The same card is the "Add Paybill / Till" form. Order: Type → details →
 * branch(es) → tables (+ account numbers) → Daraja API keys (optional).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { CredentialInput, CredentialTableLink, useMpesa } from '@/context/Mpesa';
import { useStore } from '@/context/Store';
import { api } from '@/lib/api';
import { CHANNEL_META } from '@/lib/channels';
import { dateTime } from '@/lib/format';
import type { MpesaEnvironment, ShortcodeType } from '@/lib/types';
import { Icon } from './Icon';
import { Confirm } from './overlays';
import { CopyField, SecretInput } from './MpesaPanels';

const normRef = (s: string) => s.replace(/[^a-z0-9]/gi, '').toLowerCase();

interface Form {
  shortcodeType: ShortcodeType;
  label: string;
  shortcode: string;
  environment: MpesaEnvironment;
  branchIds: string[];
  /** billiardId -> account number (ignored for a Till) */
  links: Record<string, string>;
  consumerKey: string;
  consumerSecret: string;
  passkey: string;
  callbackBaseUrl: string;
}

/** Multi-select dropdown for branches (Paybill). */
export function BranchMulti({ id, options, value, onChange, disabled }: { id: string; options: { id: string; name: string }[]; value: string[]; onChange: (v: string[]) => void; disabled?: boolean }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current?.open && !ref.current.contains(e.target as Node)) ref.current.open = false;
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  const names = options.filter((o) => value.includes(o.id)).map((o) => o.name);
  return (
    <details ref={ref} className={`ms-drop ${disabled ? 'is-disabled' : ''}`} id={id}>
      <summary className="select" aria-disabled={disabled} onClick={(e) => disabled && e.preventDefault()}>
        <span className={names.length ? '' : 'faint'}>{names.length ? (names.length === options.length && options.length > 1 ? `All branches (${names.length})` : names.join(', ')) : 'Choose branches…'}</span>
      </summary>
      <div className="ms-menu" role="listbox" aria-multiselectable="true">
        {options.length > 1 && (
          <label className="ms-opt ms-all">
            <input type="checkbox" checked={value.length === options.length} onChange={(e) => onChange(e.target.checked ? options.map((o) => o.id) : [])} />
            All branches
          </label>
        )}
        {options.map((o) => (
          <label key={o.id} className="ms-opt">
            <input id={`${id}-${o.id}`} type="checkbox" checked={value.includes(o.id)} onChange={() => onChange(value.includes(o.id) ? value.filter((x) => x !== o.id) : [...value, o.id])} />
            {o.name}
          </label>
        ))}
        {options.length === 0 && <div className="faint ms-opt">No branches yet</div>}
      </div>
    </details>
  );
}

export function ShortcodeCard({ companyId, credId, onDone }: { companyId: string; credId?: string; onDone?: () => void }) {
  const { can, branchesOf, billiards } = useStore();
  const { credentialById, credentialsOf, createCredential, updateCredential, setCredentialTables, deleteCredential, registerUrls } = useMpesa();
  const c = credId ? credentialById(credId) : undefined;
  const editable = can('PAYMENT_CONFIG');
  const branches = branchesOf(companyId);
  const companyTables = useMemo(() => billiards.filter((b) => b.companyId === companyId), [billiards, companyId]);
  const others = credentialsOf(companyId).filter((x) => x.id !== credId);
  const uid = credId ?? 'new';

  const fromStored = (): Form => {
    const linked = companyTables.filter((b) => c && b.mpesaCredentialId === c.id);
    return {
      shortcodeType: c?.shortcodeType ?? 'PAYBILL',
      label: c?.label ?? '',
      shortcode: c?.shortcode ?? '',
      environment: c?.environment ?? 'SANDBOX',
      branchIds: c ? [...c.branchIds] : branches.length === 1 ? [branches[0].id] : [],
      links: Object.fromEntries(linked.map((b) => [b.id, b.accountRef ?? ''])),
      consumerKey: '', consumerSecret: '', passkey: '',
      callbackBaseUrl: c?.callbackBaseUrl ?? '',
    };
  };
  const [form, setForm] = useState<Form>(fromStored);
  const [open, setOpen] = useState(!c);
  const [keysOpen, setKeysOpen] = useState(!c);
  const [busy, setBusy] = useState<'save' | 'register' | 'test' | null>(null);
  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);

  // resync when the stored credential / its links change and the card is closed
  const sig = `${c?.updatedAt}-${c?.branchIds.join(',')}-${companyTables.filter((b) => c && b.mpesaCredentialId === c.id).map((b) => b.id + b.accountRef).join(',')}`;
  useEffect(() => {
    if (!open && c) setForm(fromStored()); // eslint-disable-line react-hooks/set-state-in-effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, open]);

  const isTill = form.shortcodeType === 'TILL';
  const linkedIds = Object.keys(form.links);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const dirty = JSON.stringify(form) !== JSON.stringify(fromStored());

  // tables available in the selected branch(es)
  const pool = companyTables.filter((b) => form.branchIds.includes(b.branchId));
  const tillOwner = (bid: string) => others.find((o) => o.shortcodeType === 'TILL' && companyTables.some((b) => b.id === bid && b.mpesaCredentialId === o.id));
  const ownerOf = (bid: string) => others.find((o) => companyTables.some((b) => b.id === bid && b.mpesaCredentialId === o.id));

  const changeType = (t: ShortcodeType) =>
    setForm((f) => {
      if (t === 'TILL') {
        const keep = Object.keys(f.links).slice(0, 1);
        return { ...f, shortcodeType: t, branchIds: f.branchIds.slice(0, 1), links: Object.fromEntries(keep.map((k) => [k, ''])) };
      }
      return { ...f, shortcodeType: t };
    });
  const changeBranches = (ids: string[]) =>
    setForm((f) => ({ ...f, branchIds: ids, links: Object.fromEntries(Object.entries(f.links).filter(([bid]) => ids.includes(companyTables.find((b) => b.id === bid)?.branchId ?? ''))) }));
  const toggleTable = (bid: string) =>
    setForm((f) => {
      const next = { ...f.links };
      if (bid in next) delete next[bid];
      else next[bid] = companyTables.find((b) => b.id === bid)?.accountRef ?? '';
      return { ...f, links: next };
    });

  // ----- validation -----
  const problems: string[] = [];
  if (!/^\d{5,7}$/.test(form.shortcode.trim())) problems.push(`Enter a ${isTill ? 'Till' : 'business'} number (5–7 digits)`);
  if (form.branchIds.length === 0) problems.push(isTill ? 'Choose a branch' : 'Choose at least one branch');
  if (isTill && linkedIds.length > 1) problems.push('A Till serves only one table');
  const refErr: Record<string, string> = {};
  if (!isTill) {
    const seen = new Map<string, string>();
    for (const bid of linkedIds) {
      const r = normRef(form.links[bid] ?? '');
      if (!r) refErr[bid] = 'Required';
      else if (seen.has(r)) refErr[bid] = refErr[seen.get(r)!] = 'Must be unique';
      else seen.set(r, bid);
    }
    if (Object.keys(refErr).length) problems.push('Fix the account numbers');
  }
  const firstTime = !c;
  if (firstTime && keysOpen && (!!form.consumerKey || !!form.consumerSecret || !!form.passkey) && !(form.consumerKey && form.consumerSecret && form.passkey)) problems.push('Fill all three Daraja keys, or leave them all blank');

  const save = async () => {
    setError(null);
    setBusy('save');
    const links: CredentialTableLink[] = linkedIds.map((bid) => ({ billiardId: bid, accountRef: isTill ? undefined : form.links[bid].trim() }));
    const input: CredentialInput = {
      label: form.label, shortcode: form.shortcode, shortcodeType: form.shortcodeType, environment: form.environment, branchIds: form.branchIds,
      consumerKey: form.consumerKey, consumerSecret: form.consumerSecret, passkey: form.passkey, callbackBaseUrl: form.callbackBaseUrl,
    };
    try {
      if (!c) {
        const id = await createCredential(companyId, { ...input, tables: links }, setError);
        if (id) onDone?.();
        return;
      }
      const before = fromStored();
      const linksChanged = JSON.stringify(before.links) !== JSON.stringify(form.links);
      // unlink removed tables first so a branch/type change isn't blocked by them
      const removed = Object.keys(before.links).some((bid) => !(bid in form.links));
      if (removed) {
        const keep = links.filter((l) => c.branchIds.includes(companyTables.find((b) => b.id === l.billiardId)?.branchId ?? '') && l.billiardId in before.links);
        if (!(await setCredentialTables(c.id, c.shortcodeType === 'TILL' ? keep.slice(0, 1) : keep, setError))) return;
      }
      const ok = await updateCredential(c.id, input, setError);
      if (!ok) return;
      if (linksChanged && !(await setCredentialTables(c.id, links, setError, { shortcodeType: form.shortcodeType, branchIds: form.branchIds, shortcode: form.shortcode, label: form.label || c.label }))) return;
      setOpen(false);
    } finally {
      setBusy(null);
    }
  };
  const cancel = () => {
    if (dirty && !window.confirm('Discard unsaved changes?')) return;
    setError(null);
    if (c) {
      setForm(fromStored());
      setOpen(false);
    } else onDone?.();
  };
  const register = async () => {
    if (!c) return;
    setBusy('register');
    await registerUrls(c.id);
    setBusy(null);
  };
  const runTest = async () => {
    if (!c) return;
    setBusy('test'); setTest(null);
    try { setTest(await api.post<{ ok: boolean; message: string }>(`/mpesa/credentials/${c.id}/test`)); }
    catch (e) { setTest({ ok: false, message: e instanceof Error ? e.message : String(e) }); }
    finally { setBusy(null); }
  };

  const m = CHANNEL_META.MPESA;
  const typeName = isTill ? 'Till' : 'Paybill';
  const keysOk = !!c && c.hasConsumerKey && c.hasConsumerSecret && c.hasPasskey;
  const storedTables = companyTables.filter((b) => c && b.mpesaCredentialId === c.id);
  const usedCount = Math.max(storedTables.length, c?.tableCount ?? 0);

  // ---------- collapsed summary ----------
  if (c && !open) {
    return (
      <article className="sc-card sc-collapsed" style={{ ['--chan' as string]: m.color, ['--chan-bg' as string]: m.bg }} id={`sc-${uid}`}>
        <div className="sc-head">
          <span className={`sc-type ${c.shortcodeType === 'TILL' ? 'till' : ''}`}>{c.shortcodeType === 'TILL' ? 'Till' : 'Paybill'}</span>
          <div className="sc-title">
            <h3>{c.label || `${c.shortcodeType === 'TILL' ? 'Till' : 'Paybill'} ${c.shortcode}`}</h3>
            <div className="faint mono">{c.shortcode}{c.environment === 'SANDBOX' ? ' · sandbox' : ''}</div>
          </div>
          <div className="sc-pills">
            <span className={`pill ${keysOk ? 'pill-felt' : 'pill-amber'}`} title="Daraja API keys">{keysOk ? <Icon name="check" size={11} strokeWidth={3} /> : '!'} Keys</span>
            <span className={`pill ${c.urlsRegisteredAt ? 'pill-felt' : 'pill-grey'}`} title="Callback URLs registered with Safaricom">{c.urlsRegisteredAt ? <Icon name="check" size={11} strokeWidth={3} /> : '–'} URLs</span>
          </div>
          {editable && <button className="btn btn-ghost btn-sm" id={`sc-edit-${uid}`} onClick={() => setOpen(true)}><Icon name="settings" size={13} /> Edit</button>}
        </div>
        <div className="sc-meta">
          {c.branchIds.map((id) => <span key={id} className="sc-chip"><Icon name="pin" size={11} />{branches.find((b) => b.id === id)?.name ?? id}</span>)}
          <span className="sc-dot" />
          {usedCount === 0 ? (
            <span className="sc-warn">No tables linked yet</span>
          ) : (
            storedTables.map((b) => (
              <span key={b.id} className="sc-chip table">{b.name}{c.shortcodeType !== 'TILL' && b.accountRef ? <b className="mono">· {b.accountRef}</b> : null}</span>
            ))
          )}
        </div>
      </article>
    );
  }

  // ---------- editor ----------
  return (
    <article className="sc-card sc-open" style={{ ['--chan' as string]: m.color, ['--chan-bg' as string]: m.bg }} id={`sc-${uid}`}>
      <div className="sc-head">
        <span className="chan-logo"><Icon name="phone" size={18} /></span>
        <div className="sc-title">
          <h3>{c ? `Edit ${c.label || c.shortcode}` : 'New Paybill / Till'}</h3>
          <div className="faint">Where customers send M-Pesa for your tables</div>
        </div>
      </div>

      {/* 1 · type + details */}
      <section className="sc-step">
        <div className="sc-step-n">1</div>
        <div className="sc-step-body">
          <h4>Shortcode</h4>
          <div className="sc-grid">
            <div className="field">
              <label htmlFor={`sc-type-${uid}`}>Type</label>
              <select id={`sc-type-${uid}`} className="select" value={form.shortcodeType} disabled={!editable} onChange={(e) => changeType(e.target.value as ShortcodeType)}>
                <option value="PAYBILL">Paybill — many tables, account no. per table</option>
                <option value="TILL" disabled={!!c && usedCount > 1}>Till (Buy Goods) — one table{c && usedCount > 1 ? ' (unlink tables first)' : ''}</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor={`sc-number-${uid}`}>{isTill ? 'Till number' : 'Business number'}</label>
              <input id={`sc-number-${uid}`} className="input mono" inputMode="numeric" maxLength={7} placeholder={isTill ? 'e.g. 5091127' : 'e.g. 522533'} value={form.shortcode} disabled={!editable} onChange={(e) => set('shortcode', e.target.value.replace(/\D/g, ''))} />
            </div>
            <div className="field">
              <label htmlFor={`sc-label-${uid}`}>Name <span className="faint">(optional)</span></label>
              <input id={`sc-label-${uid}`} className="input" placeholder={isTill ? 'e.g. Bar Till' : 'e.g. Main Paybill'} value={form.label} disabled={!editable} onChange={(e) => set('label', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor={`sc-env-${uid}`}>Environment</label>
              <select id={`sc-env-${uid}`} className="select" value={form.environment} disabled={!editable} onChange={(e) => set('environment', e.target.value as MpesaEnvironment)}>
                <option value="SANDBOX">Sandbox (testing)</option>
                <option value="PRODUCTION">Production (live money)</option>
              </select>
            </div>
          </div>
        </div>
      </section>

      {/* 2 · branches */}
      <section className="sc-step">
        <div className="sc-step-n">2</div>
        <div className="sc-step-body">
          <h4>{isTill ? 'Branch' : 'Branches'}</h4>
          <div className="sc-grid one">
            <div className="field">
              <label htmlFor={`sc-branch-${uid}`}>{isTill ? 'Which branch is this Till at?' : 'Which branches use this Paybill?'}</label>
              {isTill ? (
                <select id={`sc-branch-${uid}`} className="select" value={form.branchIds[0] ?? ''} disabled={!editable} onChange={(e) => changeBranches(e.target.value ? [e.target.value] : [])}>
                  <option value="">Choose a branch…</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              ) : (
                <BranchMulti id={`sc-branch-${uid}`} options={branches} value={form.branchIds} onChange={changeBranches} disabled={!editable} />
              )}
            </div>
          </div>
        </div>
      </section>

      {/* 3 · tables */}
      <section className="sc-step">
        <div className="sc-step-n">3</div>
        <div className="sc-step-body">
          <h4>{isTill ? 'Table' : 'Tables & account numbers'}</h4>
          {form.branchIds.length === 0 ? (
            <div className="sc-empty">Choose {isTill ? 'a branch' : 'branches'} first.</div>
          ) : isTill ? (
            <>
              <div className="sc-grid one">
                <div className="field">
                  <label htmlFor={`sc-table-${uid}`}>Table that receives payments to this Till</label>
                  <select id={`sc-table-${uid}`} className="select" value={linkedIds[0] ?? ''} disabled={!editable} onChange={(e) => set('links', e.target.value ? { [e.target.value]: '' } : {})}>
                    <option value="">No table yet</option>
                    {pool.map((b) => {
                      const t = tillOwner(b.id);
                      const o = ownerOf(b.id);
                      return <option key={b.id} value={b.id} disabled={!!t}>{b.name}{t ? ` — on Till ${t.shortcode}` : o ? ` — moves from ${o.label || o.shortcode}` : ''}</option>;
                    })}
                  </select>
                </div>
              </div>
              <div className="sc-preview">
                <Icon name="phone" size={14} /> Customer pays: <b>Lipa na M-Pesa → Buy Goods → Till no. <span className="mono">{form.shortcode || '…'}</span></b>
              </div>
              <div className="hint">This Till serves only {linkedIds[0] ? companyTables.find((b) => b.id === linkedIds[0])?.name : 'one table'} — no account number needed.</div>
            </>
          ) : (
            <>
              <ul className="sc-tables">
                {pool.map((b) => {
                  const on = b.id in form.links;
                  const t = tillOwner(b.id);
                  const o = ownerOf(b.id);
                  return (
                    <li key={b.id} className={`${on ? 'on' : ''} ${t ? 'locked' : ''}`}>
                      <label className="sc-tcheck">
                        <input type="checkbox" id={`sc-t-${uid}-${b.id}`} checked={on} disabled={!editable || !!t} onChange={() => toggleTable(b.id)} />
                        <span><b>{b.name}</b><span className="faint">{b.branchName ?? b.branch}{t ? ` · on Till ${t.shortcode}` : o && !on ? ` · on ${o.label || o.shortcode}` : o && on ? ` · moves from ${o.label || o.shortcode}` : ''}</span></span>
                      </label>
                      {on && (
                        <div className="sc-acc">
                          <input
                            aria-label={`Account number for ${b.name}`}
                            id={`sc-acc-${uid}-${b.id}`}
                            className={`input mono ${refErr[b.id] ? 'invalid' : ''}`}
                            placeholder="Account no."
                            maxLength={12}
                            value={form.links[b.id]}
                            disabled={!editable}
                            onChange={(e) => set('links', { ...form.links, [b.id]: e.target.value.toUpperCase() })}
                          />
                          {refErr[b.id] && <span className="sc-err">{refErr[b.id]}</span>}
                        </div>
                      )}
                    </li>
                  );
                })}
                {pool.length === 0 && <li className="sc-empty">No tables in the selected branches.</li>}
              </ul>
              {linkedIds.length > 0 && (
                <div className="sc-preview">
                  <Icon name="phone" size={14} /> Customer pays: <b>Lipa na M-Pesa → Paybill → Business no. <span className="mono">{form.shortcode || '…'}</span> → Account no. <span className="mono">{form.links[linkedIds[0]] || '…'}</span></b>
                  <span className="faint"> (for {companyTables.find((b) => b.id === linkedIds[0])?.name})</span>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* 4 · Daraja keys */}
      <section className="sc-step">
        <div className="sc-step-n">4</div>
        <div className="sc-step-body">
          <button type="button" className="sc-toggle" id={`sc-keys-${uid}`} aria-expanded={keysOpen} onClick={() => setKeysOpen((v) => !v)}>
            <h4>Daraja API <span className="faint">(for STK prompts & confirmations)</span></h4>
            <span className={`pill ${keysOk ? 'pill-felt' : 'pill-grey'}`}>{keysOk ? 'Keys set' : 'Optional'}</span>
            <span className={`sc-caret ${keysOpen ? 'up' : ''}`}>▾</span>
          </button>
          {keysOpen && (
            <div className="sc-keys">
              <div className="sc-grid three">
                <SecretInput id={`sc-key-${uid}`} label="Consumer key" highlight hint={c?.hints?.consumerKey} isSet={!!c?.hasConsumerKey} value={form.consumerKey} onChange={(v) => set('consumerKey', v)} disabled={!editable} />
                <SecretInput id={`sc-secret-${uid}`} label="Consumer secret" highlight hint={c?.hints?.consumerSecret} isSet={!!c?.hasConsumerSecret} value={form.consumerSecret} onChange={(v) => set('consumerSecret', v)} disabled={!editable} />
                <SecretInput id={`sc-passkey-${uid}`} label="Passkey" highlight hint={c?.hints?.passkey} isSet={!!c?.hasPasskey} value={form.passkey} onChange={(v) => set('passkey', v)} disabled={!editable} />
              </div>
              <span className="hint">Saved keys show only a masked preview (Show). Leave blank to keep them.</span>
              <div className="field">
                <label htmlFor={`sc-cb-${uid}`}>Callback host <span className="faint">(optional)</span></label>
                <input id={`sc-cb-${uid}`} className="input mono" placeholder="https://pay.yourdomain.com — blank uses the platform host" value={form.callbackBaseUrl} disabled={!editable} onChange={(e) => set('callbackBaseUrl', e.target.value)} />
              </div>
              {c && (
                <div className="mpesa-urls">
                  <div className="row between" style={{ flexWrap: 'wrap', gap: 8 }}>
                    <div className="faint" style={{ fontSize: 12 }}>{c.urlsRegisteredAt ? <>URLs registered with Safaricom {dateTime(c.urlsRegisteredAt)}</> : 'Not registered yet — Paybill/Till confirmations won’t arrive until you register.'}</div>
                    {editable && (
                      <button id={`sc-test-${uid}`} className="btn btn-felt btn-sm" disabled={!(c.hasConsumerKey && c.hasConsumerSecret) || busy !== null || dirty} onClick={runTest}
                        title={dirty ? 'Save changes first' : 'Request a Daraja access token with the saved keys'}>
                        {busy === 'test' ? <span className="spinner" /> : <Icon name="bolt" size={13} />} Test auth
                      </button>
                    )}
                    {editable && (
                      <button id={`sc-register-${uid}`} className="btn btn-felt btn-sm" disabled={!keysOk || busy !== null} onClick={register} title={keysOk ? 'Register validation & confirmation URLs' : 'Save the keys first'}>
                        {busy === 'register' ? <span className="spinner" /> : <Icon name="globe" size={13} />} {c.urlsRegisteredAt ? 'Re-register URLs' : 'Register URLs'}
                      </button>
                    )}
                  </div>
                  {test && <div className={`momo-test ${test.ok ? 'ok' : 'bad'}`} role="status"><Icon name={test.ok ? 'check' : 'x'} size={13} /> {test.message}</div>}
                  {c.callbackUrls && (
                    <>
                      <CopyField id={`sc-copy-stk-${uid}`} label="STK callback" value={c.callbackUrls.stk} />
                      <CopyField id={`sc-copy-val-${uid}`} label="Validation" value={c.callbackUrls.validation} />
                      <CopyField id={`sc-copy-conf-${uid}`} label="Confirmation" value={c.callbackUrls.confirmation} />
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {(error || (dirty && problems.length > 0)) && (
        <div className="sc-alert" role="alert">
          <Icon name="x" size={13} /> {error ?? problems[0]}
        </div>
      )}

      {editable && (
        <footer className="sc-foot">
          {c && (
            <button className="btn btn-ghost btn-sm sc-del" onClick={() => setConfirmDel(true)} id={`sc-delete-${uid}`} disabled={usedCount > 0 || busy !== null} title={usedCount > 0 ? 'Unlink all tables first' : `Delete this ${typeName}`}>
              <Icon name="trash" size={13} /> Delete
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button className="btn btn-ghost" id={`sc-cancel-${uid}`} onClick={cancel} disabled={busy !== null}>Cancel</button>
          <button id={`sc-save-${uid}`} className="btn btn-brass" disabled={problems.length > 0 || busy !== null || (!!c && !dirty)} onClick={save}>
            {busy === 'save' ? <span className="spinner" /> : <Icon name="check" size={15} />} {c ? 'Save changes' : `Add ${typeName}`}
          </button>
        </footer>
      )}

      {confirmDel && c && (
        <Confirm
          title={`Delete ${c.label || c.shortcode}?`}
          body="STK prompts and confirmations for this shortcode will stop being processed."
          confirmLabel={`Delete ${typeName}`}
          danger
          onConfirm={() => deleteCredential(c.id)}
          onClose={() => setConfirmDel(false)}
        />
      )}
    </article>
  );
}

/** Payment settings: summary + one card per Paybill/Till + add flow. */
export function ShortcodeList({ companyId }: { companyId: string }) {
  const { can, billiards } = useStore();
  const { credentialsOf, loadCredentials } = useMpesa();
  const list = credentialsOf(companyId);
  const [adding, setAdding] = useState(false);
  useEffect(() => {
    loadCredentials(companyId);
  }, [companyId, loadCredentials]);
  const tables = billiards.filter((b) => b.companyId === companyId);
  const linked = tables.filter((b) => b.mpesaCredentialId).length;
  const paybills = list.filter((c) => c.shortcodeType !== 'TILL').length;
  const tills = list.length - paybills;
  const unlinked = tables.length - linked;

  return (
    <div className="sc-list">
      <div className="sc-summary">
        <div><b>{paybills}</b><span>Paybill{paybills === 1 ? '' : 's'}</span></div>
        <div><b>{tills}</b><span>Till{tills === 1 ? '' : 's'}</span></div>
        <div><b>{linked}<small>/{tables.length}</small></b><span>tables on M-Pesa</span></div>
        {unlinked > 0 && <div className="warn" title="These tables can only take cash until linked to a Paybill or Till"><b>{unlinked}</b><span>without M-Pesa</span></div>}
        {can('PAYMENT_CONFIG') && !adding && (
          <button id="sc-add" className="btn btn-brass" onClick={() => setAdding(true)}><Icon name="plus" size={14} /> Add Paybill / Till</button>
        )}
      </div>
      {adding && <ShortcodeCard companyId={companyId} onDone={() => setAdding(false)} />}
      {list.map((c) => <ShortcodeCard key={c.id} companyId={companyId} credId={c.id} />)}
      {list.length === 0 && !adding && (
        <div className="sc-emptystate">
          <Icon name="phone" size={26} />
          <h3>No Paybill or Till yet</h3>
          <p className="faint">Add one so customers can pay for games with M-Pesa.</p>
          {can('PAYMENT_CONFIG') && <button className="btn btn-brass" id="sc-add-empty" onClick={() => setAdding(true)}><Icon name="plus" size={14} /> Add Paybill / Till</button>}
        </div>
      )}
      <div className="hint">Tip: token price and cash are set per table in <Link href="/billiards">Billiards</Link>.</div>
    </div>
  );
}
