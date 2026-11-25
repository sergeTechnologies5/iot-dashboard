"use client";

import { useMemo, useState } from 'react';
import { useStore } from '@/context/Store';
import { money } from '@/lib/format';
import { computeQuote, happyHourActive, ISO_DAYS } from '@/lib/games';
import type { Billiard, PricingRule, PricingRuleType, ReleaseMode } from '@/lib/types';
import { Icon } from './Icon';

type Draft = Omit<PricingRule, 'id'> & { id?: string };

const blank = (billiardId: string, type: PricingRuleType): Draft =>
  type === 'BUNDLE'
    ? { billiardId, type, name: '5 for 4', active: true, games: 5, price: null, daysOfWeek: null, startTime: null, endTime: null, unitPrice: null }
    : { billiardId, type, name: 'Happy hour', active: true, games: null, price: null, daysOfWeek: [1, 2, 3, 4, 5], startTime: '14:00', endTime: '17:00', unitPrice: null };

/**
 * Game settings (release mode, max game length, credit expiry) and pricing
 * rules (bundles, happy hours) for one billiard, with a live quote preview.
 * Editable by the table's Company Super Admin; read-only for everyone else.
 */
export function GameSettingsPanel({ b }: { b: Billiard }) {
  const { user, can, pricingRulesOf, saveGameSettings, savePricingRule, deletePricingRule, now } = useStore();
  const editable = can('PAYMENT_CONFIG') && user?.role === 'COMPANY_SUPER_ADMIN' && user.companyId === b.companyId;
  const rules = pricingRulesOf(b.id);

  const [mode, setMode] = useState<ReleaseMode>(b.releaseMode ?? 'MANUAL');
  const [maxMin, setMaxMin] = useState(String(b.maxGameMinutes ?? 45));
  const [expiryOn, setExpiryOn] = useState(!!b.creditExpiry);
  const [expiry, setExpiry] = useState(b.creditExpiry ?? '23:59');
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [previewBy, setPreviewBy] = useState<'amount' | 'games'>('amount');
  const [previewVal, setPreviewVal] = useState(String(b.tokenPrice * 5));

  const maxNum = Number(maxMin);
  const maxOk = Number.isInteger(maxNum) && maxNum >= 5 && maxNum <= 600;
  const dirty = mode !== b.releaseMode || maxNum !== b.maxGameMinutes || (expiryOn ? expiry : null) !== (b.creditExpiry ?? null);

  const saveSettings = async () => {
    setSaving(true);
    await saveGameSettings(b.id, { releaseMode: mode, maxGameMinutes: maxNum, creditExpiry: expiryOn ? expiry : null });
    setSaving(false);
  };

  // live preview includes the unsaved draft so editors see its effect immediately
  const previewRules = useMemo(() => {
    if (!draft) return rules;
    const d = { ...draft, id: draft.id ?? 'draft' } as PricingRule;
    return [...rules.filter((r) => r.id !== d.id), d];
  }, [rules, draft]);
  const pv = Number(previewVal) || 0;
  const q = computeQuote({ ...b, walletBalance: 0 }, previewRules, previewBy === 'amount' ? { amount: pv } : { games: pv }, now);

  const draftOk =
    !!draft &&
    draft.name.trim() !== '' &&
    (draft.type === 'BUNDLE'
      ? (draft.games ?? 0) >= 2 && (draft.price ?? 0) > 0
      : (draft.unitPrice ?? 0) > 0 && !!draft.startTime && !!draft.endTime && (draft.daysOfWeek?.length ?? 0) > 0);

  const saveDraft = async () => {
    if (!draft) return;
    if (await savePricingRule(draft)) setDraft(null);
  };

  return (
    <div className="grid grid-2-1" style={{ marginTop: 18 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div className="row between">
            <div>
              <h3>Game settings</h3>
              <div className="faint" style={{ fontSize: 12, marginTop: 3 }}>How credits turn into games on {b.name}</div>
            </div>
            {!editable && <span className="pill pill-grey"><Icon name="lock" size={12} /> Read-only</span>}
          </div>

          <div className="field">
            <label>Ball release</label>
            <div className="mode-cards">
              {(['AUTO', 'MANUAL'] as const).map((m) => (
                <button key={m} id={`gs-mode-${m.toLowerCase()}`} className={`mode-card ${mode === m ? 'on' : ''}`} disabled={!editable} onClick={() => setMode(m)}>
                  <Icon name={m === 'AUTO' ? 'bolt' : 'release'} size={18} />
                  <b>{m === 'AUTO' ? 'Automatic' : 'Manual'}</b>
                  <span>{m === 'AUTO' ? 'Balls drop as soon as a paid credit lands, and again after each game while credits remain.' : 'Credits wait on the table until staff press Release.'}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 16 }}>
            <div className="field">
              <label htmlFor="gs-max">Max game length (minutes)</label>
              <input id="gs-max" className="input mono" type="number" min={5} max={600} value={maxMin} disabled={!editable} onChange={(e) => setMaxMin(e.target.value)} />
              <span className="hint" style={maxOk ? undefined : { color: 'var(--danger)' }}>{maxOk ? 'Games still running after this are closed as timed out' : 'Between 5 and 600 minutes'}</span>
            </div>
            <div className="field">
              <label htmlFor="gs-expiry">Unused credits expire</label>
              <div className="row">
                <button id="gs-expiry-toggle" className={`switch ${expiryOn ? 'on' : ''}`} disabled={!editable} onClick={() => setExpiryOn((v) => !v)} aria-pressed={expiryOn} aria-label="Credit expiry" />
                <input id="gs-expiry" className="input mono" type="time" value={expiry} disabled={!editable || !expiryOn} onChange={(e) => setExpiry(e.target.value)} style={{ maxWidth: 130 }} />
              </div>
              <span className="hint">{expiryOn ? `Paid credits left at ${expiry} each day are cleared` : 'Credits carry over until used'}</span>
            </div>
          </div>

          {editable && (
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button id="gs-save" className="btn btn-brass" disabled={!dirty || !maxOk || saving} onClick={saveSettings}>
                {saving ? <span className="spinner" /> : <Icon name="check" size={15} />} Save game settings
              </button>
            </div>
          )}
        </div>

        <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="row between">
            <div>
              <h3>Pricing rules</h3>
              <div className="faint" style={{ fontSize: 12, marginTop: 3 }}>Bundles and happy hours applied automatically to purchases</div>
            </div>
            {editable && !draft && (
              <div className="row">
                <button id="rule-add-bundle" className="btn btn-sm" onClick={() => setDraft(blank(b.id, 'BUNDLE'))}><Icon name="plus" size={13} /> Bundle</button>
                <button id="rule-add-hh" className="btn btn-sm" onClick={() => setDraft(blank(b.id, 'HAPPY_HOUR'))}><Icon name="clock" size={13} /> Happy hour</button>
              </div>
            )}
          </div>

          {rules.length === 0 && !draft && <div className="empty" style={{ padding: 18 }}>No pricing rules · every game costs {money(b.tokenPrice, b.currency)}</div>}

          {rules.map((r) => (
            <div key={r.id} className={`rule-row ${r.active ? '' : 'off'} ${happyHourActive(r, now) ? 'live' : ''}`}>
              <span className={`rule-ico ${r.type === 'BUNDLE' ? 'bundle' : 'hh'}`}><Icon name={r.type === 'BUNDLE' ? 'coins' : 'clock'} size={15} /></span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <b>{r.name}</b>
                <div className="faint" style={{ fontSize: 12 }}>
                  {r.type === 'BUNDLE'
                    ? `${r.games} games for ${money(r.price ?? 0, b.currency)} · saves ${money((r.games ?? 0) * b.tokenPrice - (r.price ?? 0), b.currency)}`
                    : `${(r.daysOfWeek ?? []).map((d) => ISO_DAYS[d - 1]).join(' ')} · ${r.startTime}–${r.endTime} · ${money(r.unitPrice ?? 0, b.currency)}/game`}
                  {happyHourActive(r, now) && <span className="pill pill-felt" style={{ marginLeft: 8 }}>Live now</span>}
                </div>
              </div>
              {editable && (
                <div className="row" style={{ gap: 6 }}>
                  <button className={`switch sm ${r.active ? 'on' : ''}`} onClick={() => savePricingRule({ ...r, active: !r.active })} aria-label="Active" aria-pressed={r.active} />
                  <button className="btn btn-ghost btn-sm" onClick={() => setDraft({ ...r })} title="Edit"><Icon name="settings" size={13} /></button>
                  <button className="btn btn-ghost btn-sm" onClick={() => deletePricingRule(r)} title="Delete"><Icon name="trash" size={13} /></button>
                </div>
              )}
            </div>
          ))}

          {draft && (
            <div className="rule-editor">
              <div className="grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 12 }}>
                <div className="field">
                  <label htmlFor="rule-name">Name</label>
                  <input id="rule-name" className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                </div>
                {draft.type === 'BUNDLE' ? (
                  <>
                    <div className="field">
                      <label htmlFor="rule-games">Games</label>
                      <input id="rule-games" className="input mono" type="number" min={2} value={draft.games ?? ''} onChange={(e) => setDraft({ ...draft, games: Number(e.target.value) || null })} />
                    </div>
                    <div className="field">
                      <label htmlFor="rule-price">Bundle price ({b.currency})</label>
                      <input id="rule-price" className="input mono" type="number" min={1} placeholder={String((draft.games ?? 0) * b.tokenPrice)} value={draft.price ?? ''} onChange={(e) => setDraft({ ...draft, price: Number(e.target.value) || null })} />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="field">
                      <label>Window</label>
                      <div className="row" style={{ gap: 6 }}>
                        <input id="rule-start" className="input mono" type="time" value={draft.startTime ?? ''} onChange={(e) => setDraft({ ...draft, startTime: e.target.value })} />
                        <input id="rule-end" className="input mono" type="time" value={draft.endTime ?? ''} onChange={(e) => setDraft({ ...draft, endTime: e.target.value })} />
                      </div>
                    </div>
                    <div className="field">
                      <label htmlFor="rule-unit">Price per game ({b.currency})</label>
                      <input id="rule-unit" className="input mono" type="number" min={1} placeholder={String(Math.round(b.tokenPrice * 0.7))} value={draft.unitPrice ?? ''} onChange={(e) => setDraft({ ...draft, unitPrice: Number(e.target.value) || null })} />
                    </div>
                  </>
                )}
              </div>
              {draft.type === 'HAPPY_HOUR' && (
                <div className="chips" style={{ gap: 6 }}>
                  {ISO_DAYS.map((d, i) => {
                    const on = draft.daysOfWeek?.includes(i + 1);
                    return (
                      <button key={d} id={`rule-day-${i + 1}`} className={`day-chip ${on ? 'on' : ''}`} onClick={() => setDraft({ ...draft, daysOfWeek: on ? (draft.daysOfWeek ?? []).filter((x) => x !== i + 1) : [...(draft.daysOfWeek ?? []), i + 1].sort() })}>
                        {d}
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="row" style={{ justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setDraft(null)}>Cancel</button>
                <button id="rule-save" className="btn btn-brass btn-sm" disabled={!draftOk} onClick={saveDraft}><Icon name="check" size={13} /> {draft.id ? 'Update rule' : 'Add rule'}</button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 14, alignSelf: 'start' }}>
        <h3>Quote preview</h3>
        <p className="faint" style={{ margin: 0, fontSize: 12 }}>What a purchase would buy right now{draft ? ' (including the rule being edited)' : ''}</p>
        <div className="segmented" style={{ alignSelf: 'flex-start' }}>
          <button className={previewBy === 'amount' ? 'active' : ''} onClick={() => setPreviewBy('amount')}>By amount</button>
          <button className={previewBy === 'games' ? 'active' : ''} onClick={() => setPreviewBy('games')}>By games</button>
        </div>
        <input id="quote-input" className="input mono" inputMode="decimal" value={previewVal} onChange={(e) => setPreviewVal(e.target.value.replace(/[^\d.]/g, ''))} />
        <div className="summary-box" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
          <span className="faint" style={{ fontSize: 12 }}>{previewBy === 'amount' ? `${money(pv, b.currency)} buys` : `${pv} games cost`}</span>
          <span className="mono" style={{ fontSize: 26, fontWeight: 700, color: 'var(--brass-2)' }}>{previewBy === 'amount' ? `${q.games} game${q.games === 1 ? '' : 's'}` : money(q.amount, b.currency)}</span>
          <span className="faint" style={{ fontSize: 12 }}>{money(q.unitPrice, b.currency)} per game{q.rule ? ` · ${q.rule.name}` : ''}</span>
          {previewBy === 'amount' && q.remainder > 0 && <span className="faint" style={{ fontSize: 12 }}>{money(q.remainder, b.currency)} carried to the table wallet</span>}
        </div>
      </div>
    </div>
  );
}
