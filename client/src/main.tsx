import { StrictMode, useEffect, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider, useAuth } from './auth.tsx';
import { match, navigate, useLocation } from './router.tsx';
import { Footer, Header, Loading, ToastProvider } from './ui.tsx';
import { AuthPage } from './pages/Auth.tsx';
import { BulkPage } from './pages/Bulk.tsx';
import { CertificatesPage, VerifyPage } from './pages/Certificates.tsx';
import { Dashboard } from './pages/Dashboard.tsx';
import { Editor } from './pages/Editor.tsx';
import { DoorScanner, EventDetail, EventsPage } from './pages/Events.tsx';
import { Landing } from './pages/Landing.tsx';
import { BlockedPage, GatePage, MedicalPage, ProfilePage, TicketPage } from './pages/Public.tsx';
import { QrDetail } from './pages/QrDetail.tsx';
import './styles.css';

/** Pages under /app need an account; visitors are sent to sign in and brought back afterwards. */
function Private({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  useEffect(() => {
    if (ready && !user) navigate(`/signin?next=${encodeURIComponent(location.pathname + location.search)}`, { replace: true });
  }, [ready, user]);
  if (!ready || !user) return <Loading />;
  return <>{children}</>;
}

function NewCode() {
  return (
    <div className="page">
      <div className="wrap">
        <div className="page-head">
          <div>
            <h1>New code</h1>
            <p>Choose what it should do. You can change the design and, for hosted kinds, the content at any time.</p>
          </div>
        </div>
        <Editor />
      </div>
    </div>
  );
}

function Routes() {
  const { path } = useLocation();
  const { user, ready } = useAuth();

  // Hosted pages that a scan lands on: no app chrome.
  let m: Record<string, string> | null;
  if ((m = match('/p/:slug', path))) return <ProfilePage slug={m.slug} />;
  if ((m = match('/m/:slug', path))) return <MedicalPage slug={m.slug} />;
  if ((m = match('/g/:slug', path))) return <GatePage slug={m.slug} />;
  if ((m = match('/x/:reason', path))) return <BlockedPage reason={m.reason} />;
  if ((m = match('/t/:token', path))) return <TicketPage token={m.token} />;

  let page: ReactNode;
  if (path === '/') {
    // Signed-in visitors land on their codes; everyone else sees the home page.
    if (!ready) page = <Loading />;
    else if (user && !location.hash) {
      navigate('/app', { replace: true });
      page = <Loading />;
    } else page = <Landing />;
  } else if (path === '/signin' || path === '/signup') page = <AuthPage key={path} mode={path === '/signin' ? 'signin' : 'signup'} />;
  else if (path === '/verify') page = <VerifyPage />;
  else if ((m = match('/v/:payload', path))) page = <VerifyPage initial={location.href} />;
  else if (path === '/app') page = <Private><Dashboard /></Private>;
  else if (path === '/app/new') page = <Private><NewCode /></Private>;
  else if ((m = match('/app/qr/:id', path))) page = <Private><QrDetail key={m.id} id={m.id} /></Private>;
  else if (path === '/app/events') page = <Private><EventsPage /></Private>;
  else if ((m = match('/app/events/:id/scan', path))) page = <Private><DoorScanner id={m.id} /></Private>;
  else if ((m = match('/app/events/:id', path))) page = <Private><EventDetail key={m.id} id={m.id} /></Private>;
  else if (path === '/app/certificates') page = <Private><CertificatesPage /></Private>;
  else if (path === '/app/bulk') page = <Private><BulkPage /></Private>;
  else
    page = (
      <div className="page wrap empty">
        <h1>Page not found</h1>
        <p>That address does not exist.</p>
      </div>
    );

  return (
    <>
      <Header />
      <main>{page}</main>
      {path !== '/' && path.startsWith('/app') === false && path !== '/signin' && path !== '/signup' && <Footer />}
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <ToastProvider>
        <Routes />
      </ToastProvider>
    </AuthProvider>
  </StrictMode>,
);
