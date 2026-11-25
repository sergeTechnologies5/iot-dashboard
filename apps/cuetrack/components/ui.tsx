"use client";

import { ReactNode, useEffect, useRef, useState } from 'react';
import type { ChannelStatus, PayMode, PaymentChannel, PayStatus, TableStatus } from '@/lib/types';
import { CHANNEL_STATUS_LABEL, STATUS_LABEL, SUB_LABEL } from '@/lib/types';
import { CHANNEL_META } from '@/lib/channels';
import { initials } from '@/lib/format';
import { Icon, IconName } from './Icon';

const AVATAR_COLORS = ['#1f8a55', '#b8913f', '#3b7bbf', '#9b5bb5', '#c4573f', '#2f9c9c', '#7a8c2e'];
export function Avatar({ name, size = '' }: { name: string; size?: '' | 'sm' | 'lg' }) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const color = AVATAR_COLORS[h % AVATAR_COLORS.length];
  return (
    <span className={`avatar ${size ? 'avatar-' + size : ''}`} style={{ background: `linear-gradient(135deg, ${color}, ${color}99)` }} title={name}>
      {initials(name)}
    </span>
  );
}

const STATUS_CLASS: Record<TableStatus, string> = {
  IN_PLAY: 'pill-felt pulse',
  IDLE: 'pill-grey',
  OFFLINE: 'pill-danger',
  LOCKED: 'pill-amber',
};
export function StatusPill({ status }: { status: TableStatus }) {
  return (
    <span className={`pill ${STATUS_CLASS[status]}`}>
      <span className="dot" />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function ModePill({ mode, channel }: { mode: PayMode; channel?: PaymentChannel }) {
  return mode === 'MANUAL' ? (
    <span className="pill pill-brass">
      <Icon name="cash" size={13} /> Manual
    </span>
  ) : (
    <span className="pill pill-felt">
      <Icon name={channel === 'CARD' ? 'card' : 'phone'} size={13} /> Online{channel ? ` · ${SUB_LABEL[channel]}` : ''}
    </span>
  );
}

/** Brand-coloured channel badge (M-Pesa green, Airtel red, MTN yellow, Card brass, Cash neutral). */
export function ChannelBadge({ channel, size = 'md', muted }: { channel: PaymentChannel; size?: 'sm' | 'md'; muted?: boolean }) {
  const m = CHANNEL_META[channel];
  return (
    <span
      className={`chan-badge ${size === 'sm' ? 'chan-sm' : ''}`}
      style={{ ['--chan' as string]: m.color, ['--chan-bg' as string]: m.bg, opacity: muted ? 0.45 : 1 }}
      title={m.label}
    >
      <Icon name={m.icon} size={size === 'sm' ? 11 : 13} />
      {m.label}
    </span>
  );
}

const CH_STATUS: Record<ChannelStatus, string> = {
  NOT_REQUESTED: 'pill-grey',
  PENDING: 'pill-amber pulse',
  ACTIVE: 'pill-felt',
  SUSPENDED: 'pill-danger',
};
export function ChannelStatusPill({ status }: { status: ChannelStatus }) {
  return (
    <span className={`pill ${CH_STATUS[status]}`}>
      <span className="dot" />
      {CHANNEL_STATUS_LABEL[status]}
    </span>
  );
}

const PAY_STATUS: Record<PayStatus, [string, IconName, string]> = {
  COMPLETED: ['pill-felt', 'check', 'Completed'],
  PENDING: ['pill-amber', 'clock', 'Pending'],
  FAILED: ['pill-danger', 'x', 'Failed'],
  REVERSED: ['pill-grey', 'undo', 'Reversed'],
};
export function PayStatusPill({ status }: { status: PayStatus }) {
  const [cls, icon, label] = PAY_STATUS[status];
  return (
    <span className={`pill ${cls}`}>
      <Icon name={icon} size={12} /> {label}
    </span>
  );
}

export function SplitBar({ manual, online }: { manual: number; online: number }) {
  const total = manual + online || 1;
  return (
    <div className="split-bar" title={`Manual ${Math.round((manual / total) * 100)}% · Online ${Math.round((online / total) * 100)}%`}>
      <div className="m" style={{ width: `${(manual / total) * 100}%` }} />
      <div className="o" style={{ width: `${(online / total) * 100}%` }} />
    </div>
  );
}

/** Animated number that counts towards its target value. */
export function CountUp({ value, format = (n: number) => String(Math.round(n)) }: { value: number; format?: (n: number) => string }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / 700);
      const e = 1 - Math.pow(1 - k, 3);
      setShown(a + (value - a) * e);
      if (k < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{format(shown)}</>;
}

export function KpiCard({
  label,
  value,
  icon,
  accent = 'var(--felt-2)',
  glow,
  foot,
}: {
  label: string;
  value: ReactNode;
  icon: IconName;
  accent?: string;
  glow?: string;
  foot?: ReactNode;
}) {
  return (
    <div className="card kpi" style={{ ['--accent' as string]: accent, ['--glow' as string]: glow }}>
      <div className="kpi-top">
        {label}
        <span className="kpi-icon">
          <Icon name={icon} size={17} />
        </span>
      </div>
      <div className="kpi-value mono">{value}</div>
      {foot && <div className="kpi-foot">{foot}</div>}
    </div>
  );
}

export function Delta({ pct }: { pct: number }) {
  if (!isFinite(pct)) return null;
  const up = pct >= 0;
  return (
    <span className={up ? 'delta-up' : 'delta-down'}>
      {up ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

const BALLS = ['#f4d03f', '#2e6fd8', '#e0453a', '#7b3fb5', '#f08a24', '#1f8a55', '#8b1e2d', '#111'];
/** Top-down pool table illustration. */
export function FeltTable({
  status,
  label,
  large,
  children,
}: {
  status: TableStatus;
  label?: ReactNode;
  large?: boolean;
  children?: ReactNode;
}) {
  const playing = status === 'IN_PLAY';
  const racked = BALLS.map((c, i) => {
    // triangle rack at right side when not playing
    const row = i < 1 ? 0 : i < 3 ? 1 : i < 6 ? 2 : 3;
    const idx = i < 1 ? 0 : i < 3 ? i - 1 : i < 6 ? i - 3 : i - 6;
    return { c, left: 72 + row * 4.2, top: 50 - row * 5 + idx * 10 };
  });
  const scattered = BALLS.map((c, i) => ({ c, left: 18 + ((i * 37) % 64), top: 22 + ((i * 53) % 58) }));
  const pos = playing ? scattered : racked;
  return (
    <div className={`felt-mini ${large ? 'felt-lg' : ''}`}>
      <div className="cloth">
        {['tl', 'tr', 'bl', 'br', 'tm', 'bm'].map((p) => (
          <span key={p} className={`pocket p-${p}`} />
        ))}
        {pos.map((b, i) => (
          <span key={i} className="ball" style={{ background: b.c, left: `${b.left}%`, top: `${b.top}%` }} />
        ))}
        <span className="ball" style={{ background: '#f6f3ea', left: playing ? '40%' : '24%', top: playing ? '64%' : '48%' }} />
        {label && <span className="label">{label}</span>}
        {children}
      </div>
    </div>
  );
}
