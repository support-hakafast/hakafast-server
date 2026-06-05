import React, { useState, useEffect, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import '../assets/LiveTiming.css';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import LanguageSwitcher from './LanguageSwitcher.jsx';
import HakafastLogo from './HakafastLogo.jsx';

const TRACK_IDS = {
  'kart-demo': '1',
  default: '1',
};

const HEAT_LABEL_KEYS = {
  time: 'heat_time',
  endurance: 'heat_endurance',
  sprint: 'heat_sprint',
};

function resolveTrackId(track) {
  if (!track) return TRACK_IDS.default;
  return TRACK_IDS[track] || TRACK_IDS.default;
}

const LiveTiming = () => {
  const { track } = useParams();
  const { t } = useLanguage();
  const [rowsData, setRowsData] = useState([]);
  const [heatType, setHeatType] = useState('time');

  const trackId = useMemo(() => resolveTrackId(track), [track]);
  const titleKey = track === 'kart-demo' ? 'live_title_demo' : 'live_title_haifa';
  const sessionLabel = t(HEAT_LABEL_KEYS[heatType] || 'session_practice');

  const updateTable = async () => {
    try {
      const res = await fetch(`/live-timing-data/${trackId}`);
      if (!res.ok) return;
      const data = await res.json();
      setRowsData(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error fetching live timing:', err);
    }
  };

  useEffect(() => {
    fetch('/api/heat-settings')
      .then((r) => r.json())
      .then((s) => setHeatType(s?.type || 'time'))
      .catch(() => {});
  }, []);

  useEffect(() => {
    updateTable();
    const interval = setInterval(updateTable, 2000);
    return () => clearInterval(interval);
  }, [trackId]);

  return (
    <div className="live-timing">
      <header className="live-timing-header">
        <div>
          <h1>{t(titleKey)}</h1>
          <span className="live-session-badge">{sessionLabel}</span>
        </div>
        <div className="live-header-actions">
          <HakafastLogo to="/" className="live-header-logo" />
          <LanguageSwitcher />
        </div>
      </header>

      {rowsData.length === 0 ? (
        <p className="live-empty">{t('live_waiting')}</p>
      ) : (
        <div className="live-timing-table-wrap">
          <table className="live-timing-table">
            <thead>
              <tr>
                <th>{t('pos')}</th>
                <th>{t('kart')}</th>
                <th>{t('driver')}</th>
                <th>{t('last_lap')}</th>
                <th>{t('best_lap')}</th>
                <th>{t('laps')}</th>
              </tr>
            </thead>
            <tbody>
              {rowsData.map((row, index) => {
                const isOverallBest = index === 0 && row.best_lap_time;
                return (
                  <tr key={`${row.kart_number}-${index}`}>
                    <td className="live-pos">{index + 1}</td>
                    <td>{row.kart_number}</td>
                    <td style={{ textAlign: 'start' }}>
                      {isOverallBest && '👑 '}
                      {row.driver_name || t('anonymous')}
                    </td>
                    <td>{row.last_lap_time || '--.---'}</td>
                    <td className={isOverallBest ? 'live-best' : ''}>{row.best_lap_time || '--.---'}</td>
                    <td>{row.lap_count ?? row.total_laps ?? 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default LiveTiming;
