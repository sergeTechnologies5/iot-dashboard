"use client";

/**
 * Real-time controller presence: live dot, ticking "last seen", Ping and device link.
 * Thresholds mirror the backend: heartbeat 15 s, "late" after 20 s, offline after 45 s.
 */
import { useState } from 'react';
import { useStore } from '@/context/Store';
import type { Billiard, PingResult } from '@/lib/types';
import { Icon } from './Icon';

export const HEARTBEAT_SEC = 15;
export const LATE_SEC = 20;
export const OFFLINE_SEC = 45;

export type Presence = 'online' | 'late' | 'offline';

export function presenceOf(b: Billiard, now: number): Presence {
  if (b.status === 'OFFLINE') return 'offline';
  const age = (now - (b.lastSeen || 0)) / 1000;
  return now > 0 && age > LATE_SEC ? 'late' : 'online';
}

/** "4s ago" / "12m" / "3h 5m" */
export function ago(t: number | null | undefined, now: number) {
  if (!t || !now) return '—';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  return `${Math.floor(s / 86400)}d`;
}

/** Pulsing status dot; the ring re-animates on every heartbeat (keyed by lastSeen). */
export function PresenceDot({ b, size = 10 }: { b: Billiard; size?: number }) {
  const { now } = useStore();
  const p = presenceOf(b, now);
  const label = p === 'offline' ? 'Offline' : p === 'late' ? 'Heartbeat late' : 'Online';
  return (
    <span className={`pres-dot ${p}`} style={{ width: size, height: size }} role="status" aria-label={label} title={label}>
      {p !== 'offline' && <span key={b.lastSeen} className="pres-ring" />}
    </span>
  );
}

/** "Online · seen 4s ago" / "Offline for 12m" — ticks every second from the store clock. */
export function LastSeen({ b, compact }: { b: Billiard; compact?: boolean }) {
  const { now } = useStore();
  const p = presenceOf(b, now);
  const a = ago(b.lastSeen, now);
  return (
    <span className={`pres-text ${p}`}>
      {p === 'offline' ? (compact ? `Offline · ${a}` : `Offline for ${a}`) : p === 'late' ? `Late · seen ${a} ago` : compact ? 'Online' : `Online · seen ${a} ago`}
    </span>
  );
}

function SignalBars({ rssi, off }: { rssi: number; off: boolean }) {
  const bars = off ? 0 : Math.max(1, Math.min(4, Math.round((rssi + 95) / 11)));
  return (
    <span className="pres-bars" title={off ? 'No signal' : `${rssi} dBm`}>
      {[1, 2, 3, 4].map((i) => <i key={i} className={i <= bars ? 'on' : ''} style={{ height: `${i * 25}%` }} />)}
    </span>
  );
}

/** Billiard detail: connection state, Ping and controller link. */
export function ConnectionPanel({ b }: { b: Billiard }) {
  const { now, pingBilliard, linkDevice, user, can } = useStore();
  const [pinging, setPinging] = useState(false);
  const [result, setResult] = useState<(PingResult & { at: number }) | null>(null);
  const [editing, setEditing] = useState(false);
  const [devId, setDevId] = useState(b.deviceId ?? '');
  const [err, setErr] = useState<string | null>(null);
  const p = presenceOf(b, now);
  const canLink = user?.role === 'SUPER_ADMIN' || (user?.role === 'COMPANY_SUPER_ADMIN' && can('PAYMENT_CONFIG'));
  const linked = !!b.deviceId;

  const ping = async () => {
    setPinging(true);
    setResult(null);
    const r = await pingBilliard(b.id);
    setResult({ ...r, at: Date.now() });
    setPinging(false);
  };
  const saveLink = async () => {
    setErr(null);
    if (await linkDevice(b.id, devId, setErr)) setEditing(false);
  };

  return (
    <div className={`card card-pad conn-card ${p}`}>
      <div className="conn-head">
        <div className="conn-state">
          <PresenceDot b={b} size={14} />
          <div>
            <h3>{p === 'offline' ? 'Offline' : p === 'late' ? 'Connection unstable' : 'Online'}</h3>
            <LastSeen b={b} />
          </div>
        </div>
        <button id={`ping-${b.id}`} className={`btn ${pinging ? '' : 'btn-felt'} ping-btn ${pinging ? 'is-pinging' : ''}`} onClick={ping} disabled={pinging} aria-live="polite">
          <span className="sonar" aria-hidden />
          <Icon name="wifi" size={15} /> {pinging ? 'Pinging…' : 'Ping table'}
        </button>
      </div>

      {result && (
        <div className={`ping-result ${result.reachable ? 'ok' : 'bad'}`} role="status">
          <Icon name={result.reachable ? 'check' : 'x'} size={14} strokeWidth={3} />
          {result.reachable ? <>Reachable · <b className="mono">{result.rttMs} ms</b> round trip</> : <>{result.message || 'No reply'}</>}
          <span className="faint" style={{ marginLeft: 'auto' }}>{ago(result.at, now)} ago</span>
        </div>
      )}

      {p === 'offline' && (
        <div className="conn-help">
          <b>Table can&apos;t be reached.</b> Releases and payments are paused. Check power to the controller and the venue Wi-Fi; it reconnects automatically within ~15 s of coming back.
        </div>
      )}

      <dl className="kv conn-kv">
        <dt>Controller</dt>
        <dd>
          {editing ? (
            <span className="conn-link">
              <input id={`dev-id-${b.id}`} className="input mono" placeholder="e.g. esp8266-1" value={devId} onChange={(e) => setDevId(e.target.value)} autoFocus />
              <button className="btn btn-brass btn-sm" id={`dev-save-${b.id}`} onClick={saveLink}>Save</button>
              <button className="btn btn-ghost btn-sm" onClick={() => { setEditing(false); setDevId(b.deviceId ?? ''); setErr(null); }}>Cancel</button>
            </span>
          ) : (
            <span className="conn-link">
              {linked ? <b className="mono">{b.deviceId}</b> : <span className="faint">Not linked</span>}
              {canLink && <button className="link-btn" id={`dev-edit-${b.id}`} onClick={() => setEditing(true)}>{linked ? 'Change' : 'Link controller'}</button>}
            </span>
          )}
          {err && <span className="field-error">{err}</span>}
        </dd>
        <dt>Signal</dt>
        <dd><SignalBars rssi={b.rssi} off={p === 'offline'} /> <span className="mono faint">{p === 'offline' ? '—' : `${b.rssi} dBm`}</span></dd>
        <dt>Firmware</dt><dd className="mono">{b.firmware || '—'}</dd>
        <dt>Heartbeat</dt><dd className="faint">every {HEARTBEAT_SEC}s · offline after {OFFLINE_SEC}s silence</dd>
        {linked && (
          <>
            <dt>Topics</dt>
            <dd className="mono faint" style={{ fontSize: 12 }}>cuetrack/{b.deviceId}/status · /cmd</dd>
          </>
        )}
      </dl>
    </div>
  );
}

/** Topbar chip: number of offline tables in scope (click to jump to Billiards). */
export function OfflineChip() {
  const { billiards } = useStore();
  const off = billiards.filter((b) => b.status === 'OFFLINE');
  if (!off.length) return null;
  return (
    <a href="/billiards?status=OFFLINE" className="offline-chip" id="offline-chip" title={off.map((b) => b.name).join(', ')}>
      <span className="pres-dot offline" style={{ width: 8, height: 8 }} />
      {off.length} table{off.length === 1 ? '' : 's'} offline
    </a>
  );
}
