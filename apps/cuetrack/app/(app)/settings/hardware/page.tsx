"use client";

/**
 * Super Admin: hardware test bench. Test the ball-release servo on any table
 * (full release cycle / back to rest) and open the full calibration panel.
 * Test moves never consume credits or start a game.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useStore } from '@/context/Store';
import type { Billiard } from '@/lib/types';
import { DEFAULT_SERVO } from '@/lib/types';
import { StatusPill } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { ServoCalibrationPanel } from '@/components/ServoCalibrationPanel';

type Result = { ok: boolean; msg: string; at: number };

export default function HardwareSettingsPage() {
  const { user, billiards, companyName, servoTest } = useStore();
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, Result>>({});

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return billiards
      .filter((b) => !s || `${b.name} ${b.branch} ${companyName(b.companyId)}`.toLowerCase().includes(s))
      .sort((a, b) => companyName(a.companyId).localeCompare(companyName(b.companyId)) || a.name.localeCompare(b.name));
  }, [billiards, q, companyName]);

  if (user?.role !== 'SUPER_ADMIN') {
    return (
      <div className="card card-pad empty">
        <Icon name="shield" size={28} />
        <h3 style={{ margin: '12px 0 6px' }}>Hardware test</h3>
        <p>Only Super Admins can test and calibrate table hardware.</p>
      </div>
    );
  }

  const online = billiards.filter((b) => b.status !== 'OFFLINE').length;
  const sel = billiards.find((b) => b.id === selected) ?? null;

  const blockReason = (b: Billiard) =>
    b.status === 'OFFLINE' ? 'Table is offline' : b.pending || b.currentGame ? 'Release or game in progress' : null;

  const run = async (b: Billiard, action: 'OPEN' | 'REST') => {
    setBusy((m) => ({ ...m, [b.id]: action }));
    const ok = await servoTest(b.id, action);
    setResults((m) => ({
      ...m,
      [b.id]: { ok, at: Date.now(), msg: ok ? (action === 'OPEN' ? 'Release cycle sent' : 'Gate moved to rest') : 'Command failed' },
    }));
    const cfg = b.servo ?? DEFAULT_SERVO;
    const wait = action === 'OPEN' ? cfg.moveMs * 2 + cfg.holdMs : cfg.moveMs;
    setTimeout(() => setBusy((m) => { const n = { ...m }; delete n[b.id]; return n; }), Math.min(wait, 6000));
  };

  const testAll = async () => {
    for (const b of list) if (!blockReason(b) && !busy[b.id]) await run(b, 'OPEN');
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Hardware test</h1>
          <p>Check that each table&apos;s servo releases the balls. Test moves don&apos;t use credits or start games.</p>
        </div>
        <div className="row">
          <span className="pill pill-felt"><span className="dot" />{online}/{billiards.length} online</span>
          <button id="hw-test-all" className="btn btn-felt" onClick={testAll} disabled={online === 0}>
            <Icon name="release" size={14} /> Release on all online
          </button>
        </div>
      </div>

      <div className="card card-pad" style={{ marginTop: 16 }}>
        <div className="row between" style={{ flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
          <h3>Tables</h3>
          <input id="hw-search" className="input" placeholder="Search table, branch or company…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 280 }} />
        </div>
        <div className="hw-list">
          {list.map((b) => {
            const reason = blockReason(b);
            const cfg = b.servo ?? DEFAULT_SERVO;
            const r = results[b.id];
            const running = busy[b.id];
            return (
              <div key={b.id} className={`hw-row ${selected === b.id ? 'active' : ''}`}>
                <div className="hw-name">
                  <Link href={`/billiards/${b.id}`}><b>{b.name}</b></Link>
                  <div className="faint" style={{ fontSize: 12 }}>{companyName(b.companyId)} · {b.branch}</div>
                </div>
                <StatusPill status={b.status} />
                <div className="mono faint hw-cfg" title="Rest / open angle · open time">
                  {cfg.restAngle}° → {cfg.openAngle}° · {(cfg.holdMs / 1000).toFixed(1)}s
                </div>
                <div className="hw-result" style={{ fontSize: 12 }}>
                  {running ? <span className="pill pill-amber"><span className="spinner" /> Moving…</span>
                    : r ? <span className={`pill ${r.ok ? 'pill-felt' : 'pill-danger'}`}><Icon name={r.ok ? 'check' : 'x'} size={11} /> {r.msg}</span>
                    : reason ? <span className="faint">{reason}</span> : null}
                </div>
                <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                  <button id={`hw-rest-${b.id}`} className="btn btn-sm" disabled={!!reason || !!running} onClick={() => run(b, 'REST')}>Rest</button>
                  <button id={`hw-release-${b.id}`} className="btn btn-felt btn-sm" disabled={!!reason || !!running} onClick={() => run(b, 'OPEN')}>
                    <Icon name="release" size={12} /> Release balls
                  </button>
                  <button id={`hw-calibrate-${b.id}`} className="btn btn-ghost btn-sm" onClick={() => setSelected(selected === b.id ? null : b.id)}>
                    <Icon name="settings" size={12} /> Calibrate
                  </button>
                </div>
              </div>
            );
          })}
          {list.length === 0 && <div className="faint" style={{ padding: 16 }}>No tables found.</div>}
        </div>
      </div>

      {sel && (
        <ServoCalibrationPanel key={`servo-${sel.id}-${sel.servo?.restAngle}-${sel.servo?.openAngle}-${sel.servo?.holdMs}-${sel.servo?.moveMs}`} b={sel} />
      )}
    </>
  );
}
