import { KeyRound, Mail, Trash2, UserRound } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { api, errorText } from '../api.ts';
import { useAuth, type User } from '../auth.tsx';
import { Link, navigate } from '../router.tsx';
import { Field, Loading, Spinner, useToast } from '../ui.tsx';
import { PasswordInput } from './Auth.tsx';

interface AccountInfo {
  user: User;
  hasPassword: boolean;
  google: boolean;
}

/** Account settings: name, email, password and deleting the account. */
export function AccountPage() {
  const { setUser } = useAuth();
  const toast = useToast();
  const [info, setInfo] = useState<AccountInfo | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [emailPw, setEmailPw] = useState('');
  const [current, setCurrent] = useState('');
  const [fresh, setFresh] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState<'' | 'name' | 'email' | 'password'>('');
  const [error, setError] = useState<{ at: string; text: string } | null>(null);

  const apply = (a: AccountInfo) => {
    setInfo(a);
    setUser(a.user);
    setName(a.user.name);
    setEmail(a.user.email);
  };
  useEffect(() => {
    api<AccountInfo>('/api/auth/account').then(apply, (e) => setError({ at: 'load', text: errorText(e) }));
  }, []);

  const save = async (at: 'name' | 'email' | 'password', body: Record<string, string>, done: string) => {
    setError(null);
    setBusy(at);
    try {
      apply(await api<AccountInfo>('/api/auth/account', { method: 'PATCH', body }));
      toast(done);
      return true;
    } catch (e) {
      setError({ at, text: errorText(e) });
      return false;
    } finally {
      setBusy('');
    }
  };
  const errorFor = (at: string) =>
    error?.at === at && (
      <div className="note bad" role="alert">
        {error.text}
      </div>
    );

  if (!info) return error ? <div className="page wrap">{errorFor('load')}</div> : <Loading />;

  const changePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (fresh !== again) return setError({ at: 'password', text: 'The two new passwords do not match.' });
    if (await save('password', { password: fresh, currentPassword: current }, info.hasPassword ? 'Password changed. Other devices were signed out.' : 'Password set. You can now sign in with your email too.')) {
      setCurrent('');
      setFresh('');
      setAgain('');
    }
  };

  return (
    <div className="page">
      <div className="wrap account">
        <div className="page-head">
          <div>
            <h1>Your account</h1>
            <p>
              Signed in as <b>{info.user.email}</b>
              {info.google && ' · linked to Google'}
            </p>
          </div>
        </div>

        <form
          className="card stack"
          onSubmit={(e) => {
            e.preventDefault();
            void save('name', { name }, 'Name saved.');
          }}
        >
          <h3 className="acc-h">
            <UserRound size={20} /> Name
          </h3>
          {errorFor('name')}
          <Field label="Your name">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </Field>
          <button className="btn primary" disabled={busy !== '' || name.trim() === info.user.name}>
            {busy === 'name' && <Spinner size={16} />} Save name
          </button>
        </form>

        <form
          className="card stack"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await save('email', { email, currentPassword: emailPw }, 'Email changed. Use the new one next time you sign in.')) setEmailPw('');
          }}
        >
          <h3 className="acc-h">
            <Mail size={20} /> Email
          </h3>
          {errorFor('email')}
          <Field label="Email address" hint="You sign in with this, and password reset links are sent here.">
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </Field>
          {info.hasPassword && email.trim().toLowerCase() !== info.user.email && (
            <Field label="Current password" hint="Needed to change your email.">
              <PasswordInput value={emailPw} onChange={(e) => setEmailPw(e.target.value)} autoComplete="current-password" />
            </Field>
          )}
          <button className="btn primary" disabled={busy !== '' || email.trim().toLowerCase() === info.user.email}>
            {busy === 'email' && <Spinner size={16} />} Change email
          </button>
        </form>

        <form className="card stack" onSubmit={changePassword}>
          <h3 className="acc-h">
            <KeyRound size={20} /> {info.hasPassword ? 'Password' : 'Set a password'}
          </h3>
          {!info.hasPassword && <p className="muted small" style={{ margin: 0 }}>You sign in with Google. Set a password to sign in with your email as well.</p>}
          {errorFor('password')}
          {info.hasPassword && (
            <Field label="Current password">
              <PasswordInput value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
            </Field>
          )}
          <Field label="New password" hint="At least 8 characters.">
            <PasswordInput value={fresh} onChange={(e) => setFresh(e.target.value)} autoComplete="new-password" />
          </Field>
          <Field label="New password again">
            <PasswordInput value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" />
          </Field>
          <button className="btn primary" disabled={busy !== '' || !fresh}>
            {busy === 'password' && <Spinner size={16} />} {info.hasPassword ? 'Change password' : 'Set password'}
          </button>
          {info.hasPassword && (
            <p className="small muted" style={{ margin: 0 }}>
              Forgot your current password? <Link to={`/forgot?email=${encodeURIComponent(info.user.email)}`}>Get a reset link by email</Link>.
            </p>
          )}
        </form>

        <div className="card stack">
          <h3 className="acc-h">
            <Trash2 size={20} /> Delete account
          </h3>
          <p className="muted small" style={{ margin: 0 }}>
            Deletes your account and every code, event, certificate and scan record in it. Printed dynamic codes stop working. This cannot be undone.
          </p>
          <button
            className="btn danger"
            onClick={async () => {
              if (!confirm('Delete your QRaftly account and everything in it? This cannot be undone.')) return;
              try {
                await api('/api/auth/me', { method: 'DELETE' });
                setUser(null);
                navigate('/', { replace: true });
              } catch (e) {
                toast(errorText(e), true);
              }
            }}
          >
            <Trash2 size={16} /> Delete my account
          </button>
        </div>
      </div>
    </div>
  );
}
