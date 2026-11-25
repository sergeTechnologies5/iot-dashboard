"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/context/Store';
import { Icon } from '@/components/Icon';

const BALLS: [string, number, number, number][] = [
  ['#f4d03f', 104, 0, 0], ['#2e6fd8', 74, 50, 0.4], ['#e0453a', 134, 50, 0.8],
  ['#111', 104, 100, 1.2], ['#7b3fb5', 44, 100, 1.6], ['#f08a24', 164, 100, 2],
  ['#1f8a55', 14, 150, 2.4], ['#8b1e2d', 74, 150, 2.8], ['#2e6fd8', 134, 150, 3.2], ['#f4d03f', 194, 150, 3.6],
];

export default function LoginPage() {
  const { ready, user, login } = useStore();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (ready && user) router.replace('/');
  }, [ready, user, router]);

  const signIn = async (em: string, pw: string) => {
    setBusy(true); setError('');
    const err = await login(em.trim(), pw);
    setBusy(false);
    if (err) setError(err);
    else router.replace('/');
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return setError('Enter your email and password.');
    signIn(email, password);
  };

  return (
    <div className="login">
      <section className="login-art">
        <div className="brand" style={{ position: 'relative' }}>
          <span className="eight-ball"><i>8</i></span>
          <span className="brand-name">Cue<span>Track</span></span>
        </div>
        <div className="rack" aria-hidden>
          {BALLS.map(([c, l, t, d], i) => (
            <span key={i} className="ball" style={{ background: `radial-gradient(circle at 35% 30%, ${c}, ${c} 45%, #000 140%)`, left: l, top: t, animationDelay: `${d}s` }} />
          ))}
        </div>
        <div style={{ position: 'relative' }}>
          <h2>Every table. Every token. <span>In real time.</span></h2>
          <p>Monitor your pool tables, control credits remotely and reconcile Manual and Online payments across every venue.</p>
        </div>
        <div className="row" style={{ position: 'relative', gap: 26, color: 'rgba(255,255,255,.7)', fontSize: 13 }}>
          <span><Icon name="bolt" size={14} style={{ verticalAlign: -2 }} /> Live MQTT telemetry</span>
          <span><Icon name="phone" size={14} style={{ verticalAlign: -2 }} /> M-Pesa &amp; Card</span>
          <span><Icon name="shield" size={14} style={{ verticalAlign: -2 }} /> Role-based access</span>
        </div>
      </section>

      <section className="login-form">
        <div className="login-box">
          <div>
            <h1>Welcome back</h1>
            <p className="muted" style={{ margin: '8px 0 0' }}>Sign in to manage your billiards.</p>
          </div>
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" className="input" type="email" placeholder="you@company.co.ke" value={email} onChange={(e) => { setEmail(e.target.value); setError(''); }} />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input id="password" className="input" type="password" placeholder="••••••••" value={password} onChange={(e) => { setPassword(e.target.value); setError(''); }} />
            </div>
            {error && <span style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</span>}
            <button id="sign-in" className="btn btn-brass btn-lg" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
          </form>

        </div>
      </section>
    </div>
  );
}
