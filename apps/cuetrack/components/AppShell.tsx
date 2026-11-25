"use client";

import { ReactNode, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Permission, useStore } from '@/context/Store';
import { useMpesa } from '@/context/Mpesa';
import { ROLE_LABEL } from '@/lib/types';
import type { User } from '@/lib/types';
import { Icon, IconName } from './Icon';
import { Avatar } from './ui';
import { OfflineChip } from './DevicePresence';
import { PasswordGate } from './ChangePassword';

interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  perm?: Permission;
  role?: User['role'];
}

const NAV: NavItem[] = [
  { href: '/', label: 'Overview', icon: 'home' },
  { href: '/billiards', label: 'Billiards', icon: 'table' },
  { href: '/payments', label: 'Payments', icon: 'wallet' },
  { href: '/approvals', label: 'Approvals', icon: 'gift', perm: 'FREE_GAME_REQUEST' },
  { href: '/unmatched', label: 'Unmatched payments', icon: 'link' },
  { href: '/companies', label: 'Companies', icon: 'building', perm: 'COMPANY_MANAGE' },
  { href: '/users', label: 'Users & Access', icon: 'users', perm: 'USER_MANAGE' },
  { href: '/settings/payments', label: 'Payment settings', icon: 'settings', perm: 'PAYMENT_CONFIG', role: 'COMPANY_SUPER_ADMIN' },
  { href: '/settings/hardware', label: 'Hardware test', icon: 'cpu', role: 'SUPER_ADMIN' },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { ready, user, logout, can, billiards, companies, companyFilter, setCompanyFilter, liveEnabled, setLiveEnabled, pendingChannelRequests, pendingFreeGames } = useStore();
  const { unmatchedOpen } = useMpesa();
  const pathname = usePathname();
  const router = useRouter();
  const [pwOpen, setPwOpen] = useState(false);

  useEffect(() => {
    if (ready && !user) router.replace('/login');
  }, [ready, user, router]);

  if (!ready || !user) {
    return (
      <div className="splash">
        <div className="eight-ball" style={{ width: 54, height: 54, animation: 'float 1.6s ease-in-out infinite' }}>
          <i style={{ width: 22, height: 22, lineHeight: '22px', fontSize: 13 }}>8</i>
        </div>
      </div>
    );
  }

  const items = NAV.filter((n) => (!n.perm || can(n.perm)) && (!n.role || n.role === user.role));
  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));
  const company = companies.find((c) => c.id === user.companyId);
  const inPlay = billiards.filter((b) => b.status === 'IN_PLAY').length;

  return (
    <div className="shell">
      <PasswordGate open={pwOpen} onOpenChange={setPwOpen} />
      <aside className="sidebar">
        <Link href="/" className="brand">
          <span className="eight-ball"><i>8</i></span>
          <span className="brand-name">Cue<span>Track</span></span>
        </Link>

        <div className="nav-label">Workspace</div>
        {items.map((n) => (
          <Link key={n.href} href={n.href} className={`nav-item ${isActive(n.href) ? 'active' : ''}`} id={`nav-${n.label.toLowerCase().split(' ')[0]}`}>
            <Icon name={n.icon} />
            {n.label}
            {n.href === '/billiards' && <span className="count">{inPlay}/{billiards.length}</span>}
            {n.href === '/companies' && can('CHANNEL_ADMIN') && pendingChannelRequests > 0 && (
              <span className="badge-count" title={`${pendingChannelRequests} payment channel request${pendingChannelRequests === 1 ? '' : 's'} awaiting approval`}>{pendingChannelRequests}</span>
            )}
            {n.href === '/approvals' && can('FREE_GAME_APPROVE') && pendingFreeGames > 0 && (
              <span className="badge-count" title={`${pendingFreeGames} free game request${pendingFreeGames === 1 ? '' : 's'} awaiting approval`}>{pendingFreeGames}</span>
            )}
            {n.href === '/unmatched' && unmatchedOpen > 0 && (
              <span className="badge-count" title={`${unmatchedOpen} M-Pesa payment${unmatchedOpen === 1 ? '' : 's'} need a table`}>{unmatchedOpen}</span>
            )}
          </Link>
        ))}

        <div className="sidebar-foot">
          <div className="role-card">
            <Avatar name={user.name} />
            <div className="who">
              <b>{user.name}</b>
              <span className="pill pill-brass" style={{ marginTop: 4, fontSize: 11 }}>{ROLE_LABEL[user.role]}</span>
            </div>
          </div>
          {company && (
            <div className="faint" style={{ fontSize: 12, padding: '0 6px' }}>
              <Icon name="building" size={13} style={{ verticalAlign: -2, marginRight: 6 }} />
              {company.name}
            </div>
          )}
          <button
            className="nav-item"
            style={{ border: 0, background: 'none', width: '100%' }}
            onClick={() => setPwOpen(true)}
            id="change-password"
          >
            <Icon name="settings" /> Change password
          </button>
          <button
            className="nav-item"
            style={{ border: 0, background: 'none', width: '100%' }}
            onClick={() => {
              logout();
              router.replace('/login');
            }}
            id="logout"
          >
            <Icon name="logout" /> Switch user / Log out
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <OfflineChip />
          <label className="search">
            <Icon name="search" size={16} />
            <input placeholder="Search tables, references…" onKeyDown={(e) => {
              if (e.key === 'Enter') router.push(`/payments?q=${encodeURIComponent((e.target as HTMLInputElement).value)}`);
            }} />
            <kbd>↵</kbd>
          </label>
          <div className="spacer" />
          {user.role === 'SUPER_ADMIN' && (
            <select className="select" style={{ width: 220 }} value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)} id="company-filter" aria-label="Company filter">
              <option value="ALL">All companies</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}
          <button className={`live-pill ${liveEnabled ? '' : 'off'}`} onClick={() => setLiveEnabled(!liveEnabled)} title="Toggle live simulated events" id="live-toggle">
            <span className={`pill ${liveEnabled ? 'pulse' : ''}`} style={{ padding: 0 }}><span className="dot" /></span>
            {liveEnabled ? 'Live' : 'Paused'}
          </button>
          <button className="btn icon-btn" aria-label="Notifications"><Icon name="bell" /></button>
        </header>

        <main className="content" key={pathname}>{children}</main>
      </div>

      <nav className="mobile-nav">
        {items.slice(0, 5).map((n) => (
          <Link key={n.href} href={n.href} className={isActive(n.href) ? 'active' : ''}>
            <Icon name={n.icon} size={20} />
            {n.label.split(' ')[0]}
          </Link>
        ))}
      </nav>
    </div>
  );
}
