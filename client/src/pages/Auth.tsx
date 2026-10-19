import { Eye, EyeOff, MailCheck } from 'lucide-react';
import { useEffect, useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from 'react';
import { api, errorText } from '../api.ts';
import { useAuth, type User } from '../auth.tsx';
import { Link, navigate } from '../router.tsx';
import { BrandMark, Field, Spinner } from '../ui.tsx';

/** A password box with an eye button that shows or hides what was typed. */
export function PasswordInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'className'>) {
  const [shown, setShown] = useState(false);
  return (
    <span className="pw-wrap">
      <input {...props} className="input" type={shown ? 'text' : 'password'} />
      <button type="button" className="pw-eye" onClick={() => setShown((s) => !s)} aria-label={shown ? 'Hide password' : 'Show password'} title={shown ? 'Hide password' : 'Show password'} aria-pressed={shown}>
        {shown ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </span>
  );
}

/** Google's "G", for the Continue with Google button. */
const GoogleG = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z" />
    <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.2-.1-2.3-.4-3.5z" />
  </svg>
);

const safeNext = (next: string | null) => (next && next.startsWith('/') && !next.startsWith('//') ? next : '/app');

function AuthCard({ title, lead, children }: { title: string; lead: string; children: ReactNode }) {
  return (
    <div className="auth">
      <div className="card stack">
        <div style={{ textAlign: 'center' }}>
          <BrandMark size={40} />
          <h1 style={{ marginTop: 12 }}>{title}</h1>
          <p className="muted small" style={{ margin: 0 }}>
            {lead}
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}

export function AuthPage({ mode }: { mode: 'signin' | 'signup' }) {
  const { setUser } = useAuth();
  const params = new URLSearchParams(location.search);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(params.get('error') ?? '');
  const [busy, setBusy] = useState(false);
  const [google, setGoogle] = useState<boolean | null>(null);
  const next = params.get('next');

  useEffect(() => {
    api<{ google: boolean }>('/api/auth/providers')
      .then((r) => setGoogle(r.google))
      .catch(() => setGoogle(false));
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const r = await api<{ user: User }>(`/api/auth/${mode}`, { body: mode === 'signup' ? { name, email, password } : { email, password } });
      setUser(r.user);
      navigate(safeNext(next), { replace: true });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const continueWithGoogle = () => {
    if (google === false) return setError('Google sign-in is not switched on for this site yet. Use your email and password for now.');
    location.href = `/api/auth/oauth/google?next=${encodeURIComponent(safeNext(next))}`;
  };

  return (
    <AuthCard title={mode === 'signup' ? 'Create your account' : 'Welcome back'} lead={mode === 'signup' ? 'Dynamic codes, analytics, tickets and certificates. Free.' : 'Sign in to manage your codes.'}>
      {error && (
        <div className="note bad" role="alert">
          {error}
        </div>
      )}
      <button type="button" className="btn lg google-btn" onClick={continueWithGoogle}>
        <GoogleG /> Continue with Google
      </button>
      <div className="auth-or">
        <span>{mode === 'signup' ? 'or sign up with email' : 'or sign in with email'}</span>
      </div>
      <form className="stack" onSubmit={submit} noValidate>
        {mode === 'signup' && (
          <Field label="Your name">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required autoFocus />
          </Field>
        )}
        <Field label="Email">
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required autoFocus={mode === 'signin'} />
        </Field>
        <Field label="Password" hint={mode === 'signup' ? 'At least 8 characters.' : undefined}>
          <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required minLength={8} />
        </Field>
        {mode === 'signin' && (
          <p className="small" style={{ margin: '-6px 0 0', textAlign: 'right' }}>
            <Link to={`/forgot${email ? `?email=${encodeURIComponent(email)}` : ''}`}>Forgot password?</Link>
          </p>
        )}
        <button className="btn primary lg" disabled={busy}>
          {busy && <Spinner size={16} />} {mode === 'signup' ? 'Create account' : 'Sign in'}
        </button>
      </form>
      {mode === 'signup' ? (
        <p className="small muted" style={{ textAlign: 'center', margin: 0 }}>
          Already have an account? <Link to={`/signin${next ? `?next=${encodeURIComponent(next)}` : ''}`}>Sign in</Link>
        </p>
      ) : (
        <Link to={`/signup${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="btn lg auth-create">
          Create new account
        </Link>
      )}
      <p className="small muted" style={{ textAlign: 'center', margin: 0 }}>
        You stay signed in for 30 days on this device, renewed each time you visit.
      </p>
    </AuthCard>
  );
}

export function ForgotPage() {
  const [email, setEmail] = useState(new URLSearchParams(location.search).get('email') ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<null | 'email' | 'log'>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      setSent((await api<{ delivery: 'email' | 'log' }>('/api/auth/forgot', { body: { email } })).delivery);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard title="Forgot your password?" lead="Enter the email you signed up with and we will send you a link to choose a new one.">
      {sent ? (
        <>
          <div className="note good" role="status">
            <MailCheck size={18} />
            <span>
              If an account uses <b>{email}</b>, a reset link is on its way. It works for one hour.
              {sent === 'log' && ' (Email is not set up on this server yet, so the link was written to the server log.)'}
            </span>
          </div>
          <p className="small muted" style={{ margin: 0 }}>
            No email? Check your spam folder, or{' '}
            <button type="button" className="linkish" onClick={() => setSent(null)}>
              try again
            </button>
            . If you signed up with Google, just choose Continue with Google instead.
          </p>
        </>
      ) : (
        <form className="stack" onSubmit={submit} noValidate>
          {error && (
            <div className="note bad" role="alert">
              {error}
            </div>
          )}
          <Field label="Email">
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required autoFocus />
          </Field>
          <button className="btn primary lg" disabled={busy}>
            {busy && <Spinner size={16} />} Send reset link
          </button>
        </form>
      )}
      <p className="small muted" style={{ textAlign: 'center', margin: 0 }}>
        Remembered it? <Link to="/signin">Back to sign in</Link>
      </p>
    </AuthCard>
  );
}

export function ResetPage() {
  const { setUser } = useAuth();
  const token = new URLSearchParams(location.search).get('token') ?? '';
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState(token ? '' : 'This reset link is incomplete. Ask for a new one.');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== again) return setError('The two passwords do not match.');
    setError('');
    setBusy(true);
    try {
      const r = await api<{ user: User }>('/api/auth/reset', { body: { token, password } });
      setUser(r.user);
      navigate('/app', { replace: true });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard title="Choose a new password" lead="You will be signed in straight away, and signed out on every other device.">
      <form className="stack" onSubmit={submit} noValidate>
        {error && (
          <div className="note bad" role="alert">
            {error} {error.includes('new one') && <Link to="/forgot">Send a new link</Link>}
          </div>
        )}
        <Field label="New password" hint="At least 8 characters.">
          <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required minLength={8} autoFocus />
        </Field>
        <Field label="New password again">
          <PasswordInput value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" required minLength={8} />
        </Field>
        <button className="btn primary lg" disabled={busy || !token}>
          {busy && <Spinner size={16} />} Save new password
        </button>
      </form>
    </AuthCard>
  );
}
