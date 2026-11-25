"use client";

/**
 * Super Admin: calibrate the ball-release servo of a table controller.
 * Angles 0-180°, open time and travel time; live test moves don't use credits.
 */
import { useState } from 'react';
import { useStore } from '@/context/Store';
import type { Billiard, ServoConfig } from '@/lib/types';
import { DEFAULT_SERVO } from '@/lib/types';
import { Icon } from './Icon';

/** Semicircle gauge: 0° on the left, 180° on the right. */
function GateDial({ rest, open, live }: { rest: number; open: number; live: number | null }) {
  const cx = 110, cy = 104, r = 86;
  const pt = (deg: number, rr = r) => {
    const a = Math.PI - (deg / 180) * Math.PI;
    return [cx + rr * Math.cos(a), cy - rr * Math.sin(a)];
  };
  const [rx, ry] = pt(rest);
  const [ox, oy] = pt(open);
  const lo = Math.min(rest, open), hi = Math.max(rest, open);
  const [ax, ay] = pt(lo, r - 14);
  const [bx, by] = pt(hi, r - 14);
  return (
    <svg viewBox="0 0 220 122" className="servo-dial" role="img" aria-label={`Rest ${rest}°, open ${open}°`}>
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} className="dial-track" />
      {[0, 45, 90, 135, 180].map((d) => {
        const [x1, y1] = pt(d, r + 4);
        const [x2, y2] = pt(d, r - 4);
        const [tx, ty] = pt(d, r + 14);
        return (
          <g key={d}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} className="dial-tick" />
            <text x={tx} y={ty + 3} className="dial-label">{d}°</text>
          </g>
        );
      })}
      <path d={`M ${ax} ${ay} A ${r - 14} ${r - 14} 0 0 1 ${bx} ${by}`} className="dial-sweep" />
      <line x1={cx} y1={cy} x2={rx} y2={ry} className="dial-arm rest" />
      <line x1={cx} y1={cy} x2={ox} y2={oy} className="dial-arm open" />
      {live != null && (() => { const [lx, ly] = pt(live, r - 26); return <circle cx={lx} cy={ly} r={5} className="dial-live" />; })()}
      <circle cx={cx} cy={cy} r={7} className="dial-hub" />
    </svg>
  );
}

function AngleField({ id, label, tone, value, onChange, onTry, disabled }: { id: string; label: string; tone: 'rest' | 'open'; value: number; onChange: (v: number) => void; onTry: () => void; disabled?: boolean }) {
  return (
    <div className={`servo-field ${tone}`}>
      <div className="row between">
        <label htmlFor={id}><span className="servo-swatch" />{label}</label>
        <span className="row" style={{ gap: 6 }}>
          <input aria-label={`${label} degrees`} className="input mono servo-num" type="number" min={0} max={180} value={value} onChange={(e) => onChange(Math.max(0, Math.min(180, Number(e.target.value) || 0)))} />
          <span className="faint">°</span>
        </span>
      </div>
      <input id={id} type="range" min={0} max={180} step={1} value={value} onChange={(e) => onChange(Number(e.target.value))} className="servo-range" />
      <div className="row" style={{ gap: 6 }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(Math.max(0, value - 5))}>−5°</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(Math.min(180, value + 5))}>+5°</button>
        <button type="button" className="btn btn-sm" id={`${id}-try`} disabled={disabled} onClick={onTry} title="Move the gate to this angle now"><Icon name="play" size={12} /> Move here</button>
      </div>
    </div>
  );
}

export function ServoCalibrationPanel({ b }: { b: Billiard }) {
  const { saveServoConfig, servoTest } = useStore();
  const saved = b.servo ?? DEFAULT_SERVO;
  const [cfg, setCfg] = useState<ServoConfig>(saved);
  const [busy, setBusy] = useState<string | null>(null);
  const [live, setLive] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const offline = b.status === 'OFFLINE';
  const busyTable = !!b.pending || !!b.currentGame;
  const canTest = !offline && !busyTable && busy === null;
  const set = <K extends keyof ServoConfig>(k: K, v: ServoConfig[K]) => setCfg((c) => ({ ...c, [k]: v }));
  const dirty = JSON.stringify(cfg) !== JSON.stringify(saved);
  const tooClose = Math.abs(cfg.openAngle - cfg.restAngle) < 10;
  const total = cfg.moveMs * 2 + cfg.holdMs;

  const move = async (label: string, action: 'OPEN' | 'REST' | 'ANGLE', angle?: number) => {
    setBusy(label);
    // a test uses the saved calibration on the device, so save first when changed
    if (dirty && !tooClose && !(await saveServoConfig(b.id, cfg, setErr))) { setBusy(null); return; }
    if (await servoTest(b.id, action, angle)) setLive(action === 'OPEN' ? cfg.openAngle : action === 'REST' ? cfg.restAngle : angle ?? null);
    setTimeout(() => setLive(action === 'OPEN' ? cfg.restAngle : null), action === 'OPEN' ? cfg.moveMs + cfg.holdMs : 1500);
    setBusy(null);
  };
  const save = async () => {
    setErr(null);
    setBusy('save');
    await saveServoConfig(b.id, cfg, setErr);
    setBusy(null);
  };

  return (
    <section className="card card-pad servo-card" aria-labelledby="servo-title">
      <div className="row between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h3 id="servo-title">Ball release calibration</h3>
          <div className="faint" style={{ fontSize: 12, marginTop: 3 }}>How far the gate opens and for how long, so the balls drop cleanly. Super Admin only.</div>
        </div>
        <span className="pill pill-brass"><Icon name="shield" size={11} /> Super Admin</span>
      </div>

      {(offline || busyTable) && (
        <div className="servo-note">
          <Icon name="lock" size={13} /> {offline ? 'Table is offline: you can save, but test moves are disabled.' : 'A release/game is in progress: test moves are disabled until it finishes.'}
        </div>
      )}

      <div className="servo-grid">
        <div className="servo-visual">
          <GateDial rest={cfg.restAngle} open={cfg.openAngle} live={live} />
          <div className="servo-legend">
            <span className="rest"><i /> Rest {cfg.restAngle}°</span>
            <span className="open"><i /> Open {cfg.openAngle}°</span>
            <span className="faint">swing {Math.abs(cfg.openAngle - cfg.restAngle)}°</span>
          </div>
          {/* timeline of one release */}
          <div className="servo-timeline" title={`Total ${(total / 1000).toFixed(1)} s`}>
            <span className="seg move" style={{ flex: cfg.moveMs }}>open</span>
            <span className="seg hold" style={{ flex: cfg.holdMs }}>held {(cfg.holdMs / 1000).toFixed(1)}s</span>
            <span className="seg move" style={{ flex: cfg.moveMs }}>close</span>
          </div>
          <div className="faint" style={{ fontSize: 11, textAlign: 'center' }}>One release ≈ {(total / 1000).toFixed(1)} s</div>
        </div>

        <div className="servo-controls">
          <AngleField id="servo-rest" label="Rest (gate closed)" tone="rest" value={cfg.restAngle} onChange={(v) => set('restAngle', v)} onTry={() => move('rest', 'ANGLE', cfg.restAngle)} disabled={!canTest} />
          <AngleField id="servo-open" label="Open (balls drop)" tone="open" value={cfg.openAngle} onChange={(v) => set('openAngle', v)} onTry={() => move('open-angle', 'ANGLE', cfg.openAngle)} disabled={!canTest} />
          <div className="servo-times">
            <div className="field">
              <label htmlFor="servo-hold">Open time <span className="faint">{(cfg.holdMs / 1000).toFixed(1)} s</span></label>
              <input id="servo-hold" type="range" min={200} max={5000} step={100} value={cfg.holdMs} onChange={(e) => set('holdMs', Number(e.target.value))} className="servo-range" />
            </div>
            <div className="field">
              <label htmlFor="servo-move">Travel time <span className="faint">{cfg.moveMs} ms</span></label>
              <input id="servo-move" type="range" min={100} max={2000} step={50} value={cfg.moveMs} onChange={(e) => set('moveMs', Number(e.target.value))} className="servo-range" />
            </div>
          </div>
          {tooClose && <span className="field-error">Open and rest must differ by at least 10°</span>}
          {err && <span className="field-error">{err}</span>}
        </div>
      </div>

      <footer className="servo-foot">
        <button className="btn btn-ghost btn-sm" id="servo-defaults" onClick={() => setCfg(DEFAULT_SERVO)} disabled={busy !== null}>Reset to defaults</button>
        <span style={{ flex: 1 }} />
        <button className="btn" id="servo-test-rest" disabled={!canTest} onClick={() => move('rest', 'REST')}>{busy === 'rest' ? <span className="spinner" /> : <Icon name="undo" size={14} />} Return to rest</button>
        <button className="btn btn-felt" id="servo-test-release" disabled={!canTest || tooClose} onClick={() => move('release', 'OPEN')} title="Full open → hold → close cycle, no credit used">
          {busy === 'release' ? <span className="spinner" /> : <Icon name="release" size={14} />} Test release
        </button>
        <button className="btn btn-brass" id="servo-save" disabled={!dirty || tooClose || busy !== null} onClick={save}>
          {busy === 'save' ? <span className="spinner" /> : <Icon name="check" size={14} />} Save calibration
        </button>
      </footer>
    </section>
  );
}
