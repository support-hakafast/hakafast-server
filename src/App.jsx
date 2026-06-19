import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { LanguageProvider } from './i18n/LanguageContext.jsx';
import { DialogProvider } from './i18n/DialogContext.jsx';
import HomePage from './components/HomePage.jsx';
import AdminPanel from './components/AdminPanel.jsx';
import LiveTiming from './components/LiveTiming.jsx';
import LiveDeskPage from './components/LiveDeskPage.jsx';
import TrackQuotePage from './components/TrackQuotePage.jsx';
import InstallGuidePage from './components/InstallGuidePage.jsx';
import SetupWizard from './components/SetupWizard.jsx';
import Reception from './components/Reception.jsx';
import ResultsPage from './components/ResultsPage.jsx';
import ChampionshipPage from './components/ChampionshipPage.jsx';
import BookingPage from './components/BookingPage.jsx';
import OfflineBanner from './components/OfflineBanner.jsx';
import { fetchInstallConfig } from './utils/installMode.js';

function LocalInstallGuard({ children }) {
  const location = useLocation();
  const [ready, setReady] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [localAdminPath, setLocalAdminPath] = useState(null);

  useEffect(() => {
    fetchInstallConfig().then((cfg) => {
      const local = Boolean(cfg?.localInstall);
      const complete = Boolean(cfg?.setupComplete);
      setNeedsSetup(local && !complete);
      if (local && complete && cfg?.config?.trackSlug) {
        setLocalAdminPath(`/admin/${cfg.config.trackSlug}`);
      }
      setReady(true);
    });
  }, []);

  if (!ready) return null;

  if (needsSetup && location.pathname !== '/setup') {
    return <Navigate to="/setup" replace />;
  }

  if (localAdminPath && location.pathname === '/') {
    return <Navigate to={localAdminPath} replace />;
  }

  return children;
}

function App() {
  return (
    <LanguageProvider>
      <DialogProvider>
        <Router>
          <OfflineBanner />
          <LocalInstallGuard>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/setup" element={<SetupWizard />} />
              <Route path="/admin" element={<AdminPanel />} />
              <Route path="/admin/:trackName" element={<AdminPanel />} />
              <Route path="/admin.html" element={<AdminPanel />} />
              <Route path="/reception" element={<Reception />} />
              <Route path="/reception/:track" element={<Reception />} />
              <Route path="/results" element={<ResultsPage />} />
              <Route path="/results/:heatId" element={<ResultsPage />} />
              <Route path="/live-timing" element={<LiveTiming />} />
              <Route path="/live-timing/:track" element={<LiveTiming />} />
              <Route path="/live-desk/:track" element={<LiveDeskPage />} />
              <Route path="/quote" element={<TrackQuotePage />} />
              <Route path="/install-guide" element={<InstallGuidePage />} />
              <Route path="/championship" element={<ChampionshipPage />} />
              <Route path="/championship/:trackName" element={<ChampionshipPage />} />
              <Route path="/booking/:track" element={<BookingPage />} />
            </Routes>
          </LocalInstallGuard>
        </Router>
      </DialogProvider>
    </LanguageProvider>
  );
}

export default App;
