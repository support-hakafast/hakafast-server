import React, { useCallback, useMemo, useState } from 'react';
import { saveDriverProfile } from '../utils/driverProfiles.js';
import { formatDriverName } from '../utils/teamDrivers.js';

/**
 * Tracks driver changes during endurance races in real-time.
 * Shows who's currently driving each kart, who's next, and logs all changes.
 * Provides print-friendly output for pinning in the pits.
 */
export default function DriverChangeTracker({
  t,
  trackSlug,
  heatType = 'endurance',
  onTrack = [],
  pitLines = [],
  driverQueue = [],
  teamTransponderMap = {},
  onDriverChange,
  onChangeLog = [],
  className = '',
}) {
  const isEndurance = heatType === 'endurance';
  const [expandedKart, setExpandedKart] = useState(null);
  const [filter, setFilter] = useState('all'); // all | active | pit

  // Build a consolidated view of each kart with its team info
  const kartAssignments = useMemo(() => {
    const map = new Map();

    // From on-track karts
    onTrack.forEach((kart) => {
      const num = kart.kart_number || kart.kartNumber;
      if (num == null) return;
      map.set(num, {
        kartNumber: num,
        driverName: kart.driver_name || kart.active_driver || '',
        transponderId: kart.transponder_id || '',
        teamName: kart.team_name || formatDriverName(kart.team_drivers?.[0]) || '',
        teamDrivers: Array.isArray(kart.team_drivers) ? kart.team_drivers : [],
        activeDriver: kart.active_driver || kart.driver_name || '',
        status: 'on_track',
        lapCount: kart.lap_count || 0,
        bestLap: kart.best_lap_time || '',
        changeCount: 0,
      });
    });

    // From pit lines
    pitLines.forEach((lane) => {
      (lane.karts || []).forEach((kart) => {
        const num = kart.kart_number || kart.kartNumber;
        if (num == null) return;
        if (!map.has(num)) {
          map.set(num, {
            kartNumber: num,
            driverName: kart.driver_name || kart.active_driver || '',
            transponderId: kart.transponder_id || '',
            teamName: kart.team_name || '',
            teamDrivers: Array.isArray(kart.team_drivers) ? kart.team_drivers : [],
            activeDriver: kart.active_driver || kart.driver_name || '',
            status: 'in_pits',
            lapCount: 0,
            bestLap: '',
            changeCount: 0,
          });
        } else {
          const existing = map.get(num);
          if (existing.status === 'on_track' && kart.status === 'in_pits') {
            existing.status = 'in_pits';
          }
        }
      });
    });

    // Calculate driver change count from the change log
    if (Array.isArray(onChangeLog)) {
      onChangeLog.forEach((entry) => {
        const num = entry.kartNumber || entry.kart_number;
        if (num != null && map.has(num)) {
          map.get(num).changeCount = (map.get(num).changeCount || 0) + 1;
        }
      });
    }

    return Array.from(map.values()).sort((a, b) => a.kartNumber - b.kartNumber);
  }, [onTrack, pitLines, onChangeLog]);

  const filteredAssignments = useMemo(() => {
    if (filter === 'all') return kartAssignments;
    if (filter === 'active') return kartAssignments.filter((k) => k.status === 'on_track');
    if (filter === 'pit') return kartAssignments.filter((k) => k.status === 'in_pits');
    return kartAssignments;
  }, [kartAssignments, filter]);

  const getTeamDrivers = (entry) => {
    if (entry.teamDrivers.length) return entry.teamDrivers;
    // Fall back to driver queue
    return driverQueue
      .filter((d) => {
        if (entry.teamName && d.team === entry.teamName) return true;
        return d.name === entry.activeDriver;
      })
      .map((d) => ({ name: d.name, weightKg: d.weightKg }));
  };

  const handleChangeDriver = (kartNumber, newDriver) => {
    if (!onDriverChange || !newDriver?.name?.trim()) return;
    onDriverChange(kartNumber, newDriver.name.trim());
    if (trackSlug) {
      saveDriverProfile(trackSlug, {
        name: newDriver.name.trim(),
        weightKg: newDriver.weightKg,
        kartNumber,
      });
    }
  };

  const handleQuickSwap = (kartNumber, driverName) => {
    if (!onDriverChange || !driverName) return;
    onDriverChange(kartNumber, driverName);
    if (trackSlug) {
      saveDriverProfile(trackSlug, { name: driverName, kartNumber });
    }
  };

  const getChangeLogForKart = (kartNumber) => {
    return (onChangeLog || [])
      .filter((entry) => (entry.kartNumber || entry.kart_number) === kartNumber)
      .slice(-10);
  };

  const handlePrintPitView = () => {
    const win = window.open('', '_blank');
    if (!win) return;
    const styles = Array.from(document.styleSheets)
      .map((sheet) => {
        try {
          return Array.from(sheet.cssRules || []).map((r) => r.cssText).join('');
        } catch { return ''; }
      })
      .join('');

    win.document.write(`<!DOCTYPE html>
<html lang="he" dir="rtl"><head><meta charset="UTF-8"><title>HAKAFAST Pit Assignments</title>
<style>body{font-family:system-ui,sans-serif;padding:20px;direction:rtl}
h1{font-size:18px;margin-bottom:10px}
table{border-collapse:collapse;width:100%;font-size:14px}
th,td{border:1px solid #333;padding:6px 8px;text-align:center}
th{background:#222;color:#fff}
tr:nth-child(even){background:#f5f5f5}
.kart-num{font-weight:bold;font-size:16px}
.starter{color:#090}
.change-count{font-size:12px;color:#666}
.active-driver{background:#e8f5e9}
.pit-driver{background:#fff3e0}
.footer{margin-top:15px;font-size:11px;color:#888}
</style></head><body>
<h1>🏎️ HAKAFAST — Pit Assignments</h1>
<table><thead><tr>
<th>Kart #</th><th>Status</th><th>Active Driver</th><th>Team</th><th>Changes</th>
</tr></thead><tbody>
${kartAssignments.map((k) => `
<tr class="${k.status === 'on_track' ? 'active-driver' : 'pit-driver'}">
<td class="kart-num">${k.kartNumber}</td>
<td>${k.status === 'on_track' ? '🏁 On Track' : '🔧 In Pits'}</td>
<td>${k.activeDriver || '—'}</td>
<td>${k.teamName || '—'}</td>
<td class="change-count">${k.changeCount}</td>
</tr>`).join('')}
</tbody></table>
<p class="footer">Generated ${new Date().toLocaleString('he-IL')} · HAKAFAST Live Timing</p>
</body></html>`);
    win.document.close();
    win.focus();
    win.print();
  };

  if (!isEndurance) return null;

  return (
    <div className={`driver-change-tracker ${className}`}>
      <div className="driver-change-tracker-head">
        <span className="field-label">
          {t('admin_driver_changes')} · {kartAssignments.length} {t('admin_karts_active')}
        </span>
        <div className="driver-change-tracker-actions">
          <div className="driver-change-filter">
            {['all', 'active', 'pit'].map((f) => (
              <button
                key={f}
                type="button"
                className={`btn-filter${filter === f ? ' active' : ''}`}
                onClick={() => setFilter(f)}
              >
                {t(`admin_driver_filter_${f}`)}
              </button>
            ))}
          </div>
          <button type="button" className="btn-muted" onClick={handlePrintPitView}>
            🖨️ {t('admin_print_pit_view')}
          </button>
        </div>
      </div>

      {filteredAssignments.length === 0 && (
        <p className="driver-change-empty">{t('admin_no_active_karts')}</p>
      )}

      <div className="driver-change-grid">
        {filteredAssignments.map((entry) => {
          const teamDrivers = getTeamDrivers(entry);
          const isExpanded = expandedKart === entry.kartNumber;
          const changeHistory = getChangeLogForKart(entry.kartNumber);

          return (
            <div
              key={entry.kartNumber}
              className={`driver-change-card${isExpanded ? ' is-expanded' : ''}`}
            >
              <div
                className="driver-change-card-head"
                onClick={() => setExpandedKart(isExpanded ? null : entry.kartNumber)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setExpandedKart(isExpanded ? null : entry.kartNumber);
                  }
                }}
              >
                <span className="driver-change-kart-num">#{entry.kartNumber}</span>
                <span className={`driver-change-status status-${entry.status}`}>
                  {t(entry.status === 'on_track' ? 'heat_on_track' : 'heat_in_pits')}
                </span>
                <span className="driver-change-current-driver">
                  {entry.activeDriver || '—'}
                </span>
                {entry.changeCount > 0 && (
                  <span className="driver-change-count-badge">{entry.changeCount}</span>
                )}
                <span className="driver-change-expand-icon">{isExpanded ? '▴' : '▾'}</span>
              </div>

              {isExpanded && (
                <div className="driver-change-card-body">
                  {teamDrivers.length > 0 && (
                    <div className="driver-change-team-drivers">
                      <span className="driver-change-section-label">{t('admin_team_drivers_section')}</span>
                      <div className="driver-change-quick-swap">
                        {teamDrivers.map((driver) => {
                          const name = formatDriverName(driver);
                          const isActive = name === entry.activeDriver;
                          return (
                            <button
                              key={name}
                              type="button"
                              className={`driver-change-swap-btn${isActive ? ' is-active' : ''}`}
                              onClick={() => handleQuickSwap(entry.kartNumber, name)}
                              disabled={isActive}
                              title={isActive ? t('admin_driver_already_active') : t('admin_swap_to_driver')}
                            >
                              <span className="driver-change-swap-name">{name}</span>
                              {driver.weightKg && (
                                <span className="driver-change-swap-weight">{driver.weightKg}kg</span>
                              )}
                              {isActive && <span className="driver-change-active-marker">✓</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {entry.changeCount > 0 && changeHistory.length > 0 && (
                    <div className="driver-change-history">
                      <span className="driver-change-section-label">
                        {t('admin_driver_change_history')} ({entry.changeCount})
                      </span>
                      <ul className="driver-change-history-list">
                        {changeHistory.map((change, idx) => (
                          <li key={idx} className="driver-change-history-item">
                            <span className="driver-change-history-time">
                              {new Date(change.timestamp || change.time).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <span className="driver-change-history-from">{change.fromDriver || '—'}</span>
                            <span className="driver-change-history-arrow">→</span>
                            <span className="driver-change-history-to">{change.toDriver || change.newDriver || '—'}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="driver-change-single-swap">
                    <span className="driver-change-section-label">{t('admin_change_driver_to')}</span>
                    <input
                      type="text"
                      placeholder={t('admin_driver_name_ph')}
                      className="driver-change-input"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && e.target.value.trim()) {
                          handleQuickSwap(entry.kartNumber, e.target.value.trim());
                          e.target.value = '';
                        }
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}