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

const STATUS_KEYS = {
  waiting_on_track: 'live_assign_waiting_on_track',
  ready_to_launch: 'live_assign_ready_launch',
  in_pits_queue: 'live_assign_in_pits_queue',
  at_pit_exit: 'live_assign_at_exit',
  on_track: 'live_assign_on_track',
  queued: 'status_waiting',
};

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
      <div className="live-assignments-banner live-assignments-banner-compact">
        <span className="live-assignments-banner-icon" aria-hidden>🏁</span>
        <div>
          <strong>{isNextHeat ? t('live_assignments_next_heat') : t('live_assignments_current')}</strong>
        </div>
      </div>

      <div className="live-assignments-grid live-assignments-grid-2col">
        {rows.map((row, index) => {
          const flash = rowFlashClass ? rowFlashClass(row, index) : '';
          const name = driverLabel(row, heatType, t);
          const hasKart = row.kart_number != null && row.kart_number !== '';
          const waiting = row.status === 'queued' || !hasKart;
          const onTrackWait = row.status === 'waiting_on_track';
          const readyLaunch = row.status === 'ready_to_launch';
          const inPitsQueue = row.status === 'in_pits_queue';
          const statusKey = STATUS_KEYS[row.status];

          return (
            <article
              key={`assign-card-${row.position ?? index}-${row.kart_number || row.driver_name}`}
              className={[
                'live-assign-card',
                'live-assign-card-compact',
                flash,
                waiting ? 'is-waiting' : '',
                onTrackWait ? 'is-on-track-wait' : '',
                readyLaunch ? 'is-ready-launch' : '',
                inPitsQueue ? 'is-pits-queue' : '',
              ].filter(Boolean).join(' ')}
            >
              <span className="live-assign-kart-num" aria-label={t('kart')}>
                {hasKart ? row.kart_number : '—'}
              </span>
              <span className="live-assign-name" title={name}>{name}</span>
              {statusKey && (
                <span className={`live-assign-status${onTrackWait ? ' live-assign-status-track' : ''}${readyLaunch ? ' live-assign-status-ready' : ''}`}>
                  {t(statusKey)}
                </span>
              )}
              {isEndurance && row.team_name && !statusKey && (
                <span className="live-assign-team">{row.team_name}</span>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
