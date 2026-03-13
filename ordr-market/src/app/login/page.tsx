'use client';
/**
 * ORDR Market — Login / Register Page
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { login, register, getCurrentUser } from '@/lib/auth';

const F = "'Inter',-apple-system,sans-serif";
const M = "'JetBrains Mono','Fira Code',monospace";

export default function LoginPage() {
  const router = useRouter();
  const [tab, setTab]         = useState<'login' | 'register'>('login');
  const [email, setEmail]     = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  useEffect(() => {
    if (getCurrentUser()) router.replace('/strategy');
  }, [router]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    setTimeout(() => {
      try {
        if (tab === 'login') {
          const res = login(email, password);
          if (res.ok) router.replace('/strategy');
          else setError(res.error);
        } else {
          if (password !== confirm) { setError('Passwords do not match.'); setLoading(false); return; }
          const res = register(email, username, password);
          if (res.ok) router.replace('/strategy');
          else setError(res.error);
        }
      } finally {
        setLoading(false);
      }
    }, 400);
  }

  function demoLogin(type: 'free' | 'pro') {
    const email = type === 'pro' ? 'pro@ordr.market' : 'demo@ordr.market';
    const pass  = type === 'pro' ? 'pro123' : 'demo123';
    const res = login(email, pass);
    if (res.ok) router.replace('/strategy');
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px', border: '1px solid var(--border-rim, #E0E3EB)',
    borderRadius: 6, fontFamily: F, fontSize: 14, color: 'var(--text-primary, #131722)',
    background: 'var(--bg-sub, #FAFBFE)', outline: 'none', boxSizing: 'border-box',
    transition: 'border-color 0.15s',
  };

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg-deep, #F0F3FA)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', fontFamily: F,
    }}>
      {/* Background grid decoration */}
      <div style={{
        position: 'fixed', inset: 0, opacity: 0.03,
        backgroundImage: 'linear-gradient(#131722 1px, transparent 1px), linear-gradient(90deg, #131722 1px, transparent 1px)',
        backgroundSize: '40px 40px', pointerEvents: 'none',
      }} />

      <div style={{ width: '100%', maxWidth: 420, padding: '0 16px', position: 'relative' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 8, background: '#131722',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ color: '#FFFFFF', fontFamily: M, fontSize: 14, fontWeight: 700 }}>O</span>
            </div>
            <div>
              <div style={{ fontFamily: M, fontSize: 18, fontWeight: 700, color: '#131722', letterSpacing: '0.06em' }}>
                ORDR
              </div>
              <div style={{ fontFamily: F, fontSize: 11, color: '#787B86', letterSpacing: '0.08em', marginTop: -2 }}>
                MARKET · STRATEGY LAB
              </div>
            </div>
          </div>
        </div>

        {/* Card */}
        <div style={{
          background: 'var(--bg-panel, #FFFFFF)', borderRadius: 12, border: '1px solid var(--border-rim, #E0E3EB)',
          boxShadow: '0 4px 24px rgba(0,0,0,0.07)',
          overflow: 'hidden',
        }}>
          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border-rim, #E0E3EB)' }}>
            {(['login', 'register'] as const).map(t => (
              <button key={t} onClick={() => { setTab(t); setError(''); }}
                style={{
                  flex: 1, padding: '14px 0', fontFamily: F, fontSize: 13, fontWeight: tab === t ? 700 : 500,
                  color: tab === t ? 'var(--text-primary, #131722)' : 'var(--text-secondary, #787B86)', background: 'none', border: 'none', cursor: 'pointer',
                  borderBottom: tab === t ? '2px solid var(--accent-blue, #2962FF)' : '2px solid transparent',
                  transition: 'all 0.15s', marginBottom: -1,
                }}>
                {t === 'login' ? 'Sign In' : 'Create Account'}
              </button>
            ))}
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ padding: '28px 28px 24px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary, #787B86)', display: 'block', marginBottom: 6 }}>
                  EMAIL
                </label>
                <input
                  type="email" required value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  style={inputStyle}
                  onFocus={e => (e.target.style.borderColor = 'var(--accent-blue, #2962FF)')}
                  onBlur={e => (e.target.style.borderColor = 'var(--border-rim, #E0E3EB)')}
                />
              </div>

              {tab === 'register' && (
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary, #787B86)', display: 'block', marginBottom: 6 }}>
                    USERNAME
                  </label>
                  <input
                    type="text" required value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder="YourTraderName"
                    style={inputStyle}
                    onFocus={e => (e.target.style.borderColor = '#2962FF')}
                    onBlur={e => (e.target.style.borderColor = '#E0E3EB')}
                  />
                </div>
              )}

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary, #787B86)', display: 'block', marginBottom: 6 }}>
                  PASSWORD
                </label>
                <input
                  type="password" required value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={tab === 'register' ? 'Minimum 6 characters' : '••••••••'}
                  style={inputStyle}
                  onFocus={e => (e.target.style.borderColor = 'var(--accent-blue, #2962FF)')}
                  onBlur={e => (e.target.style.borderColor = 'var(--border-rim, #E0E3EB)')}
                />
              </div>

              {tab === 'register' && (
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary, #787B86)', display: 'block', marginBottom: 6 }}>
                    CONFIRM PASSWORD
                  </label>
                  <input
                    type="password" required value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    placeholder="Repeat password"
                    style={inputStyle}
                    onFocus={e => (e.target.style.borderColor = '#2962FF')}
                    onBlur={e => (e.target.style.borderColor = '#E0E3EB')}
                  />
                </div>
              )}

              {error && (
                <div style={{
                  padding: '10px 12px', background: '#FFEBEE', borderRadius: 6,
                  color: '#C62828', fontSize: 13, border: '1px solid rgba(198,40,40,0.2)',
                }}>
                  {error}
                </div>
              )}

              <button type="submit" disabled={loading} style={{
                width: '100%', padding: '12px', borderRadius: 6, border: 'none',
                background: loading ? 'var(--text-tertiary, #B2B5BE)' : 'var(--accent-blue, #2962FF)', color: '#FFFFFF',
                fontFamily: F, fontSize: 14, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'background 0.15s', marginTop: 4,
              }}>
                {loading ? 'Authenticating…' : (tab === 'login' ? 'Sign In' : 'Create Account')}
              </button>
            </div>
          </form>

          {/* Demo logins */}
          <div style={{ padding: '0 28px 28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{ flex: 1, height: 1, background: '#E0E3EB' }} />
              <span style={{ fontSize: 11, color: '#B2B5BE', fontWeight: 600 }}>QUICK DEMO</span>
              <div style={{ flex: 1, height: 1, background: '#E0E3EB' }} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => demoLogin('free')} style={{
                flex: 1, padding: '9px', borderRadius: 6, border: '1px solid #E0E3EB',
                background: '#FAFBFE', fontFamily: F, fontSize: 12, fontWeight: 600,
                color: '#787B86', cursor: 'pointer',
              }}>
                Free Account Demo
              </button>
              <button onClick={() => demoLogin('pro')} style={{
                flex: 1, padding: '9px', borderRadius: 6, border: '1px solid rgba(41,98,255,0.3)',
                background: 'rgba(41,98,255,0.06)', fontFamily: F, fontSize: 12, fontWeight: 700,
                color: '#2962FF', cursor: 'pointer',
              }}>
                ★ Pro Account Demo
              </button>
            </div>
          </div>
        </div>

        {/* Footer links */}
        <div style={{ textAlign: 'center', marginTop: 20, display: 'flex', justifyContent: 'center', gap: 24 }}>
          <a href="/" style={{ fontSize: 12, color: '#787B86', textDecoration: 'none' }}>← Back to Chart</a>
          <a href="/marketplace" style={{ fontSize: 12, color: '#787B86', textDecoration: 'none' }}>Browse Marketplace</a>
        </div>

        <div style={{ textAlign: 'center', marginTop: 16, fontSize: 11, color: '#B2B5BE' }}>
          © 2026 ORDR Market · Strategy Lab
        </div>
      </div>
    </div>
  );
}
