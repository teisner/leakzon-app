import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, useLocation } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { LanguageProvider } from '@/lib/i18n';
import { ThemeProvider } from '@/lib/ThemeContext';
import ScrollToTop from './components/ScrollToTop';
import Home from './pages/Home';
import ProjectDetail from './pages/ProjectDetail';
import UploadData from './pages/UploadData';
import MobileLocator from './pages/MobileLocator';
import CustomerMode from './pages/CustomerMode';
import { useInactivityLogout } from './hooks/useInactivityLogout';
import { SpeedInsights } from '@vercel/speed-insights/react';
import ImpersonationBanner from './components/ImpersonationBanner';
import PreviewAutoRefresh from './components/PreviewAutoRefresh';
import { IS_PREVIEW } from './lib/deployEnv';

// Temporarily off while investigating a production-only repaint flicker.
const SPEED_INSIGHTS_ENABLED = false;

// Only runs inactivity logout on authenticated routes, not public-facing ones
const InactivityGuard = () => {
  const location = useLocation();
  const isPublic = location.pathname.startsWith('/mobile-locator') || location.pathname.startsWith('/customer-mode');
  useInactivityLogout(isPublic);
  return null;
};


function App() {

  return (
    <LanguageProvider>
    <ThemeProvider>
    <QueryClientProvider client={queryClientInstance}>
      <Router>
        <ImpersonationBanner />
        {IS_PREVIEW && <PreviewAutoRefresh />}
        <ScrollToTop />
        <InactivityGuard />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/project/:id" element={<ProjectDetail />} />
          <Route path="/project/:id/upload" element={<UploadData />} />
          <Route path="/mobile-locator/:projectId" element={<MobileLocator />} />
          <Route path="/customer-mode/:projectId" element={<CustomerMode />} />
          <Route path="*" element={<PageNotFound />} />
        </Routes>
      </Router>
      <Toaster />
      {/* Vercel Speed Insights instruments every interaction (INP) via
          PerformanceObserver. It is the one thing that runs on production but
          not on preview — the preview URL sits behind Vercel SSO, so its
          /_vercel/speed-insights/script.js returns 302 and never loads. That
          matches a flicker seen only on production. Disabled while we confirm;
          flip back to true to re-enable. */}
      {SPEED_INSIGHTS_ENABLED && <SpeedInsights />}
    </QueryClientProvider>
    </ThemeProvider>
    </LanguageProvider>
  )
}

export default App