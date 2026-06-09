import React from 'react';
import { formatDriverName, formatTeamDriversList } from '../utils/teamDrivers.js';

const STATUS_KEYS = {
  waiting_on_track: 'live_assign_waiting_on_track',
  awaiting_track_kart: 'live_assign_awaiting_track_kart',
  ready_to_launch: 'live_assign_ready_launch',
  in_pits_queue: 'live_assign_in_pits_queue',
  at_pit_exit: 'live_assign_at_exit',
  on_track: 'live_assign_on_track',
  queued: 'status_waiting',
};

function EnduranceDriverList({ row, t }) {
  const names = Array.isArray(row.team_drivers)
    ? row.team_drivers.map(formatDriverName).filter(Boolean)
    : [];
  const active = row.active_driver || row.driver_name;

  if (!names.length) {
    return <span className="live-assign-name">{formatDriverName(active) || '—'}</span>;
  }

  return (
    <ul className="live-assign-driver-rows">
      {names.map((name) => (
        <li
          key={`${row.kart_number || row.team_name}-${name}`}
          className={name === active ? 'is-starter' : ''}
        >
          {name === active && <span className="live-assign-starter-badge">{t('live_starter_driver')}</span>}
          <span>{name}</span>
        </li>
      ))}
    </ul>
  );
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
      <div className="live-assignments-banner live-assignments-banner-compact">
        <span className="live-assignments-banner-icon" aria-hidden>🏁</span>
        <div>
          <strong>{isNextHeat ? t('live_assignments_next_heat') : t('live_assignments_current')}</strong>
        </div>
      </div>

      <div className="live-assignments-grid">
        {rows.map((row, index) => {
          const flash = rowFlashClass ? rowFlashClass(row, index) : '';
          const hasKart = row.kart_number != null && row.kart_number !== '';
          const waiting = row.status === 'queued' || !hasKart;
          const onTrackWait = row.status === 'waiting_on_track';
          const readyLaunch = row.status === 'ready_to_launch';
          const inPitsQueue = row.status === 'in_pits_queue';
          const statusKey = STATUS_KEYS[row.status];
          const plainName = isEndurance
            ? (row.team_name || formatTeamDriversList(row.team_drivers) || row.driver_name)
            : (row.driver_name || t('anonymous'));

          return (
            <article
              key={`assign-card-${row.position ?? index}-${row.kart_number || row.team_name || plainName}`}
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
              <div className="live-assign-names-block">
                {isEndurance ? (
                  <>
                    {row.team_name && <strong className="live-assign-team-title">{row.team_name}</strong>}
                    <EnduranceDriverList row={row} t={t} />
                  </>
                ) : (
                  <span className="live-assign-name" title={plainName}>{plainName}</span>
                )}
              </div>
              {statusKey && (
                <span className={`live-assign-status${onTrackWait ? ' live-assign-status-track' : ''}${readyLaunch ? ' live-assign-status-ready' : ''}`}>
                  {t(statusKey)}
                </span>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
