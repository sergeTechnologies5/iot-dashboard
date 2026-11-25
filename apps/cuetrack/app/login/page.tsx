"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/context/Store';
import { Icon } from '@/components/Icon';
import { api } from '@/lib/api';

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
  const [forgot, setForgot] = useState(false);
  const [sent, setSent] = useState('');

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

  const requestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/\S+@\S+\.\S+/.test(email)) return setError('Enter the email you sign in with.');
    setBusy(true); setError('');
    try {
      const res = await api.forgotPassword(email.trim());
      setSent(res.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the email. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const back = () => { setForgot(false); setSent(''); setError(''); setPassword(''); };

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
          {forgot ? (
            <>
              <div>
                <h1>Reset password</h1>
                <p className="muted" style={{ margin: '8px 0 0' }}>We&apos;ll email you a temporary password. You&apos;ll choose a new one after signing in.</p>
              </div>
              {sent ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <p style={{ margin: 0, lineHeight: 1.6 }}><Icon name="mail" size={15} style={{ verticalAlign: -2 }} /> {sent} Check your inbox (and spam folder).</p>
                  <button id="back-to-sign-in" className="btn btn-brass btn-lg" onClick={back}>Back to sign in</button>
                </div>
              ) : (
                <form onSubmit={requestReset} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div className="field">
                    <label htmlFor="reset-email">Email</label>
                    <input id="reset-email" className="input" type="email" placeholder="you@company.co.ke" value={email} onChange={(e) => { setEmail(e.target.value); setError(''); }} autoFocus />
                  </div>
                  {error && <span style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</span>}
                  <button id="send-reset" className="btn btn-brass btn-lg" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Email me a temporary password'}</button>
                  <button type="button" className="btn btn-ghost" onClick={back}>Back to sign in</button>
                </form>
              )}
            </>
          ) : (
          <>
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
              <div className="row between">
                <label htmlFor="password">Password</label>
                <button type="button" id="forgot-password" onClick={() => { setForgot(true); setError(''); }} style={{ background: 'none', border: 0, padding: 0, color: 'var(--brass-2)', fontSize: 12, cursor: 'pointer' }}>Forgot password?</button>
              </div>
              <input id="password" className="input" type="password" placeholder="••••••••" value={password} onChange={(e) => { setPassword(e.target.value); setError(''); }} />
            </div>
            {error && <span style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</span>}
            <button id="sign-in" className="btn btn-brass btn-lg" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
          </form>
          </>
          )}

        </div>
      </section>
    </div>
  );
}
