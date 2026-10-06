import { lazy, Suspense, useEffect } from 'react';
import { AlertCircle, CheckCircle2, HeartPulse, Info, X } from 'lucide-react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, ThemeProvider, ToastProvider, useAuth, useToasts } from './app/providers';
import RouteGuard from './components/RouteGuard';
import { SiteShell } from './components/SiteShell';
const AuthPage = lazy(() => import('./pages/AuthPage'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const HomePage = lazy(() => import('./pages/PublicPages').then((pages) => ({ default: pages.HomePage })));
const ServicesPage = lazy(() => import('./pages/PublicPages').then((pages) => ({ default: pages.ServicesPage })));
const AboutPage = lazy(() => import('./pages/PublicPages').then((pages) => ({ default: pages.AboutPage })));
const ArchitecturePage = lazy(() => import('./pages/PublicPages').then((pages) => ({ default: pages.ArchitecturePage })));
const ContactPage = lazy(() => import('./pages/PublicPages').then((pages) => ({ default: pages.ContactPage })));
const LegalPage = lazy(() => import('./pages/PublicPages').then((pages) => ({ default: pages.LegalPage })));
const NotFoundPage = lazy(() => import('./pages/PublicPages').then((pages) => ({ default: pages.NotFoundPage })));

function AppRoutes() {
  const { session } = useAuth();
  return <>
    <Suspense fallback={<div className="route-loading" role="status"><HeartPulse size={19} /> Loading your workspace…</div>}>
      <Routes>
      <Route element={<SiteShell />}>
        <Route index element={<HomePage />} />
        <Route path="services" element={<ServicesPage />} />
        <Route path="about" element={<AboutPage />} />
        <Route path="architecture" element={<ArchitecturePage />} />
        <Route path="contact" element={<ContactPage />} />
        <Route path="privacy" element={<LegalPage kind="privacy" />} />
        <Route path="terms" element={<LegalPage kind="terms" />} />
      </Route>
      <Route path="/login" element={session ? <Navigate to="/app" replace /> : <AuthPage mode="login" />} />
      <Route path="/register" element={session ? <Navigate to="/app" replace /> : <AuthPage mode="register" />} />
      <Route path="/forgot-password" element={<AuthPage mode="forgot" />} />
      <Route path="/reset-password" element={<AuthPage mode="reset" />} />
      <Route element={<RouteGuard />}>
        <Route path="/app" element={<Navigate to="/app/overview" replace />} />
        <Route path="/app/:section" element={<Dashboard />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
      </Suspense>
    <ToastViewport />
  </>;
}

function ToastViewport() {
  const { notices, dismissToast } = useToasts();
  useEffect(() => {
    if (!notices.length) return;
    const timer = window.setTimeout(() => dismissToast(notices[0].id), 5200);
    return () => window.clearTimeout(timer);
  }, [notices, dismissToast]);
  return <div className="toast-viewport" aria-live="polite" aria-atomic="false">{notices.map((notice) => <div className={`toast toast-${notice.tone}`} key={notice.id} role="status"><span className="toast-icon">{notice.tone === 'error' ? <AlertCircle size={17} /> : notice.tone === 'success' ? <CheckCircle2 size={17} /> : <Info size={17} />}</span><span><b>{notice.title}</b><small>{notice.message}</small></span><button onClick={() => dismissToast(notice.id)} aria-label="Dismiss notification"><X size={15} /></button></div>)}</div>;
}

export default function App() {
  return <ThemeProvider><AuthProvider><ToastProvider><AppRoutes /></ToastProvider></AuthProvider></ThemeProvider>;
}