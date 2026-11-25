"use client";

/**
 * Payment settings (Rwanda): MTN MoMo and Airtel Money merchant accounts.
 * One card per account. Order: details → branches → tables → API credentials → test connection.
 * Talks to /companies/{id}/momo/credentials and /momo/credentials/{id}[/tables|/test].
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useStore } from '@/context/Store';
import { CHANNEL_META } from '@/lib/channels';
import { dateTime } from '@/lib/format';
import type { MomoChannel, MomoCredential, MpesaEnvironment } from '@/lib/types';
import { Icon } from './Icon';
import { Confirm } from './overlays';
import { CopyField, SecretInput } from './MpesaPanels';
import { BranchMulti } from './ShortcodeCard';

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

const PROVIDER: Record<MomoChannel, { name: string; code: string; codeHint: string; how: (code: string) => string; prefixes: string }> = {
  MTN_RW: {
    name: 'MTN MoMo',
    code: 'MoMo Pay merchant code',
    codeHint: 'e.g. 123456',
    how: () => 'Customer gets a MoMo prompt on 078/079 → enters PIN',
    prefixes: '078 · 079',
  },
  AIRTEL_RW: {
    name: 'Airtel Money',
    code: 'Airtel merchant number',
    codeHint: 'e.g. 4012345',
    how: () => 'Customer gets an Airtel Money USSD prompt on 072/073 → enters PIN',
    prefixes: '072 · 073',
  },
};

interface Form {
  label: string;
  merchantCode: string;
  environment: MpesaEnvironment;
  branchIds: string[];
  tableIds: string[];
  apiUser: string;
  apiKey: string;
  subscriptionKey: string;
  targetEnvironment: string;
  clientId: string;
  clientSecret: string;
  signingPublicKey: string;
  signingEnabled: boolean;
  callbackBaseUrl: string;
}

function MomoCard({ companyId, channel, cred, others, onSaved, onDeleted, onCancel }: {
  companyId: string;
  channel: MomoChannel;
  cred?: MomoCredential;
  others: MomoCredential[];
  onSaved: (c: MomoCredential) => void;
  onDeleted?: (id: string) => void;
  onCancel?: () => void;
}) {
  const { can, branchesOf, billiards, toast } = useStore();
  const editable = can('PAYMENT_CONFIG');
  const branches = branchesOf(companyId);
  const companyTables = useMemo(() => billiards.filter((b) => b.companyId === companyId), [billiards, companyId]);
  const p = PROVIDER[channel];
  const m = CHANNEL_META[channel];
  const isMtn = channel === 'MTN_RW';
  const uid = `${channel.toLowerCase()}-${cred?.id ?? 'new'}`;

  const fromStored = useCallback((): Form => ({
    label: cred?.label ?? '',
    merchantCode: cred?.merchantCode ?? '',
    environment: cred?.environment ?? 'SANDBOX',
    branchIds: cred ? [...cred.branchIds] : branches.length === 1 ? [branches[0].id] : [],
    tableIds: cred ? cred.tables.map((t) => t.id) : [],
    apiUser: '', apiKey: '', subscriptionKey: '',
    targetEnvironment: cred?.targetEnvironment ?? '',
    clientId: '', clientSecret: '', signingPublicKey: '',
    signingEnabled: cred?.signingEnabled ?? false,
    callbackBaseUrl: cred?.callbackBaseUrl ?? '',
  }), [cred, branches]);

  const [form, setForm] = useState<Form>(fromStored);
  const [open, setOpen] = useState(!cred);
  const [busy, setBusy] = useState<'save' | 'test' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);

  // resync from the server copy only when it really changes (branchesOf() returns a new array every render)
  const sig = cred ? `${cred.id}|${cred.updatedAt}|${cred.verifiedAt}|${cred.branchIds.join(',')}|${cred.tables.map((t) => t.id).join(',')}` : '';
  useEffect(() => {
    if (!open && cred) setForm(fromStored()); // eslint-disable-line react-hooks/set-state-in-effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, open]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const dirty = JSON.stringify(form) !== JSON.stringify(fromStored());
  const pool = companyTables.filter((b) => form.branchIds.includes(b.branchId));
  const ownerOf = (bid: string) => others.find((o) => o.tables.some((t) => t.id === bid));
  const changeBranches = (ids: string[]) =>
    setForm((f) => ({ ...f, branchIds: ids, tableIds: f.tableIds.filter((t) => ids.includes(companyTables.find((b) => b.id === t)?.branchId ?? '')) }));
  const toggleTable = (bid: string) => setForm((f) => ({ ...f, tableIds: f.tableIds.includes(bid) ? f.tableIds.filter((x) => x !== bid) : [...f.tableIds, bid] }));

  const keysOk = isMtn
    ? !!cred && cred.hasApiUser && cred.hasApiKey && cred.hasSubscriptionKey
    : !!cred && cred.hasClientId && cred.hasClientSecret && (!cred.signingEnabled || cred.hasSigningKey);

  // ----- validation -----
  const problems: string[] = [];
  if (!/^[A-Za-z0-9_-]{3,32}$/.test(form.merchantCode.trim())) problems.push(`Enter the ${p.code}`);
  if (form.branchIds.length === 0) problems.push('Choose at least one branch');
  if (isMtn && form.apiUser && !/^[0-9a-fA-F-]{32,36}$/.test(form.apiUser.trim())) problems.push('MTN API user must be a UUID');
  if (isMtn && form.targetEnvironment.trim() && !/^[A-Za-z0-9_-]+$/.test(form.targetEnvironment.trim())) problems.push('Target environment is a name like “mtnrwanda”, not a URL');
  if (!cred) {
    if (isMtn && !(form.apiUser && form.apiKey && form.subscriptionKey)) problems.push('Fill the API user, API key and subscription key');
    if (!isMtn && !(form.clientId && form.clientSecret)) problems.push('Fill the client ID and client secret');
  }
  if (!isMtn && form.signingEnabled && !form.signingPublicKey && !cred?.hasSigningKey) problems.push('Paste Airtel’s RSA public key to enable message signing');

  const save = async () => {
    setError(null);
    setBusy('save');
    const body = {
      channel, label: form.label, merchantCode: form.merchantCode.trim(), environment: form.environment, branchIds: form.branchIds,
      apiUser: form.apiUser, apiKey: form.apiKey, subscriptionKey: form.subscriptionKey, targetEnvironment: form.targetEnvironment,
      clientId: form.clientId, clientSecret: form.clientSecret, signingPublicKey: form.signingPublicKey, signingEnabled: form.signingEnabled,
      callbackBaseUrl: form.callbackBaseUrl, tableIds: form.tableIds,
    };
    try {
      const saved = cred
        ? await api.put<MomoCredential>(`/momo/credentials/${cred.id}`, body)
        : await api.post<MomoCredential>(`/companies/${companyId}/momo/credentials`, body);
      toast({ tone: 'success', title: `${p.name} account ${cred ? 'saved' : 'added'}`, detail: saved.label ?? saved.merchantCode });
      setTest(null);
      onSaved(saved);
      setOpen(false);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  const runTest = async () => {
    if (!cred) return;
    setBusy('test');
    try {
      const r = await api.post<{ ok: boolean; message: string }>(`/momo/credentials/${cred.id}/test`);
      setTest(r);
      if (r.ok) onSaved({ ...cred, verifiedAt: Date.now() });
    } catch (e) {
      setTest({ ok: false, message: errMsg(e) });
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!cred) return;
    try {
      await api.del(`/momo/credentials/${cred.id}`);
      toast({ tone: 'info', title: `${p.name} account removed` });
      onDeleted?.(cred.id);
    } catch (e) {
      toast({ tone: 'danger', title: 'Could not remove account', detail: errMsg(e) });
    }
  };

  const cancel = () => {
    if (dirty && !window.confirm('Discard unsaved changes?')) return;
    setError(null);
    if (cred) { setForm(fromStored()); setOpen(false); } else onCancel?.();
  };

  const style = { ['--chan' as string]: m.color, ['--chan-bg' as string]: m.bg };

  // ---------- collapsed summary ----------
  if (cred && !open) {
    return (
      <article className={`sc-card sc-collapsed momo-card momo-${channel.toLowerCase()}`} style={style} id={`momo-${uid}`}>
        <div className="sc-head">
          <span className="momo-mark">{isMtn ? 'MTN' : 'airtel'}</span>
          <div className="sc-title">
            <h3>{cred.label || `${p.name} ${cred.merchantCode}`}{!cred.active && <span className="pill pill-grey" style={{ marginLeft: 8 }}>Inactive</span>}</h3>
            <div className="faint mono">{cred.merchantCode}{cred.environment === 'SANDBOX' ? ' · sandbox' : ' · live'}</div>
          </div>
          <div className="sc-pills">
            <span className={`pill ${keysOk ? 'pill-felt' : 'pill-amber'}`} title="API credentials">{keysOk ? <Icon name="check" size={11} strokeWidth={3} /> : '!'} Keys</span>
            <span className={`pill ${cred.verifiedAt ? 'pill-felt' : 'pill-grey'}`} title="Connection test">{cred.verifiedAt ? <Icon name="check" size={11} strokeWidth={3} /> : '–'} Verified</span>
            {!isMtn && cred.signingEnabled && <span className="pill pill-felt" title="Airtel message signing"><Icon name="shield" size={11} /> Signed</span>}
          </div>
          {editable && <button className="btn btn-ghost btn-sm" id={`momo-edit-${uid}`} onClick={() => setOpen(true)}><Icon name="settings" size={13} /> Edit</button>}
        </div>
        <div className="sc-meta">
          {cred.branchIds.map((id) => <span key={id} className="sc-chip"><Icon name="pin" size={11} />{branches.find((b) => b.id === id)?.name ?? id}</span>)}
          <span className="sc-dot" />
          {cred.tables.length === 0 ? <span className="sc-warn">No tables linked yet</span> : cred.tables.map((t) => <span key={t.id} className="sc-chip table">{t.name}</span>)}
        </div>
      </article>
    );
  }

  // ---------- editor ----------
  return (
    <article className={`sc-card sc-open momo-card momo-${channel.toLowerCase()}`} style={style} id={`momo-${uid}`}>
      <div className="sc-head">
        <span className="momo-mark">{isMtn ? 'MTN' : 'airtel'}</span>
        <div className="sc-title">
          <h3>{cred ? `Edit ${cred.label || cred.merchantCode}` : `New ${p.name} account`}</h3>
          <div className="faint">{p.how('')}</div>
        </div>
      </div>

      {/* 1 · details */}
      <section className="sc-step">
        <div className="sc-step-n">1</div>
        <div className="sc-step-body">
          <h4>Merchant account</h4>
          <div className="sc-grid">
            <div className="field">
              <label htmlFor={`momo-code-${uid}`}>{p.code}</label>
              <input id={`momo-code-${uid}`} className="input mono" placeholder={p.codeHint} value={form.merchantCode} disabled={!editable} onChange={(e) => set('merchantCode', e.target.value.trim())} />
            </div>
            <div className="field">
              <label htmlFor={`momo-label-${uid}`}>Name <span className="faint">(optional)</span></label>
              <input id={`momo-label-${uid}`} className="input" placeholder={`e.g. ${p.name} Kigali`} value={form.label} disabled={!editable} onChange={(e) => set('label', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor={`momo-env-${uid}`}>Environment</label>
              <select id={`momo-env-${uid}`} className="select" value={form.environment} disabled={!editable} onChange={(e) => set('environment', e.target.value as MpesaEnvironment)}>
                <option value="SANDBOX">Sandbox (testing{isMtn ? ', EUR' : ''})</option>
                <option value="PRODUCTION">Production (live RWF)</option>
              </select>
            </div>
          </div>
        </div>
      </section>

      {/* 2 · branches */}
      <section className="sc-step">
        <div className="sc-step-n">2</div>
        <div className="sc-step-body">
          <h4>Branches</h4>
          <div className="sc-grid one">
            <div className="field">
              <label htmlFor={`momo-branch-${uid}`}>Which branches collect with this account?</label>
              <BranchMulti id={`momo-branch-${uid}`} options={branches} value={form.branchIds} onChange={changeBranches} disabled={!editable} />
            </div>
          </div>
        </div>
      </section>

      {/* 3 · tables */}
      <section className="sc-step">
        <div className="sc-step-n">3</div>
        <div className="sc-step-body">
          <h4>Tables</h4>
          {form.branchIds.length === 0 ? (
            <div className="sc-empty">Choose branches first.</div>
          ) : (
            <ul className="sc-tables">
              {pool.map((b) => {
                const on = form.tableIds.includes(b.id);
                const o = ownerOf(b.id);
                return (
                  <li key={b.id} className={on ? 'on' : ''}>
                    <label className="sc-tcheck">
                      <input type="checkbox" id={`momo-t-${uid}-${b.id}`} checked={on} disabled={!editable} onChange={() => toggleTable(b.id)} />
                      <span><b>{b.name}</b><span className="faint">{b.branchName ?? b.branch}{o ? (on ? ` · moves from ${o.label || o.merchantCode}` : ` · on ${o.label || o.merchantCode}`) : ''}</span></span>
                    </label>
                  </li>
                );
              })}
              {pool.length === 0 && <li className="sc-empty">No tables in the selected branches.</li>}
            </ul>
          )}
          <div className="sc-preview"><Icon name="phone" size={14} /> <b>{p.how('')}</b> <span className="faint">· numbers {p.prefixes} are routed here automatically</span></div>
        </div>
      </section>

      {/* 4 · credentials */}
      <section className="sc-step">
        <div className="sc-step-n">4</div>
        <div className="sc-step-body">
          <h4>{isMtn ? 'MoMo Open API (Collection)' : 'Airtel Open API (Collection)'} <span className={`pill ${keysOk ? 'pill-felt' : 'pill-amber'}`} style={{ marginLeft: 6 }}>{keysOk ? 'Keys set' : 'Required'}</span></h4>
          <div className="sc-keys">
            {isMtn ? (
              <>
                <div className="sc-grid three">
                  <SecretInput id={`momo-apiuser-${uid}`} highlight hint={cred?.hints?.apiUser} source="MTN MoMo portal" label="API user (UUID)" isSet={!!cred?.hasApiUser} value={form.apiUser} onChange={(v) => set('apiUser', v)} disabled={!editable} />
                  <SecretInput id={`momo-apikey-${uid}`} highlight hint={cred?.hints?.apiKey} source="MTN MoMo portal" label="API key" isSet={!!cred?.hasApiKey} value={form.apiKey} onChange={(v) => set('apiKey', v)} disabled={!editable} />
                  <SecretInput id={`momo-sub-${uid}`} highlight hint={cred?.hints?.subscriptionKey} source="MTN MoMo portal" label="Subscription key (Ocp-Apim)" isSet={!!cred?.hasSubscriptionKey} value={form.subscriptionKey} onChange={(v) => set('subscriptionKey', v)} disabled={!editable} />
                </div>
                <div className="field">
                  <label htmlFor={`momo-target-${uid}`}>Target environment <span className="faint">(optional)</span></label>
                  <input id={`momo-target-${uid}`} className="input mono" placeholder={form.environment === 'PRODUCTION' ? 'mtnrwanda' : 'sandbox'} value={form.targetEnvironment} disabled={!editable} onChange={(e) => set('targetEnvironment', e.target.value)} />
                </div>
              </>
            ) : (
              <>
                <div className="sc-grid">
                  <SecretInput id={`momo-cid-${uid}`} highlight hint={cred?.hints?.clientId} source="Airtel developer portal" label="Client ID" isSet={!!cred?.hasClientId} value={form.clientId} onChange={(v) => set('clientId', v)} disabled={!editable} />
                  <SecretInput id={`momo-csec-${uid}`} highlight hint={cred?.hints?.clientSecret} source="Airtel developer portal" label="Client secret" isSet={!!cred?.hasClientSecret} value={form.clientSecret} onChange={(v) => set('clientSecret', v)} disabled={!editable} />
                </div>
                <label className="momo-switch" htmlFor={`momo-sign-${uid}`}>
                  <input id={`momo-sign-${uid}`} type="checkbox" checked={form.signingEnabled} disabled={!editable} onChange={(e) => set('signingEnabled', e.target.checked)} />
                  <span className="momo-switch-track" aria-hidden />
                  <span><b>Message signing</b> <span className="faint">— turn on if it is enabled for your app in the Airtel portal</span></span>
                </label>
                {form.signingEnabled && (
                  <div className="field">
                    <label htmlFor={`momo-pk-${uid}`}>Airtel RSA public key {cred?.hasSigningKey && <span className="pill pill-felt" style={{ marginLeft: 6 }}>Saved</span>}</label>
                    <textarea id={`momo-pk-${uid}`} className="input mono momo-pem" rows={4} placeholder={cred?.hasSigningKey ? 'Leave blank to keep the saved key' : '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqh…\n-----END PUBLIC KEY-----'} value={form.signingPublicKey} disabled={!editable} onChange={(e) => set('signingPublicKey', e.target.value)} />
                  </div>
                )}
              </>
            )}
            <span className="hint">Write-only: saved secrets are never shown again. Leave blank to keep them.</span>
            <div className="field">
              <label htmlFor={`momo-cb-${uid}`}>Callback host <span className="faint">(optional)</span></label>
              <input id={`momo-cb-${uid}`} className="input mono" placeholder="https://pay.yourdomain.com — blank uses the platform host" value={form.callbackBaseUrl} disabled={!editable} onChange={(e) => set('callbackBaseUrl', e.target.value)} />
            </div>
            {cred && (
              <div className="mpesa-urls">
                <CopyField id={`momo-copy-cb-${uid}`} label={isMtn ? 'Callback (sent with every request — whitelist this host on your API user)' : 'Callback URL (paste into your Airtel app settings)'} value={cred.callbackUrls.callback} />
                <div className="row between" style={{ flexWrap: 'wrap', gap: 8 }}>
                  <div className="faint" style={{ fontSize: 12 }}>{cred.verifiedAt ? <>Connection verified {dateTime(cred.verifiedAt)}</> : 'Not verified yet — test the connection after saving keys.'}</div>
                  {editable && (
                    <button id={`momo-test-${uid}`} className="btn btn-felt btn-sm" disabled={!keysOk || busy !== null || dirty} onClick={runTest} title={dirty ? 'Save changes first' : keysOk ? 'Request an access token with these keys' : 'Save the keys first'}>
                      {busy === 'test' ? <span className="spinner" /> : <Icon name="bolt" size={13} />} Test connection
                    </button>
                  )}
                </div>
                {test && <div className={`momo-test ${test.ok ? 'ok' : 'bad'}`} role="status"><Icon name={test.ok ? 'check' : 'x'} size={13} /> {test.message}</div>}
              </div>
            )}
          </div>
        </div>
      </section>

      {(error || (dirty && problems.length > 0)) && (
        <div className="sc-alert" role="alert"><Icon name="x" size={13} /> {error ?? problems[0]}</div>
      )}

      {editable && (
        <footer className="sc-foot">
          {cred && (
            <button className="btn btn-ghost btn-sm sc-del" onClick={() => setConfirmDel(true)} id={`momo-delete-${uid}`} disabled={cred.tables.length > 0 || busy !== null} title={cred.tables.length > 0 ? 'Unlink all tables first' : 'Delete this account'}>
              <Icon name="trash" size={13} /> Delete
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button className="btn btn-ghost" id={`momo-cancel-${uid}`} onClick={cancel} disabled={busy !== null}>Cancel</button>
          <button id={`momo-save-${uid}`} className="btn btn-brass" disabled={problems.length > 0 || busy !== null || (!!cred && !dirty)} onClick={save}>
            {busy === 'save' ? <span className="spinner" /> : <Icon name="check" size={15} />} {cred ? 'Save changes' : `Add ${p.name}`}
          </button>
        </footer>
      )}

      {confirmDel && cred && (
        <Confirm
          title={`Delete ${cred.label || cred.merchantCode}?`}
          body={`${p.name} prompts for this account will stop being sent and callbacks will be ignored.`}
          confirmLabel="Delete account"
          danger
          onConfirm={remove}
          onClose={() => setConfirmDel(false)}
        />
      )}
    </article>
  );
}

/** Payment settings section for one Rwandan provider (MTN_RW or AIRTEL_RW). */
export function MomoAccountList({ companyId, channel }: { companyId: string; channel: MomoChannel }) {
  const { can, billiards, toast } = useStore();
  const [list, setList] = useState<MomoCredential[] | null>(null);
  const [adding, setAdding] = useState(false);
  const p = PROVIDER[channel];

  // reload when table links change elsewhere (BILLIARD_UPDATED keeps `billiards` live)
  const linkSig = billiards.filter((b) => b.companyId === companyId).map((b) => `${b.id}:${channel === 'MTN_RW' ? b.mtnCredentialId : b.airtelCredentialId}`).join(',');
  useEffect(() => {
    let alive = true;
    api.get<MomoCredential[]>(`/companies/${companyId}/momo/credentials?channel=${channel}`)
      .then((r) => alive && setList(r))
      .catch((e) => { if (alive) { setList([]); toast({ tone: 'danger', title: `Could not load ${p.name} accounts`, detail: errMsg(e) }); } });
    return () => { alive = false; };
  }, [companyId, channel, linkSig, p.name, toast]);

  const upsert = (c: MomoCredential) => setList((l) => (l ?? []).some((x) => x.id === c.id) ? (l ?? []).map((x) => (x.id === c.id ? c : x)) : [...(l ?? []), c]);
  const tables = billiards.filter((b) => b.companyId === companyId);
  const linked = tables.filter((b) => (channel === 'MTN_RW' ? b.mtnCredentialId : b.airtelCredentialId)).length;
  const verified = (list ?? []).filter((c) => c.verifiedAt).length;

  return (
    <div className="sc-list">
      <div className="sc-summary">
        <div><b>{list?.length ?? '…'}</b><span>account{list?.length === 1 ? '' : 's'}</span></div>
        <div><b>{verified}</b><span>verified</span></div>
        <div><b>{linked}<small>/{tables.length}</small></b><span>tables on {p.name}</span></div>
        {can('PAYMENT_CONFIG') && !adding && (
          <button id={`momo-add-${channel.toLowerCase()}`} className="btn btn-brass" onClick={() => setAdding(true)}><Icon name="plus" size={14} /> Add {p.name} account</button>
        )}
      </div>
      {list === null && <div className="sc-empty"><span className="spinner" /> Loading…</div>}
      {adding && list && <MomoCard companyId={companyId} channel={channel} others={list} onSaved={(c) => { upsert(c); setAdding(false); }} onCancel={() => setAdding(false)} />}
      {list?.map((c) => (
        <MomoCard key={c.id} companyId={companyId} channel={channel} cred={c} others={list.filter((x) => x.id !== c.id)} onSaved={upsert} onDeleted={(id) => setList((l) => (l ?? []).filter((x) => x.id !== id))} />
      ))}
      {list && list.length === 0 && !adding && (
        <div className="sc-emptystate">
          <Icon name="phone" size={26} />
          <h3>No {p.name} account yet</h3>
          <p className="faint">Add your merchant API credentials so customers on {p.prefixes} can pay by PIN prompt.</p>
          {can('PAYMENT_CONFIG') && <button className="btn btn-brass" id={`momo-add-empty-${channel.toLowerCase()}`} onClick={() => setAdding(true)}><Icon name="plus" size={14} /> Add {p.name} account</button>}
        </div>
      )}
    </div>
  );
}
