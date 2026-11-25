"use client";

import { use, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useStore } from '@/context/Store';
import { DAY, dailySeries, duration, money, moneyIn, startOfDay, sumBy, timeAgo } from '@/lib/format';
import type { PayMode } from '@/lib/types';
import { STATUS_LABEL } from '@/lib/types';
import { Avatar, ChannelBadge, FeltTable, KpiCard, SplitBar } from '@/components/ui';
import { HourBars, RevenueChart } from '@/components/charts';
import { ActivityFeed } from '@/components/overlays';
import { LockTableModal } from '@/components/LockTableModal';
import { TableQrModal } from '@/components/TableQrModal';
import { PaymentsTable } from '@/components/PaymentsTable';
import { RecordPaymentDrawer } from '@/components/RecordPaymentDrawer';
import { Icon } from '@/components/Icon';
import { BilliardConfigPanel } from '@/components/BilliardConfigPanel';
import { GameSettingsPanel } from '@/components/GameSettingsPanel';
import { FreeGameModal, GamesTab, LedgerTab } from '@/components/GamesPanels';
import { CreditDots, QrGlyph } from '@/components/BilliardCard';
import { ConnectionPanel, LastSeen, PresenceDot } from '@/components/DevicePresence';
import { ServoCalibrationPanel } from '@/components/ServoCalibrationPanel';

type Tab = 'overview' | 'payments' | 'games' | 'ledger' | 'configuration' | 'device';
const STATUS_COLOR = { IN_PLAY: 'var(--felt-2)', IDLE: 'var(--text-2)', OFFLINE: 'var(--danger)', LOCKED: 'var(--amber)' };

export default function BilliardDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, billiards, payments, activity, now, can, adminOf, companyName, releaseBalls, endGame, loadBilliardGames, loadPricingRules } = useStore();
  const b = billiards.find((x) => x.id === id);
  const [tab, setTab] = useState<Tab>('overview');
  const [mode, setMode] = useState<'ALL' | PayMode>('ALL');
  const [drawer, setDrawer] = useState(false);
  const [confirmLock, setConfirmLock] = useState(false);
  const [qr, setQr] = useState(false);
  const [freeReq, setFreeReq] = useState(false);

  useEffect(() => {
    loadBilliardGames(id);
    loadPricingRules(id);
  }, [id, loadBilliardGames, loadPricingRules]);

  const mine = useMemo(() => payments.filter((p) => p.billiardId === id), [payments, id]);
  const t0 = startOfDay(now);
  const today = sumBy(mine.filter((p) => p.at >= t0));
  const month = sumBy(mine.filter((p) => p.at >= t0 - 29 * DAY));
  const series = useMemo(() => dailySeries(mine, 14, now), [mine, now]);
  const hours = useMemo(() => {
    const h = Array(24).fill(0);
    mine.forEach((p) => p.status === 'COMPLETED' && (h[new Date(p.at).getHours()] += p.amount));
    return h;
  }, [mine]);

  if (!b) {
    return (
      <div className="card empty">
        <Icon name="shield" size={28} />
        <h3 style={{ margin: '12px 0 6px' }}>Billiard not available</h3>
        <p>It doesn&apos;t exist or isn&apos;t assigned to you.</p>
        <Link href="/billiards" className="btn" style={{ marginTop: 10 }}>Back to billiards</Link>
      </div>
    );
  }

  const admin = adminOf(b.id);
  const fmt = moneyIn(b.currency);
  const offline = b.status === 'OFFLINE';
  const locked = b.status === 'LOCKED';
  const cur = b.currentGame ?? null;
  const tabs: Tab[] = can('DEVICE_VIEW') ? ['overview', 'payments', 'games', 'ledger', 'configuration', 'device'] : ['overview', 'payments', 'games', 'ledger', 'configuration'];
  const filtered = mode === 'ALL' ? mine : mine.filter((p) => p.mode === mode);
  const sums = sumBy(filtered);

  return (
    <>
      <div>
        <div className="crumbs">
          <Link href="/billiards">Billiards</Link>
          <Icon name="chevronRight" size={13} />
          <span>{companyName(b.companyId)}</span>
          <Icon name="chevronRight" size={13} />
          <span style={{ color: 'var(--text)' }}>{b.name}</span>
        </div>
      </div>

      <section className="card hero">
        <FeltTable status={b.status} large label={b.name}>
          {b.status === 'IN_PLAY' && (cur?.startedAt ?? b.startedAt) && <span className={`timer${cur?.free ? ' gold' : ''}`} style={{ fontSize: 15 }}>{duration(now - (cur?.startedAt ?? b.startedAt ?? now))}</span>}
        </FeltTable>
        <div>
          <div className="hero-status" style={{ color: STATUS_COLOR[b.status] }}>
            <span className={`big-dot ${b.status === 'IN_PLAY' ? 'live' : ''}`} />
            <span style={{ color: 'var(--text)' }}>{b.pending ? 'Waiting for device…' : STATUS_LABEL[b.status]}</span>
            {b.pending && <span className="spinner" />}
          </div>
          {offline && (
            <div className="offline-banner" role="alert">
              <span className="pres-dot offline" style={{ width: 9, height: 9 }} />
              <span><b>Table offline</b> · <LastSeen b={b} /> — releases and payments are paused.</span>
              {can('DEVICE_VIEW') && <button className="link-btn" id="offline-diagnose" onClick={() => setTab('device')}>Ping / diagnose</button>}
            </div>
          )}
          <div className="muted" style={{ marginTop: 6 }}>
            {b.branch} · {companyName(b.companyId)} · {money(b.tokenPrice, b.currency)}/game
          </div>
          <div className="chips" style={{ marginTop: 10, gap: 6 }}>
            {b.cashEnabled && <ChannelBadge channel="CASH" size="sm" />}
            {b.channels.filter((c) => c !== 'CASH').map((c) => <ChannelBadge key={c} channel={c} size="sm" />)}
            <span className={`mode-badge ${b.releaseMode === 'AUTO' ? 'auto' : ''}`}>{b.releaseMode === 'AUTO' ? 'AUTO release' : 'MANUAL release'}</span>
          </div>
          <div className="stat-row">
            <div className="stat"><div className="l">Credits</div><div className="v mono">{b.credits}{(b.freeCredits ?? 0) > 0 && <span style={{ color: '#e8c45a', fontSize: 13 }}> +{b.freeCredits} free</span>}</div><CreditDots credits={b.credits} free={b.freeCredits ?? 0} max={12} /></div>
            <div className="stat"><div className="l">Today</div><div className="v mono">{fmt(today.total)}</div></div>
            <div className="stat">
              <div className="l">Device</div>
              <div className="v" style={{ fontSize: 14, color: offline ? 'var(--danger)' : 'var(--felt-2)' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><PresenceDot b={b} /> <LastSeen b={b} compact /></span>
              </div>
            </div>
            <div className="stat">
              <div className="l">Assigned to</div>
              <div className="v row" style={{ fontSize: 14, gap: 6 }}>{admin ? <><Avatar name={admin.name} size="sm" />{admin.name}</> : <span className="faint">Unassigned</span>}</div>
            </div>
          </div>
          <div className="row row-wrap" style={{ marginBottom: 10 }}>
            <button id="detail-qr" className="btn btn-lg" onClick={() => setQr(true)}><QrGlyph size={16} /> Pay QR code</button>
          </div>
          {can('BILLIARD_CONTROL') && (
            <div className="row row-wrap">
              <button id="detail-add-credit" className="btn btn-brass btn-lg" disabled={offline || locked || !!b.pending} title={locked ? "Table is locked" : undefined} onClick={() => setDrawer(true)}>
                <Icon name="plus" size={16} /> Add credit
              </button>
              {cur ? (
                <button id="detail-end-game" className="btn btn-lg" disabled={!!b.pending} onClick={() => endGame(cur.id)}>
                  <Icon name="stop" size={16} /> End game
                </button>
              ) : (
                <button className="btn btn-felt btn-lg" disabled={offline || b.status === 'LOCKED' || b.credits + (b.freeCredits ?? 0) < 1 || !!b.pending} onClick={() => releaseBalls(b.id)}>
                  <Icon name="release" size={16} /> Release balls
                </button>
              )}
              <button className={`btn btn-lg ${b.status === 'LOCKED' ? '' : 'btn-danger'}`} disabled={offline || !!b.pending} onClick={() => setConfirmLock(true)}>
                <Icon name={b.status === 'LOCKED' ? 'unlock' : 'lock'} size={16} /> {b.status === 'LOCKED' ? 'Unlock table' : 'Lock table'}
              </button>
              {can('FREE_GAME_REQUEST') && (
                <button id="detail-free-game" className="btn btn-lg btn-gold" disabled={offline || locked} title={locked ? "Table is locked" : undefined} onClick={() => setFreeReq(true)}>
                  <Icon name="gift" size={16} /> Request free game
                </button>
              )}
            </div>
          )}
        </div>
      </section>

      <div className="tabs">
        {tabs.map((t) => (
          <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)} id={`tab-${t}`}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <>
          <div className="grid grid-kpi">
            <KpiCard label="Revenue · 30 days" icon="wallet" accent="var(--brass-2)" value={fmt(month.total)} foot={<div style={{ flex: 1 }}><SplitBar manual={month.manual} online={month.online} /></div>} />
            <KpiCard label="Manual · 30 days" icon="cash" accent="var(--brass-2)" value={fmt(month.manual)} />
            <KpiCard label="Online · 30 days" icon="phone" value={fmt(month.online)} />
            <KpiCard label="Avg per day" icon="chart" accent="var(--info)" value={fmt(month.total / 30)} />
          </div>
          <div className="grid grid-2-1">
            <div className="card">
              <div className="card-head"><div><h3>Revenue · last 14 days</h3></div></div>
              <div style={{ padding: '10px 12px' }}><RevenueChart data={series} height={220} currency={b.currency} /></div>
            </div>
            <div className="card">
              <div className="card-head"><div><h3>Peak hours</h3><div className="sub">Revenue by hour of day</div></div></div>
              <div className="card-pad"><HourBars values={hours} currency={b.currency} /></div>
            </div>
          </div>
          <ActivityFeed items={activity.filter((a) => a.billiardId === b.id)} title="Table activity" />
        </>
      )}

      {tab === 'payments' && (
        <>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0,1fr))' }}>
            <KpiCard label="Total" icon="wallet" value={fmt(sumBy(mine).total)} />
            <KpiCard label="Manual" icon="cash" accent="var(--brass-2)" value={fmt(sumBy(mine).manual)} />
            <KpiCard label="Online" icon="phone" value={fmt(sumBy(mine).online)} />
          </div>
          <div className="card">
            <div className="card-head" style={{ paddingBottom: 14 }}>
              <div className="segmented">
                {(['ALL', 'MANUAL', 'ONLINE'] as const).map((m) => (
                  <button key={m} className={mode === m ? 'active' : ''} onClick={() => setMode(m)}>{m === 'ALL' ? 'All' : m[0] + m.slice(1).toLowerCase()}</button>
                ))}
              </div>
              <div className="row">
                <span className="faint mono" style={{ fontSize: 12 }}>{filtered.length} payments · {fmt(sums.total)}</span>
                {can('PAYMENT_RECORD') && (
                  <button className="btn btn-brass btn-sm" disabled={offline || locked} onClick={() => setDrawer(true)} id="record-manual-payment">
                    <Icon name="plus" size={14} /> Record manual payment
                  </button>
                )}
              </div>
            </div>
            <PaymentsTable rows={filtered} showBilliard={false} />
          </div>
        </>
      )}

      {tab === 'games' && <GamesTab b={b} />}

      {tab === 'ledger' && <LedgerTab b={b} />}

      {tab === 'configuration' && (
        <>
          <BilliardConfigPanel key={`${b.id}-${b.tokenPrice}-${b.accountRef}-${b.cashEnabled}-${b.channels.join()}-${b.mpesaCredentialId}-${b.branchId}`} b={b} />
          <GameSettingsPanel key={`gs-${b.id}-${b.releaseMode}-${b.maxGameMinutes}-${b.creditExpiry}`} b={b} />
        </>
      )}

      {tab === 'device' && (
        <div className="grid grid-2-1">
          <ConnectionPanel b={b} />
          <ActivityFeed items={activity.filter((a) => a.billiardId === b.id && (a.kind === 'OFFLINE' || a.kind === 'ONLINE'))} title="Connection history" />
        </div>
      )}
      {tab === 'device' && user?.role === 'SUPER_ADMIN' && (
        <ServoCalibrationPanel key={`servo-${b.id}-${b.servo?.restAngle}-${b.servo?.openAngle}-${b.servo?.holdMs}-${b.servo?.moveMs}`} b={b} />
      )}

      {drawer && <RecordPaymentDrawer billiardId={b.id} onClose={() => setDrawer(false)} />}
      {freeReq && <FreeGameModal b={b} onClose={() => setFreeReq(false)} />}
      {qr && <TableQrModal b={b} onClose={() => setQr(false)} />}
      {confirmLock && <LockTableModal b={b} onClose={() => setConfirmLock(false)} />}
    </>
  );
}
