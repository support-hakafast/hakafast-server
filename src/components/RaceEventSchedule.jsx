import React from 'react';

export default function RaceEventSchedule({ t, items, eventType, turnoverSec }) {
  if (!items?.length) return null;

  const isSprint = eventType === 'sprint';
  const durationMeta = !isSprint ? items.find((item) => item._durationMeta)?._durationMeta : null;

  return (
    <div className="race-event-schedule">
      <div className="race-event-schedule-header">
        <span className="field-label">{t('admin_pro_event_schedule')}</span>
        {durationMeta && (
          <span className="race-event-schedule-meta-badge">
            {durationMeta.duration}
            {durationMeta.stintMin > 0 && (
              <span className="race-event-schedule-meta-sep">·</span>
            )}
            {durationMeta.stintMin > 0 && t('admin_pro_event_stint_min_short', { min: durationMeta.stintMin })}
          </span>
        )}
      </div>
      <ol className="race-event-schedule-list">
        {items.map((item) => (
          <li key={`${item.order}-${item.title}`} className="race-event-schedule-item">
            <div className="race-event-schedule-order">{item.order}</div>
            <div className="race-event-schedule-body">
              <strong>{item.title}</strong>
              {Array.isArray(item.drivers) && (
                <span className="race-event-schedule-drivers">
                  {item.drivers.map((d, i) => (
                    <span key={`${item.title}-${i}`}>
                      {typeof d === 'string' ? d : (
                        <>
                          {d.name}
                          {d.starter ? ' ★' : ''}
                        </>
                      )}
                      {i < item.drivers.length - 1 ? ' · ' : ''}
                    </span>
                  ))}
                </span>
              )}
              {item.note?.turnoverSec != null && (
                <span className="race-event-schedule-note">
                  {t('admin_pro_event_schedule_turnover', { sec: item.note.turnoverSec })}
                </span>
              )}
            </div>
          </li>
        ))}
      </ol>
      {isSprint && items.length > 1 && turnoverSec > 0 && (
        <p className="pro-event-groups-hint">{t('admin_pro_event_schedule_sprint_hint', { sec: turnoverSec })}</p>
      )}
    </div>
  );
}
