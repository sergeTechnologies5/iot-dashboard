"use client";

import { useMemo, useRef, useState } from 'react';
import { compact, money, shortDate } from '@/lib/format';
import { CHANNEL_META } from '@/lib/channels';
import type { Currency, PaymentChannel } from '@/lib/types';

type Point = { day: number; manual: number; online: number };

/** Stacked area chart: Manual (brass) under Online (green). */
export function RevenueChart({ data, height = 260, currency = 'KES' }: { data: Point[]; height?: number; currency?: Currency }) {
  const W = 760;
  const H = height;
  const pad = { l: 46, r: 12, t: 14, b: 26 };
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);

  const { max, x, y, manualPath, totalPath, manualLine, totalLine, ticks } = useMemo(() => {
    const max = Math.max(1, ...data.map((d) => d.manual + d.online)) * 1.12;
    const x = (i: number) => pad.l + (i / Math.max(1, data.length - 1)) * (W - pad.l - pad.r);
    const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
    const smooth = (pts: [number, number][]) =>
      pts.reduce((acc, [px, py], i, arr) => {
        if (i === 0) return `M${px},${py}`;
        const [qx, qy] = arr[i - 1];
        const cx = (qx + px) / 2;
        return `${acc} C${cx},${qy} ${cx},${py} ${px},${py}`;
      }, '');
    const mPts = data.map((d, i) => [x(i), y(d.manual)] as [number, number]);
    const tPts = data.map((d, i) => [x(i), y(d.manual + d.online)] as [number, number]);
    const base = y(0);
    const manualLine = smooth(mPts);
    const totalLine = smooth(tPts);
    const manualPath = `${manualLine} L${x(data.length - 1)},${base} L${x(0)},${base} Z`;
    const back = [...mPts].reverse();
    const totalPath = `${totalLine} L${back[0][0]},${back[0][1]} ${smooth(back).slice(1).replace(/^[^C]*/, '')} Z`;
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((k) => max * k);
    return { max, x, y, manualPath, totalPath, manualLine, totalLine, ticks };
  }, [data, H]); // eslint-disable-line react-hooks/exhaustive-deps

  const onMove = (e: React.MouseEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (data.length - 1));
    setHover(Math.max(0, Math.min(data.length - 1, i)));
  };

  const h = hover !== null ? data[hover] : null;
  return (
    <div style={{ position: 'relative' }}>
      <svg ref={ref} className="chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ height: H }} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        <defs>
          <linearGradient id="gOnline" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#27a866" stopOpacity=".55" />
            <stop offset="1" stopColor="#27a866" stopOpacity=".08" />
          </linearGradient>
          <linearGradient id="gManual" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#d4ad55" stopOpacity=".7" />
            <stop offset="1" stopColor="#d4ad55" stopOpacity=".12" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line className="gridline" x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} />
            <text className="axis" x={pad.l - 8} y={y(t) + 3} textAnchor="end">
              {compact(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) =>
          i % Math.ceil(data.length / 7) === 0 || i === data.length - 1 ? (
            <text key={d.day} className="axis" x={x(i)} y={H - 6} textAnchor="middle">
              {shortDate(d.day)}
            </text>
          ) : null,
        )}
        <path d={totalPath} fill="url(#gOnline)" />
        <path d={manualPath} fill="url(#gManual)" />
        <path d={totalLine} fill="none" stroke="#27a866" strokeWidth="2" />
        <path d={manualLine} fill="none" stroke="#d4ad55" strokeWidth="2" />
        {hover !== null && h && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke="rgba(255,255,255,.2)" strokeDasharray="3 3" />
            <circle cx={x(hover)} cy={y(h.manual + h.online)} r="4.5" fill="#27a866" stroke="#0b100e" strokeWidth="2" />
            <circle cx={x(hover)} cy={y(h.manual)} r="4.5" fill="#d4ad55" stroke="#0b100e" strokeWidth="2" />
          </g>
        )}
      </svg>
      {hover !== null && h && (
        <div className="chart-tooltip" style={{ left: `${(x(hover) / W) * 100}%`, top: `${(y(h.manual + h.online) / H) * 100}%` }}>
          <div className="faint" style={{ marginBottom: 6 }}>{shortDate(h.day)}</div>
          <div className="row between"><span><i style={{ background: '#27a866', width: 8, height: 8, borderRadius: 2, display: 'inline-block', marginRight: 6 }} />Online</span><b className="mono">{money(h.online, currency)}</b></div>
          <div className="row between"><span><i style={{ background: '#d4ad55', width: 8, height: 8, borderRadius: 2, display: 'inline-block', marginRight: 6 }} />Manual</span><b className="mono">{money(h.manual, currency)}</b></div>
          <div className="row between" style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--border)' }}><span>Total</span><b className="mono">{money(h.manual + h.online, currency)}</b></div>
        </div>
      )}
      <span hidden>{max}</span>
    </div>
  );
}

export function ModeDonut({ manual, online, size = 180 }: { manual: number; online: number; size?: number }) {
  const total = manual + online;
  const r = size / 2 - 14;
  const c = 2 * Math.PI * r;
  const onlineLen = total ? (online / total) * c : 0;
  return (
    <div className="donut-wrap" style={{ width: size, height: size, margin: '0 auto' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#d4ad55" strokeWidth="18" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#27a866"
          strokeWidth="18"
          strokeDasharray={`${onlineLen} ${c}`}
          style={{ transition: 'stroke-dasharray .8s ease' }}
        />
      </svg>
      <div className="donut-center">
        <b className="mono">{total ? Math.round((online / total) * 100) : 0}%</b>
        <span className="faint" style={{ fontSize: 12 }}>online</span>
      </div>
    </div>
  );
}

/** Donut split by payment channel, in brand colours. Values must share one currency. */
export function ChannelDonut({ data, currency, size = 180 }: { data: Partial<Record<PaymentChannel, { amount: number; count: number }>>; currency: Currency; size?: number }) {
  const entries = (Object.entries(data) as [PaymentChannel, { amount: number; count: number }][]).filter(([, v]) => v.amount > 0).sort((a, b) => b[1].amount - a[1].amount);
  const total = entries.reduce((a, [, v]) => a + v.amount, 0);
  const r = size / 2 - 14;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="donut-wrap" style={{ width: size, height: size, margin: '0 auto' }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth="18" />
          {entries.map(([ch, v]) => {
            const len = total ? (v.amount / total) * c : 0;
            const el = (
              <circle
                key={ch}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={CHANNEL_META[ch].color}
                strokeWidth="18"
                strokeDasharray={`${Math.max(0, len - 2)} ${c}`}
                strokeDashoffset={-offset}
                style={{ transition: 'stroke-dasharray .8s ease, stroke-dashoffset .8s ease' }}
              >
                <title>{`${CHANNEL_META[ch].label} · ${money(v.amount, currency)}`}</title>
              </circle>
            );
            offset += len;
            return el;
          })}
        </svg>
        <div className="donut-center">
          <b className="mono" style={{ fontSize: 15 }}>{compact(total)}</b>
          <span className="faint" style={{ fontSize: 12 }}>{currency}</span>
        </div>
      </div>
      {entries.length === 0 && <div className="faint" style={{ textAlign: 'center', fontSize: 12 }}>No completed payments</div>}
      {entries.map(([ch, v]) => (
        <div key={ch} className="row between">
          <div className="row">
            <span style={{ width: 10, height: 10, borderRadius: 3, background: CHANNEL_META[ch].color }} />
            <div>
              <b>{CHANNEL_META[ch].label}</b>
              <div className="faint" style={{ fontSize: 12 }}>{v.count} payments · {total ? Math.round((v.amount / total) * 100) : 0}%</div>
            </div>
          </div>
          <b className="mono">{money(v.amount, currency)}</b>
        </div>
      ))}
    </div>
  );
}

/** Tiny bar sparkline used on detail pages. */
export function HourBars({ values, currency = 'KES' }: { values: number[]; currency?: Currency }) {
  const max = Math.max(1, ...values);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 120 }}>
      {values.map((v, i) => (
        <div key={i} title={`${i}:00 · ${money(v, currency)}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end' }}>
          <div style={{ width: '100%', height: `${(v / max) * 100}%`, minHeight: 2, borderRadius: 4, background: v ? 'linear-gradient(180deg, var(--brass-2), var(--felt))' : 'var(--surface-3)', transition: 'height .6s ease' }} />
          {i % 3 === 0 && <span className="faint" style={{ fontSize: 10 }}>{i}</span>}
        </div>
      ))}
    </div>
  );
}
