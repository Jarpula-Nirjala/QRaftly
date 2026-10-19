import { useState, type FormEvent } from 'react';
import { api, errorText } from '../api.ts';
import { useAuth, type User } from '../auth.tsx';
import { Link, navigate } from '../router.tsx';
import { BrandMark, Field, Spinner } from '../ui.tsx';

export function AuthPage({ mode }: { mode: 'signin' | 'signup' }) {
  const { setUser } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const next = new URLSearchParams(location.search).get('next');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const r = await api<{ user: User }>(`/api/auth/${mode}`, { body: mode === 'signup' ? { name, email, password } : { email, password } });
      setUser(r.user);
      navigate(next && next.startsWith('/') && !next.startsWith('//') ? next : '/app', { replace: true });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <form className="card stack" onSubmit={submit} noValidate>
        <div style={{ textAlign: 'center' }}>
          <BrandMark size={40} />
          <h1 style={{ marginTop: 12 }}>{mode === 'signup' ? 'Create your account' : 'Welcome back'}</h1>
          <p className="muted small" style={{ margin: 0 }}>{mode === 'signup' ? 'Dynamic codes, analytics, tickets and certificates. Free.' : 'Sign in to manage your codes.'}</p>
        </div>
        {error && (
          <div className="note bad" role="alert">
            {error}
          </div>
        )}
        {mode === 'signup' && (
          <Field label="Your name">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required autoFocus />
          </Field>
        )}
        <Field label="Email">
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required autoFocus={mode === 'signin'} />
        </Field>
        <Field label="Password" hint={mode === 'signup' ? 'At least 8 characters.' : undefined}>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required minLength={8} />
        </Field>
        <button className="btn primary lg" disabled={busy}>
          {busy && <Spinner size={16} />} {mode === 'signup' ? 'Create account' : 'Sign in'}
        </button>
        <p className="small muted" style={{ textAlign: 'center', margin: 0 }}>
          {mode === 'signup' ? (
            <>
              Already have an account? <Link to={`/signin${location.search}`}>Sign in</Link>
            </>
          ) : (
            <>
              New to QRForge? <Link to={`/signup${location.search}`}>Create an account</Link>
            </>
          )}
        </p>
        <p className="small muted" style={{ textAlign: 'center', margin: 0 }}>You stay signed in for 30 days on this device, renewed each time you visit.</p>
      </form>
    </div>
  );
}
