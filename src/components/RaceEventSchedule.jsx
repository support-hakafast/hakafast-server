import React from 'react';

export default function RaceEventSchedule({ t, items, eventType, turnoverSec }) {
  if (!items?.length) return null;

  const isSprint = eventType === 'sprint';

  return (
    <div className="race-event-schedule">
      <span className="field-label">{t('admin_pro_event_schedule')}</span>
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
              {item.note?.duration && (
                <span className="race-event-schedule-note">
                  {t('admin_pro_event_schedule_endurance_meta', {
                    duration: item.note.duration,
                    stint: item.note.stintMin,
                  })}
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
