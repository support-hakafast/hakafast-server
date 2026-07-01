import React from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import LiveTiming from './LiveTiming.jsx';
import '../assets/EmbedPages.css';

/** Minimal chrome live timing for iframe embed on track website. */
export default function EmbedLivePage() {
  const { track } = useParams();
  const [params] = useSearchParams();
  const theme = params.get('theme') === 'light' ? 'light' : 'dark';

  return (
    <div className={`emb-live-wrap theme-${theme}`} data-embed="1">
      <LiveTiming embedMode trackOverride={track} embedTheme={theme} />
    </div>
  );
}
