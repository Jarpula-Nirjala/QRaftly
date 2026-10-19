import { lazy, StrictMode, Suspense, useEffect, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider, useAuth } from './auth.tsx';
import { match, navigate, scrollToHash, useLocation } from './router.tsx';
import { BackBar, Footer, Header, Loading, ToastProvider } from './ui.tsx';
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

// The five feature pages and the newer tools load on demand, keeping the first page light.
const StudioPage = lazy(() => import('./pages/explore/Studio.tsx'));
const GrowthPage = lazy(() => import('./pages/explore/Growth.tsx'));
const VenuesPage = lazy(() => import('./pages/explore/Venues.tsx'));
const TrustPage = lazy(() => import('./pages/explore/Trust.tsx'));
const EnginePage = lazy(() => import('./pages/explore/Engine.tsx'));
const more = () => import('./pages/More.tsx');
const FeedbackList = lazy(() => more().then((m) => ({ default: m.FeedbackList })));
const FeedbackDetail = lazy(() => more().then((m) => ({ default: m.FeedbackDetail })));
const QueueList = lazy(() => more().then((m) => ({ default: m.QueueList })));
const QueueDesk = lazy(() => more().then((m) => ({ default: m.QueueDesk })));
const KeysPage = lazy(() => more().then((m) => ({ default: m.KeysPage })));
const Kiosk = lazy(() => more().then((m) => ({ default: m.Kiosk })));
const publicMore = () => import('./pages/PublicMore.tsx');
const FeedbackPublic = lazy(() => publicMore().then((m) => ({ default: m.FeedbackPublic })));
const QueuePublic = lazy(() => publicMore().then((m) => ({ default: m.QueuePublic })));
const NotePublic = lazy(() => publicMore().then((m) => ({ default: m.NotePublic })));

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

const EXPLORE_PAGES: Record<string, ReturnType<typeof lazy>> = { '/studio': StudioPage, '/growth': GrowthPage, '/venues': VenuesPage, '/trust': TrustPage, '/engine': EnginePage };

function Routes() {
  const { path } = useLocation();
  const { user, ready } = useAuth();
  useEffect(() => {
    if (location.hash.length > 1) scrollToHash(location.hash.slice(1));
  }, []);

  // Hosted pages that a scan lands on: no app chrome.
  let m: Record<string, string> | null;
  const bare = (node: ReactNode) => <Suspense fallback={<Loading />}>{node}</Suspense>;
  if ((m = match('/p/:slug', path))) return <ProfilePage slug={m.slug} />;
  if ((m = match('/m/:slug', path))) return <MedicalPage slug={m.slug} />;
  if ((m = match('/g/:slug', path))) return <GatePage slug={m.slug} />;
  if ((m = match('/x/:reason', path))) return <BlockedPage reason={m.reason} />;
  if ((m = match('/t/:token', path))) return <TicketPage token={m.token} />;
  if ((m = match('/f/:id', path))) return bare(<FeedbackPublic id={m.id} />);
  if ((m = match('/q/:id', path))) return bare(<QueuePublic id={m.id} />);
  if ((m = match('/n/:id', path))) return bare(<NotePublic id={m.id} />);
  if ((m = match('/app/events/:id/kiosk', path))) return bare(<Private><Kiosk id={m.id} /></Private>);

  let page: ReactNode;
  let footer = false;
  const Explore = EXPLORE_PAGES[path];
  if (path === '/') {
    // Signed-in visitors land on their codes; everyone else (and anyone following a #link) sees the home page.
    if (!ready) page = <Loading />;
    else if (user && !location.hash) {
      navigate('/app', { replace: true });
      page = <Loading />;
    } else page = <Landing />;
  } else if (Explore) page = <Explore />;
  else if (path === '/signin' || path === '/signup') page = <AuthPage key={path} mode={path === '/signin' ? 'signin' : 'signup'} />;
  else if (path === '/verify') (page = <VerifyPage />), (footer = true);
  else if ((m = match('/v/:payload', path))) (page = <VerifyPage initial={location.href} />), (footer = true);
  else if (path === '/app') page = <Private><Dashboard /></Private>;
  else if (path === '/app/new') page = <Private><NewCode /></Private>;
  else if ((m = match('/app/qr/:id', path))) page = <Private><QrDetail key={m.id} id={m.id} /></Private>;
  else if (path === '/app/events') page = <Private><EventsPage /></Private>;
  else if ((m = match('/app/events/:id/scan', path))) page = <Private><DoorScanner id={m.id} /></Private>;
  else if ((m = match('/app/events/:id', path))) page = <Private><EventDetail key={m.id} id={m.id} /></Private>;
  else if (path === '/app/certificates') page = <Private><CertificatesPage /></Private>;
  else if (path === '/app/bulk') page = <Private><BulkPage /></Private>;
  else if (path === '/app/feedback') page = <Private><FeedbackList /></Private>;
  else if ((m = match('/app/feedback/:id', path))) page = <Private><FeedbackDetail key={m.id} id={m.id} /></Private>;
  else if (path === '/app/queues') page = <Private><QueueList /></Private>;
  else if ((m = match('/app/queues/:id', path))) page = <Private><QueueDesk key={m.id} id={m.id} /></Private>;
  else if (path === '/app/keys') page = <Private><KeysPage /></Private>;
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
      {path !== '/' && <BackBar />}
      <main>
        <Suspense fallback={<Loading />}>{page}</Suspense>
      </main>
      {footer && <Footer />}
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
