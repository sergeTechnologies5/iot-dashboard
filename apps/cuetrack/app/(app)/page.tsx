"use client";

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useStore } from '@/context/Store';
import { DAY, dailySeries, money, moneyIn, startOfDay, sumBy, sumByChannel, sumByCurrency } from '@/lib/format';
import { COUNTRY_LABEL, ROLE_LABEL } from '@/lib/types';
import type { Currency } from '@/lib/types';
import { CountUp, Delta, KpiCard, SplitBar, StatusPill } from '@/components/ui';
import { ChannelDonut, RevenueChart } from '@/components/charts';
import { ActivityFeed } from '@/components/overlays';
import { Icon } from '@/components/Icon';
import { BilliardCard } from '@/components/BilliardCard';
import { CurrencySwitch, useCurrencyScope } from '@/components/CurrencySwitch';
import { computeGameStats, fmtDuration } from '@/lib/games';

const RANGES = { '7D': 7, '30D': 30 } as const;

export default function OverviewPage() {
  const { user, now, billiards, payments: allPayments, activity, companies, companyFilter, companyName, games } = useStore();
  const router = useRouter();
  const [range, setRange] = useState<keyof typeof RANGES>('30D');
  const days = RANGES[range];
  // aggregates below only ever cover one currency
  const { currency, setCurrency, available, scoped: payments, multi } = useCurrencyScope(allPayments, billiards);
  const fmt = moneyIn(currency);

  const stats = useMemo(() => {
    const today0 = startOfDay(now);
    const today = sumBy(payments.filter((p) => p.at >= today0));
    const yesterday = sumBy(payments.filter((p) => p.at >= today0 - DAY && p.at < today0 - DAY + (now - today0)));
    const periodList = payments.filter((p) => p.at >= today0 - (days - 1) * DAY);
    const period = sumBy(periodList);
    const channels = sumByChannel(periodList);
    const games = allPayments.filter((p) => p.at >= today0 && p.status === 'COMPLETED').reduce((s, p) => s + p.tokens, 0);
    return { today, yesterday, period, channels, games };
  }, [payments, allPayments, now, days]);

  // per-currency revenue tiles (Super Admin): side by side, never summed
  const perCurrency = useMemo(() => {
    const today0 = startOfDay(now);
    const inPeriod = sumByCurrency(allPayments.filter((p) => p.at >= today0 - (days - 1) * DAY));
    const today = sumByCurrency(allPayments.filter((p) => p.at >= today0));
    return available.map((c) => ({
      currency: c,
      period: inPeriod[c]?.total ?? 0,
      today: today[c]?.total ?? 0,
      companies: companies.filter((x) => x.currency === c && (companyFilter === 'ALL' || x.id === companyFilter)),
    }));
  }, [allPayments, available, companies, companyFilter, now, days]);

  const series = useMemo(() => dailySeries(payments, days, now), [payments, days, now]);
  // game stats are computed client-side from /games (mirrors GET /stats/games); minute resolution is plenty
  const minute = Math.floor(now / 60000);
  const gstats = useMemo(() => computeGameStats(games, billiards, 7, minute * 60000), [games, billiards, minute]);
  const heatMax = Math.max(1, ...gstats.heatmap.flatMap((r) => r.hours));
  const active = billiards.filter((b) => b.status === 'IN_PLAY').length;
  const offline = billiards.filter((b) => b.status === 'OFFLINE').length;
  const onlineShare = stats.period.total ? (stats.period.online / stats.period.total) * 100 : 0;
  const greeting = new Date(now).getHours() < 12 ? 'Good morning' : new Date(now).getHours() < 17 ? 'Good afternoon' : 'Good evening';

  // breakdown rows: by company for Super Admin (all), otherwise by billiard
  const byCompany = user?.role === 'SUPER_ADMIN' && companyFilter === 'ALL';
  const t0 = startOfDay(now);
  const rows = byCompany
    ? companies.map((c) => {
        const bs = billiards.filter((b) => b.companyId === c.id);
        const s = sumBy(allPayments.filter((p) => p.companyId === c.id && p.at >= t0));
        return { id: c.id, name: c.name, sub: `${c.city} · ${COUNTRY_LABEL[c.country]}`, cur: c.currency as Currency, count: bs.length, live: bs.filter((b) => b.status === 'IN_PLAY').length, off: bs.filter((b) => b.status === 'OFFLINE').length, ...s };
      })
    : billiards
        .map((b) => {
          const s = sumBy(allPayments.filter((p) => p.billiardId === b.id && p.at >= t0));
          return { id: b.id, name: b.name, sub: b.branch, cur: b.currency, status: b.status, ...s };
        })
        .sort((a, b) => (a.cur === b.cur ? b.total - a.total : a.cur === currency ? -1 : 1));

  const scopeLabel =
    user?.role === 'SUPER_ADMIN'
      ? companyFilter === 'ALL' ? 'all companies' : companyName(companyFilter)
      : user?.role === 'COMPANY_SUPER_ADMIN' ? companyName(user.companyId!) : 'your assigned tables';

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{greeting}, {user?.name.split(' ')[0]}</h1>
          <p>Here&apos;s what&apos;s happening across {scopeLabel} today.</p>
        </div>
        <div className="row">
          <span className="pill pill-brass">{user && ROLE_LABEL[user.role]}</span>
          <CurrencySwitch value={currency} options={available} onChange={setCurrency} />
          <div className="segmented">
            {(Object.keys(RANGES) as (keyof typeof RANGES)[]).map((r) => (
              <button key={r} className={range === r ? 'active' : ''} onClick={() => setRange(r)}>{r}</button>
            ))}
          </div>
        </div>
      </div>

      {user?.role === 'SUPER_ADMIN' && (
        <div className="grid" style={{ gridTemplateColumns: `repeat(${Math.max(1, perCurrency.length)}, minmax(0, 1fr))` }}>
          {perCurrency.map((t) => (
            <button
              key={t.currency}
              className="card kpi"
              style={{ textAlign: 'left', cursor: multi ? 'pointer' : 'default', borderColor: multi && t.currency === currency ? 'rgba(212,173,85,.45)' : undefined, ['--accent' as string]: 'var(--brass-2)', ['--glow' as string]: t.currency === 'RWF' ? 'rgba(90,166,232,.14)' : 'rgba(39,168,102,.14)' }}
              onClick={() => setCurrency(t.currency)}
              id={`revenue-tile-${t.currency.toLowerCase()}`}
            >
              <div className="kpi-top">
                <span className="cur-tile">
                  <span className="cur-flag">{t.currency === 'KES' ? 'Kenya' : 'Rwanda'} · {t.currency}</span>
                  Revenue · last {days} days
                </span>
                <span className="kpi-icon"><Icon name="globe" size={17} /></span>
              </div>
              <div className="kpi-value mono"><CountUp value={t.period} format={moneyIn(t.currency)} /></div>
              <div className="kpi-foot">Today {money(t.today, t.currency)} · {t.companies.length} compan{t.companies.length === 1 ? 'y' : 'ies'}</div>
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-kpi">
        <KpiCard
          label={multi ? `Revenue today · ${currency}` : 'Revenue today'}
          icon="wallet"
          accent="var(--brass-2)"
          glow="rgba(212,173,85,.14)"
          value={<CountUp value={stats.today.total} format={fmt} />}
          foot={<><Delta pct={stats.yesterday.total ? ((stats.today.total - stats.yesterday.total) / stats.yesterday.total) * 100 : 0} /> vs same time yesterday</>}
        />
        <KpiCard
          label="Tables in play"
          icon="table"
          value={<>{active}<span className="faint" style={{ fontSize: 18 }}>/{billiards.length}</span></>}
          foot={offline ? <span className="delta-down"><Icon name="wifiOff" size={12} style={{ verticalAlign: -2 }} /> {offline} offline</span> : <span className="delta-up">All controllers online</span>}
        />
        <KpiCard label="Games today" icon="play" accent="var(--info)" glow="rgba(90,166,232,.12)" value={<CountUp value={gstats.gamesToday || stats.games} />} foot={`Avg length ${fmtDuration(gstats.avgDurationSec)}`} />
        <KpiCard
          label={`Online vs Manual · ${range}`}
          icon="swap"
          value={<>{Math.round(onlineShare)}% <span className="faint" style={{ fontSize: 18 }}>/ {Math.round(100 - onlineShare)}%</span></>}
          foot={<div style={{ flex: 1 }}><SplitBar manual={stats.period.manual} online={stats.period.online} /></div>}
        />
      </div>

      <div className="grid grid-kpi">
        <KpiCard label="Average game" icon="clock" accent="var(--info)" value={fmtDuration(gstats.avgDurationSec)} foot="Completed games · 7 days" />
        <KpiCard label="Utilisation today" icon="activity" accent="var(--felt-2)" value={`${gstats.utilisationPct}%`} foot={<div style={{ flex: 1 }}><div className="util-bar"><i style={{ width: `${gstats.utilisationPct}%` }} /></div></div>} />
        <KpiCard label="Outstanding credits" icon="coins" accent="var(--brass-2)" value={<CountUp value={gstats.outstandingCredits} />} foot="Paid & free games not yet played" />
        <KpiCard label="Games · 7 days" icon="chart" value={<CountUp value={gstats.daily.reduce((s, d) => s + d.games, 0)} />} foot={<div className="mini-bars">{gstats.daily.map((d) => <i key={d.day} style={{ height: `${(d.games / Math.max(1, ...gstats.daily.map((x) => x.games))) * 100}%` }} title={`${d.games} games`} />)}</div>} />
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h3>Table utilisation</h3>
            <div className="sub">Games started by hour of day · last 7 days</div>
          </div>
          <div className="legend"><span><i style={{ background: 'rgba(39,168,102,.18)' }} />Quiet</span><span><i style={{ background: 'var(--felt-2)' }} />Busy</span><span><i style={{ background: 'var(--brass-2)' }} />Peak</span></div>
        </div>
        <div className="card-pad heatmap-wrap">
          <div className="heatmap" id="utilisation-heatmap">
            <span />
            {Array.from({ length: 24 }, (_, h) => <span key={h} className="hm-h mono">{h % 3 === 0 ? String(h).padStart(2, '0') : ''}</span>)}
            {gstats.heatmap.slice(0, 14).map((r) => {
              const b = billiards.find((x) => x.id === r.billiardId);
              return [
                <Link key={`${r.billiardId}-n`} href={`/billiards/${r.billiardId}`} className="hm-name">{b?.name ?? r.billiardId}</Link>,
                ...r.hours.map((v, h) => {
                  const k = v / heatMax;
                  return <i key={`${r.billiardId}-${h}`} className={`hm-cell ${k > 0.75 ? 'peak' : ''}`} style={{ ['--k' as string]: k }} title={`${b?.name} · ${String(h).padStart(2, '0')}:00 · ${v} game${v === 1 ? '' : 's'}`} />;
                }),
              ];
            })}
          </div>
          {gstats.heatmap.length === 0 && <div className="empty">No tables in scope</div>}
        </div>
      </div>

      <div className="grid grid-2-1">
        <div className="card">
          <div className="card-head">
            <div>
              <h3>Revenue · last {days} days{multi ? ` · ${currency}` : ''}</h3>
              <div className="sub mono">{fmt(stats.period.total)} total</div>
            </div>
            <div className="legend">
              <span><i style={{ background: 'var(--brass)' }} />Manual</span>
              <span><i style={{ background: 'var(--felt-2)' }} />Online</span>
            </div>
          </div>
          <div style={{ padding: '10px 12px 8px' }}>
            <RevenueChart data={series} currency={currency} />
          </div>
        </div>
        <div className="card">
          <div className="card-head">
            <div>
              <h3>Payment channels</h3>
              <div className="sub">Last {days} days · {currency}</div>
            </div>
          </div>
          <div className="card-pad">
            <ChannelDonut data={stats.channels} currency={currency} />
          </div>
        </div>
      </div>

      {user?.role === 'COMPANY_ADMIN' && (
        <div className="grid grid-main-side">
          <div>
            <div className="row between" style={{ marginBottom: 14 }}>
              <h3>My tables</h3>
              <Link href="/billiards" className="btn btn-sm btn-ghost">Open floor <Icon name="chevronRight" size={14} /></Link>
            </div>
            <div className="billiard-grid">
              {billiards.map((b) => <BilliardCard key={b.id} b={b} />)}
            </div>
          </div>
          <ActivityFeed items={activity} />
        </div>
      )}

      {user?.role !== 'COMPANY_ADMIN' && (
        <div className="grid grid-main-side">
          <div className="card">
            <div className="card-head">
              <div>
                <h3>{byCompany ? 'Companies' : 'Billiards'} · today</h3>
                <div className="sub">Ranked by revenue</div>
              </div>
              <Link href={byCompany ? '/companies' : '/billiards'} className="btn btn-sm btn-ghost">View all <Icon name="chevronRight" size={14} /></Link>
            </div>
            <div className="table-wrap" style={{ marginTop: 10 }}>
              <table className="data">
                <thead>
                  <tr>
                    <th>{byCompany ? 'Company' : 'Billiard'}</th>
                    <th>{byCompany ? 'Billiards' : 'Status'}</th>
                    <th className="num">Manual</th>
                    <th className="num">Online</th>
                    <th className="num">Total</th>
                    <th style={{ width: 120 }}>Split</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 8).map((r) => (
                    <tr
                      key={r.id}
                      className="clickable"
                      onClick={() => (byCompany ? router.push(`/companies?c=${r.id}`) : router.push(`/billiards/${r.id}`))}
                    >
                      <td>
                        <b>{r.name}</b>
                        <div className="faint" style={{ fontSize: 12 }}>{r.sub}</div>
                      </td>
                      <td>
                        {'count' in r ? (
                          <span className="muted">
                            {r.count} · <span className="delta-up">{r.live} live</span>
                            {r.off ? <span className="delta-down"> · {r.off} off</span> : null}
                          </span>
                        ) : (
                          <StatusPill status={r.status} />
                        )}
                      </td>
                      <td className="num mono" style={{ color: 'var(--brass-2)' }}>{money(r.manual, r.cur)}</td>
                      <td className="num mono" style={{ color: 'var(--felt-2)' }}>{money(r.online, r.cur)}</td>
                      <td className="num mono" style={{ fontWeight: 700 }}>{money(r.total, r.cur)}</td>
                      <td><SplitBar manual={r.manual} online={r.online} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <ActivityFeed items={activity} />
        </div>
      )}
    </>
  );
}
