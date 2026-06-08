import React, { useEffect, useState } from 'react';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import '../assets/OfflineBanner.css';

const POLL_MS = 15000;

export default function OfflineBanner() {
  const { t } = useLanguage();
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const res = await fetch('/api/kiosk/health', { credentials: 'same-origin' });
        if (!cancelled) setOffline(!res.ok);
      } catch {
        if (!cancelled) setOffline(true);
      }
    };

    check();
    const id = setInterval(check, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!offline) return null;

  return (
    <div className="hf-offline-banner" role="status">
      {t('offline_banner')}
    </div>
  );
}
