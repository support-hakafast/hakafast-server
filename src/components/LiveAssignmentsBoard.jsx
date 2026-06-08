import React from 'react';

function driverLabel(row, heatType, t) {
  if (heatType === 'endurance') {
    if (Array.isArray(row.team_drivers) && row.team_drivers.length) {
      return row.team_drivers.join(' · ');
    }
    return row.team_name || row.driver_name || '—';
  }
  return row.driver_name || t('anonymous');
}

export default function LiveAssignmentsBoard({
  t,
  rows,
  heatType = 'time',
  rowFlashClass,
  isNextHeat = false,
}) {
  const isEndurance = heatType === 'endurance';

  return (
    <div className={`live-assignments${isNextHeat ? ' live-assignments-next' : ''}`}>
      <div className="live-assignments-banner">
        <span className="live-assignments-banner-icon" aria-hidden>🏁</span>
        <div>
          <strong>{isNextHeat ? t('live_assignments_next_heat') : t('live_assignments_current')}</strong>
          <p>{isNextHeat ? t('live_assignments_next_hint') : t('live_assignments_hint')}</p>
        </div>
      </div>

      <div className="live-assignments-grid">
        {rows.map((row, index) => {
          const flash = rowFlashClass ? rowFlashClass(row, index) : '';
          const name = driverLabel(row, heatType, t);
          const hasKart = row.kart_number != null && row.kart_number !== '';
          const waiting = row.status === 'queued' || !hasKart;
          const onTrackWait = row.status === 'waiting_on_track';

          return (
            <article
              key={`assign-card-${row.position ?? index}-${row.kart_number || row.driver_name}`}
              className={`live-assign-card${flash ? ` ${flash}` : ''}${waiting ? ' is-waiting' : ''}${onTrackWait ? ' is-on-track-wait' : ''}`}
            >
              <div className="live-assign-kart" aria-label={t('kart')}>
                {hasKart ? (
                  <span className="live-assign-kart-num">{row.kart_number}</span>
                ) : (
                  <span className="live-assign-kart-pending">—</span>
                )}
              </div>
              <div className="live-assign-info">
                <span className="live-assign-name">{name}</span>
                {isEndurance && row.team_name && (
                  <span className="live-assign-team">{row.team_name}</span>
                )}
                {onTrackWait && (
                  <span className="live-assign-status live-assign-status-track">{t('live_assign_waiting_on_track')}</span>
                )}
                {waiting && !onTrackWait && (
                  <span className="live-assign-status">{t('status_waiting')}</span>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
