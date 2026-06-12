import React from 'react';
import {
  OPTIONAL_TIMING_COLUMNS,
  TIMING_COLUMN_GROUPS,
} from '../utils/liveTimingColumns.js';

export default function TimingColumnsPicker({
  t,
  timingColumns,
  onToggleColumn,
  compact = false,
  heatType = 'time',
}) {
  const isEndurance = heatType === 'endurance';

  return (
    <div className={`timing-columns-picker${compact ? ' timing-columns-picker-compact' : ''}`}>
      {!compact && (
        <>
          <span className="field-label">{t('admin_timing_columns')}</span>
          <p className="timing-columns-intro">{t('admin_timing_columns_hint')}</p>
        </>
      )}
      {TIMING_COLUMN_GROUPS.map((group) => {
        const cols = OPTIONAL_TIMING_COLUMNS.filter((col) => {
          if (col.group !== group.id || col.alwaysOn) return false;
          if (group.id === 'race' && !isEndurance && !timingColumns[col.id]) return false;
          return true;
        });
        if (!cols.length) return null;
        return (
          <div key={group.id} className={`timing-column-group timing-column-group-${group.id}`}>
            {!compact && (
              <div className="timing-group-head">
                <span className="timing-group-label">{t(group.labelKey)}</span>
              </div>
            )}
            <div className="timing-columns-chips">
              {cols.map((col) => (
                <button
                  key={col.id}
                  type="button"
                  className={`timing-chip timing-chip-${group.id}${timingColumns[col.id] ? ' active' : ''}`}
                  onClick={() => onToggleColumn(col.id)}
                >
                  {t(col.labelKey)}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
