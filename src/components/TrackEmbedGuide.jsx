import React, { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import '../assets/EmbedPages.css';

function copyText(text) {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).catch(() => {});
  }
}

export default function TrackEmbedGuide({ trackSlug: trackProp, compact = false }) {
  const { track: routeTrack } = useParams();
  const trackSlug = trackProp || routeTrack || 'kart-demo';
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://your-hakafast-server';

  const snippets = useMemo(() => {
    const bookingUrl = `${origin}/embed/booking/${trackSlug}`;
    const liveUrl = `${origin}/embed/live/${trackSlug}?theme=dark`;
    return {
      bookingIframe: `<iframe src="${bookingUrl}" title="הזמנת מקצה" width="100%" height="720" style="border:0;border-radius:12px;max-width:480px;" loading="lazy"></iframe>`,
      liveIframe: `<iframe src="${liveUrl}" title="Live Timing" width="100%" height="420" style="border:0;border-radius:8px;" loading="lazy"></iframe>`,
      availabilityFetch: `fetch('${origin}/api/public/track/${trackSlug}/availability?from=2026-07-01&to=2026-07-14')
  .then(r => r.json())
  .then(data => console.log(data.days));`,
      bookingUrl,
      liveUrl,
    };
  }, [origin, trackSlug]);

  return (
    <div className={`emb-guide${compact ? ' emb-guide-compact' : ''}`} dir="rtl">
      <h3 className="emb-guide-title">שילוב באתר המסלול</h3>
      <p className="emb-guide-lead">
        הדביקו iframe או קראו ל-API הציבורי — הלקוח רואה זמינות לפני הזמנה, והמסלול מסמן ימי חג/עומס בלוח היום.
      </p>

      <section className="emb-guide-block">
        <h4>הזמנות + לוח זמינות</h4>
        <pre className="emb-snippet">{snippets.bookingIframe}</pre>
        <button type="button" className="emb-copy-btn" onClick={() => copyText(snippets.bookingIframe)}>העתק iframe</button>
        <a className="emb-preview-link" href={snippets.bookingUrl} target="_blank" rel="noreferrer">תצוגה מקדימה</a>
      </section>

      <section className="emb-guide-block">
        <h4>Live Timing באתר</h4>
        <pre className="emb-snippet">{snippets.liveIframe}</pre>
        <button type="button" className="emb-copy-btn" onClick={() => copyText(snippets.liveIframe)}>העתק iframe</button>
        <a className="emb-preview-link" href={snippets.liveUrl} target="_blank" rel="noreferrer">תצוגה מקדימה</a>
      </section>

      {!compact && (
        <section className="emb-guide-block">
          <h4>API זמינות (אתר מותאם אישית)</h4>
          <pre className="emb-snippet">{snippets.availabilityFetch}</pre>
          <button type="button" className="emb-copy-btn" onClick={() => copyText(snippets.availabilityFetch)}>העתק</button>
        </section>
      )}

      <ul className="emb-guide-tips">
        <li>סמנו ימי חג/עומס ב<strong>הגדרות הזמנות → ימים מיוחדים</strong></li>
        <li>אירועים בלוח היום (יום הולדת, תחזוקה) מורידים קיבולת אוטומטית</li>
        <li>בהתקנה מקומית — ה-API הציבורי עובד מול שרת HAKAFAST של המסלול</li>
      </ul>
    </div>
  );
}
