"use client";

import { Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useStore } from '@/context/Store';
import { DAY, dateTime, downloadCsv, moneyIn, startOfDay, sumBy } from '@/lib/format';
import type { PayMode, PaymentChannel, PayStatus } from '@/lib/types';
import { CHANNEL_META } from '@/lib/channels';
import { KpiCard, SplitBar } from '@/components/ui';
import { PaymentsTable } from '@/components/PaymentsTable';
import { RecordPaymentDrawer } from '@/components/RecordPaymentDrawer';
import { Icon } from '@/components/Icon';
import { CurrencySwitch, useCurrencyScope } from '@/components/CurrencySwitch';

const PERIODS = { Today: 1, '7 days': 7, '30 days': 30 } as const;

function PaymentsInner() {
  const params = useSearchParams();
  const { user, payments, billiards, now, can, companyName, billiardById } = useStore();
  const [mode, setMode] = useState<'ALL' | PayMode>('ALL');
  const [status, setStatus] = useState<'ALL' | PayStatus>('ALL');
  const [channel, setChannel] = useState<'ALL' | PaymentChannel>('ALL');
  const [billiard, setBilliard] = useState('ALL');
  const [period, setPeriod] = useState<keyof typeof PERIODS>('30 days');
  const [q, setQ] = useState(params.get('q') ?? '');
  const [drawer, setDrawer] = useState(false);
  const { currency, setCurrency, available, multi } = useCurrencyScope(payments, billiards);
  const fmt = moneyIn(currency);

  const from = startOfDay(now) - (PERIODS[period] - 1) * DAY;
  const inPeriod = useMemo(() => payments.filter((p) => p.at >= from), [payments, from]);
  const channelsPresent = useMemo(() => Array.from(new Set(payments.map((p) => p.channel))), [payments]);
  const rows = useMemo(
    () =>
      inPeriod.filter((p) => {
        if (mode !== 'ALL' && p.mode !== mode) return false;
        if (status !== 'ALL' && p.status !== status) return false;
        if (channel !== 'ALL' && p.channel !== channel) return false;
        if (billiard !== 'ALL' && p.billiardId !== billiard) return false;
        if (q) {
          const hay = `${p.reference} ${p.externalRef ?? ''} ${p.payerMsisdn ?? ''} ${p.receivedBy} ${billiardById(p.billiardId)?.name} ${companyName(p.companyId)}`.toLowerCase();
          if (!hay.includes(q.toLowerCase())) return false;
        }
        return true;
      }),
    [inPeriod, mode, status, channel, billiard, q, billiardById, companyName],
  );
  // KPIs never mix currencies
  const kpiList = inPeriod.filter((p) => p.currency === currency);
  const s = sumBy(kpiList);
  const pending = kpiList.filter((p) => p.status === 'PENDING');
  const showCompany = user?.role === 'SUPER_ADMIN';

  const exportCsv = () =>
    downloadCsv(`cuetrack-payments-${new Date(now).toISOString().slice(0, 10)}.csv`, [
      ['Date', 'Company', 'Billiard', 'Mode', 'Channel', 'Reference', 'Receipt', 'Payer', 'Tokens', 'Amount', 'Currency', 'Received by', 'Status'],
      ...rows.map((p) => [dateTime(p.at), companyName(p.companyId), billiardById(p.billiardId)?.name ?? '', p.mode, CHANNEL_META[p.channel].label, p.reference, p.externalRef ?? '', p.payerMsisdn ?? '', p.tokens, p.amount, p.currency, p.receivedBy, p.status]),
    ]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Payments</h1>
          <p>Manual and Online payments received by {user?.role === 'COMPANY_ADMIN' ? 'your tables' : 'each billiard'}.</p>
        </div>
        <div className="row">
          <CurrencySwitch value={currency} options={available} onChange={setCurrency} />
          <button className="btn" onClick={exportCsv} id="export-csv"><Icon name="download" size={16} /> Export CSV</button>
          {can('PAYMENT_RECORD') && (
            <button className="btn btn-brass" onClick={() => setDrawer(true)} id="record-payment">
              <Icon name="plus" size={16} /> Record manual payment
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-kpi">
        <KpiCard label={`Total · ${period}${multi ? ` · ${currency}` : ''}`} icon="wallet" accent="var(--brass-2)" value={fmt(s.total)} foot={<div style={{ flex: 1 }}><SplitBar manual={s.manual} online={s.online} /></div>} />
        <KpiCard label="Manual" icon="cash" accent="var(--brass-2)" glow="rgba(212,173,85,.14)" value={fmt(s.manual)} foot={`${kpiList.filter((p) => p.mode === 'MANUAL').length} payments · cash at venue`} />
        <KpiCard label="Online" icon="phone" value={fmt(s.online)} foot={`${kpiList.filter((p) => p.mode === 'ONLINE').length} payments · mobile money & card`} />
        <KpiCard label="Pending" icon="clock" accent="var(--amber)" glow="rgba(231,163,59,.12)" value={fmt(pending.reduce((a, p) => a + p.amount, 0))} foot={`${pending.length} awaiting confirmation`} />
      </div>

      <div className="card">
        <div className="card-head row-wrap" style={{ paddingBottom: 14, flexWrap: 'wrap' }}>
          <div className="row row-wrap">
            <div className="segmented">
              {(['ALL', 'MANUAL', 'ONLINE'] as const).map((m) => (
                <button key={m} className={mode === m ? 'active' : ''} onClick={() => setMode(m)} id={`mode-${m.toLowerCase()}`}>
                  {m === 'ALL' ? 'All modes' : m[0] + m.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
            <div className="segmented">
              {(Object.keys(PERIODS) as (keyof typeof PERIODS)[]).map((p) => (
                <button key={p} className={period === p ? 'active' : ''} onClick={() => setPeriod(p)}>{p}</button>
              ))}
            </div>
          </div>
          <div className="row row-wrap">
            <label className="search" style={{ display: 'flex', maxWidth: 220 }}>
              <Icon name="search" size={15} />
              <input placeholder="Reference, staff…" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
            <select className="select" style={{ width: 200 }} value={billiard} onChange={(e) => setBilliard(e.target.value)} aria-label="Billiard">
              <option value="ALL">All billiards</option>
              {billiards.map((b) => <option key={b.id} value={b.id}>{b.name}{showCompany ? ` · ${companyName(b.companyId)}` : ''}</option>)}
            </select>
            <select className="select" style={{ width: 160 }} value={channel} onChange={(e) => setChannel(e.target.value as typeof channel)} aria-label="Channel" id="channel-filter">
              <option value="ALL">All channels</option>
              {channelsPresent.map((c) => (
                <option key={c} value={c}>{CHANNEL_META[c].label}{CHANNEL_META[c].country ? ` (${CHANNEL_META[c].country})` : ''}</option>
              ))}
            </select>
            <select className="select" style={{ width: 150 }} value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Status">
              <option value="ALL">Any status</option>
              <option value="COMPLETED">Completed</option>
              <option value="PENDING">Pending</option>
              <option value="FAILED">Failed</option>
              <option value="REVERSED">Reversed</option>
            </select>
          </div>
        </div>
        <PaymentsTable rows={rows} showCompany={showCompany} pageSize={15} />
      </div>

      {drawer && <RecordPaymentDrawer onClose={() => setDrawer(false)} />}
    </>
  );
}

export default function PaymentsPage() {
  return (
    <Suspense>
      <PaymentsInner />
    </Suspense>
  );
}
