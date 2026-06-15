import React, { useEffect, useMemo, useState } from 'react';
import EnduranceTeamsEditor from './EnduranceTeamsEditor.jsx';
import RaceEventSchedule from './RaceEventSchedule.jsx';
import {
  buildRaceSchedulePreview,
  groupsToTeamRecords,
  parseRaceGroupsText,
  sanitizeRaceGroupsForApply,
  serializeGroupsText,
  summarizeRaceEvent,
  teamRecordsToGroups,
} from '../utils/raceEventHelpers.js';
import { COUNTRIES, countryFlag } from '../data/countries.js';
import { TRANSPONDER_SYSTEMS, getTransponderSystem, isNativeTransponderSystem } from '../data/transponderSystems.js';
import { apiFetch } from '../utils/apiClient.js';

export default function ProRaceEventModal({
  onClose,
  t,
  initialType = 'endurance',
  prepOnly = false,
  draft,
  onApply,
  isSaving = false,
  darkMode = false,
  trackSlug = '',
}) {
  const [eventType, setEventType] = useState(initialType === 'sprint' ? 'sprint' : 'endurance');
  const [eventName, setEventName] = useState(draft?.name || '');
  const [groups, setGroups] = useState(() => (
    draft?.groups?.length ? draft.groups : [{ name: '', drivers: [{ name: '', starter: true }] }]
  ));
  const [groupsText, setGroupsText] = useState(draft?.groupsText || '');
  const [importMessage, setImportMessage] = useState('');
  const [enduranceHours, setEnduranceHours] = useState(String(draft?.enduranceHours ?? 1));
  const [enduranceMinutes, setEnduranceMinutes] = useState(String(draft?.enduranceMinutes ?? 0));
  const [stintMinutes, setStintMinutes] = useState(String(draft?.stintMinutes ?? 45));
  const [driverChangeSec, setDriverChangeSec] = useState(String(draft?.driverChangeSec ?? 90));
  const [targetLaps, setTargetLaps] = useState(String(draft?.targetLaps ?? 12));
  const [formationLaps, setFormationLaps] = useState(String(draft?.formationLaps ?? 0));
  const [startMode, setStartMode] = useState(draft?.startMode === 'le_mans' ? 'le_mans' : 'grid');
  const [turnoverSec, setTurnoverSec] = useState(String(draft?.turnoverSec ?? 120));
  const [enduranceRules, setEnduranceRules] = useState(draft?.enduranceRules || '');
  const [advanceCount, setAdvanceCount] = useState(String(draft?.advanceCount ?? 2));
  const [defaultNationality, setDefaultNationality] = useState(draft?.defaultNationality || '');
  const [timingSystem, setTimingSystem] = useState(draft?.timingSystem || 'mylaps_tranx');
  const [decoderStatus, setDecoderStatus] = useState(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch('/api/decoder/status', {}, trackSlug)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (!cancelled) setDecoderStatus(data); })
      .catch(() => { if (!cancelled) setDecoderStatus({ enabled: false }); });
    return () => { cancelled = true; };
  }, [trackSlug]);

  const transponderSys = getTransponderSystem(timingSystem);

  const normalizedGroups = useMemo(
    () => sanitizeRaceGroupsForApply(groups),
    [groups],
  );
  const sprintParsed = useMemo(
    () => parseRaceGroupsText(groupsText, { mode: 'sprint' }),
    [groupsText],
  );

  const headerThemeClass = darkMode ? 'admin-modal-header-dark' : 'admin-modal-header-light';
  const modalThemeClass = darkMode ? 'admin-modal-dark' : 'admin-modal-light';

  const preview = useMemo(() => summarizeRaceEvent({
    type: eventType,
    groups: normalizedGroups,
    stintMinutes,
    driverChangeSec,
    turnoverSec,
  }), [eventType, normalizedGroups, stintMinutes, driverChangeSec, turnoverSec]);

  const scheduleItems = useMemo(() => buildRaceSchedulePreview({
    type: eventType,
    name: eventName,
    groups: normalizedGroups,
    enduranceHours,
    enduranceMinutes,
    stintMinutes,
    turnoverSec,
  }), [eventType, eventName, normalizedGroups, enduranceHours, enduranceMinutes, stintMinutes, turnoverSec]);

  const importBulkText = () => {
    const parsed = parseRaceGroupsText(groupsText, { mode: eventType });
    if (parsed.groups.length) {
      setGroups(parsed.groups);
      setImportMessage('');
    } else {
      setImportMessage(t('admin_pro_event_parse_warning'));
    }
  };

  const handleGroupsChange = (nextGroups) => {
    setGroups(nextGroups);
    setGroupsText(serializeGroupsText(teamRecordsToGroups(nextGroups, { preserveEmpty: true, preserveRaw: true })));
    setImportMessage('');
  };

  const applyDefaultNationalityToAll = () => {
    if (!defaultNationality) return;
    const nextTeams = groupsToTeamRecords(groups, { preserveRaw: true }).map((team) => ({
      ...team,
      nationality: defaultNationality,
      members: team.members.map((m) => ({ ...m, nationality: defaultNationality })),
    }));
    handleGroupsChange(nextTeams);
  };

  const handleApply = () => {
    if (!normalizedGroups.length) return;
    onApply({
      type: eventType,
      name: eventName.trim(),
      groupsText: serializeGroupsText(normalizedGroups),
      groups: normalizedGroups,
      enduranceHours: parseInt(enduranceHours, 10) || 0,
      enduranceMinutes: parseInt(enduranceMinutes, 10) || 0,
      stintMinutes: parseInt(stintMinutes, 10) || 0,
      driverChangeSec: parseInt(driverChangeSec, 10) || 0,
      targetLaps: parseInt(targetLaps, 10) || 12,
      formationLaps: parseInt(formationLaps, 10) || 0,
      startMode,
      turnoverSec: parseInt(turnoverSec, 10) || 120,
      enduranceRules,
      advanceCount: parseInt(advanceCount, 10) || 2,
      defaultNationality,
      timingSystem,
      prepOnly,
      updatedAt: Date.now(),
    });
  };

  const isEndurance = eventType === 'endurance';
  const canApply = normalizedGroups.length > 0 && !isSaving;

  return (
    <div className="admin-modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div
        className={`admin-modal admin-modal-wide ${modalThemeClass} pro-race-event-modal`}
        data-tour="pro-event"
        onClick={(e) => e.stopPropagation()}
      >
        <header className={`admin-modal-header ${headerThemeClass}`}>
          <div>
            <h2>
              {isEndurance ? t('admin_pro_event_endurance_title') : t('admin_pro_event_sprint_title')}
            </h2>
            <p className="admin-modal-subtitle">
              {prepOnly ? t('admin_pro_event_prep_subtitle') : t('admin_pro_event_subtitle')}
            </p>
          </div>
          <button type="button" className="admin-modal-close" onClick={onClose} aria-label={t('modal_cancel')}>×</button>
        </header>

        {prepOnly && (
          <div className="pro-event-prep-banner">
            {t('admin_pro_event_day_prep_banner')}
          </div>
        )}

        <div className="pro-event-type-tabs">
          <button
            type="button"
            className={`pro-event-type-tab${isEndurance ? ' active' : ''}`}
            onClick={() => setEventType('endurance')}
          >
            {t('heat_endurance')}
          </button>
          <button
            type="button"
            className={`pro-event-type-tab${!isEndurance ? ' active' : ''}`}
            onClick={() => setEventType('sprint')}
          >
            {t('heat_sprint')}
          </button>
        </div>

        <div className="pro-race-event-panel">
          <label className="planner-field planner-field-compact">
            <span>{t('admin_pro_event_name')}</span>
            <input
              type="text"
              dir="auto"
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
              placeholder={t('admin_pro_event_name_ph')}
            />
          </label>

          <div className="pro-event-nationality-row">
            <label className="planner-field planner-field-compact">
              <span>{t('admin_pro_event_default_nationality')}</span>
              <select value={defaultNationality} onChange={(e) => setDefaultNationality(e.target.value)}>
                <option value="">{t('admin_endurance_nationality_none')}</option>
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {countryFlag(c.code)} {c.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="btn-muted pro-event-apply-nationality"
              onClick={applyDefaultNationalityToAll}
              disabled={!defaultNationality}
              title={t('admin_pro_event_apply_nationality_hint')}
            >
              {t('admin_pro_event_apply_nationality')}
            </button>
          </div>

          <div className="pro-event-timing-system">
            <label className="planner-field planner-field-compact">
              <span>{t('admin_pro_event_timing_system')}</span>
              <select value={timingSystem} onChange={(e) => setTimingSystem(e.target.value)}>
                {TRANSPONDER_SYSTEMS.map((sys) => (
                  <option key={sys.id} value={sys.id}>{sys.name}</option>
                ))}
              </select>
            </label>
            <div className="pro-event-timing-meta">
              <span className={`pro-event-decoder-badge${decoderStatus?.connected ? ' is-live' : ''}`}>
                {isNativeTransponderSystem(timingSystem)
                  ? (decoderStatus?.connected
                    ? t('admin_pro_event_decoder_connected')
                    : t('admin_pro_event_decoder_idle'))
                  : t('admin_pro_event_decoder_external')}
              </span>
              <p className="pro-event-groups-hint">
                {t('admin_pro_event_timing_system_hint', {
                  format: transponderSys.idFormat,
                  vendor: transponderSys.vendor || '—',
                })}
              </p>
            </div>
          </div>

          <EnduranceTeamsEditor
            t={t}
            groups={groups}
            eventType={eventType}
            trackSlug={trackSlug}
            timingSystem={timingSystem}
            groupsLabelKey={isEndurance ? 'admin_pro_event_groups_endurance' : 'admin_pro_event_groups_sprint'}
            onChange={handleGroupsChange}
            onImportError={(msg) => setImportMessage(msg)}
          />

          {importMessage && (
            <p className="pro-event-import-msg" role="status">{importMessage}</p>
          )}

          <details className="endurance-bulk-import">
            <summary>{t('admin_endurance_bulk_import')}</summary>
            <textarea
              className="pro-event-groups-text"
              dir="auto"
              rows={4}
              value={groupsText}
              onChange={(e) => setGroupsText(e.target.value)}
              placeholder={isEndurance ? t('admin_pro_event_groups_endurance_ph') : t('admin_pro_event_groups_sprint_ph')}
            />
            <p className="pro-event-groups-hint">
              {isEndurance ? t('admin_pro_event_groups_endurance_hint') : t('admin_pro_event_groups_sprint_hint')}
            </p>
            <button type="button" className="btn-muted endurance-bulk-apply" onClick={importBulkText}>
              {t('admin_endurance_bulk_apply')}
            </button>
          </details>

          {!isEndurance && sprintParsed.errors.length > 0 && groupsText.trim() && (
            <p className="pro-event-parse-warning">{t('admin_pro_event_parse_warning')}</p>
          )}

          {preview && normalizedGroups.length > 0 && (
            <div className="pro-event-preview">
              <span className="field-label">{t('admin_pro_event_preview')}</span>
              <p className="pro-event-preview-stats">
                {isEndurance
                  ? t('admin_pro_event_preview_endurance', {
                    teams: preview.teamCount,
                    drivers: preview.driverCount,
                    stint: preview.stintMinutes,
                    change: preview.driverChangeSec,
                  })
                  : t('admin_pro_event_preview_sprint', {
                    heats: preview.sessionCount,
                    drivers: preview.driverCount,
                    turnover: preview.turnoverSec,
                  })}
              </p>
            </div>
          )}

          <RaceEventSchedule
            t={t}
            items={scheduleItems}
            eventType={eventType}
            turnoverSec={parseInt(turnoverSec, 10) || 0}
          />

          {isEndurance ? (
            <>
              <div className="pro-event-section pro-event-timing-section">
                <span className="field-label">{t('admin_pro_event_timing_title')}</span>
                <div className="pro-event-settings-grid pro-event-settings-compact">
                  <div className="pro-event-settings-row">
                    <label className="endurance-field">
                      <span className="endurance-field-label">{t('admin_hours_placeholder')}</span>
                      <input type="number" min="0" value={enduranceHours} onChange={(e) => setEnduranceHours(e.target.value)} />
                    </label>
                    <label className="endurance-field">
                      <span className="endurance-field-label">{t('admin_minutes_placeholder')}</span>
                      <input type="number" min="0" max="59" value={enduranceMinutes} onChange={(e) => setEnduranceMinutes(e.target.value)} />
                    </label>
                    <label className="endurance-field">
                      <span className="endurance-field-label">{t('admin_pro_event_stint_min')}</span>
                      <input type="number" min="0" value={stintMinutes} onChange={(e) => setStintMinutes(e.target.value)} />
                    </label>
                    <label className="endurance-field">
                      <span className="endurance-field-label">{t('admin_pro_event_driver_change_sec')}</span>
                      <input type="number" min="0" value={driverChangeSec} onChange={(e) => setDriverChangeSec(e.target.value)} />
                    </label>
                  </div>
                  <div className="pro-event-settings-row">
                    <label className="endurance-field">
                      <span className="endurance-field-label">{t('admin_formation_laps')}</span>
                      <input type="number" min="0" max="5" value={formationLaps} onChange={(e) => setFormationLaps(e.target.value)} />
                    </label>
                    <label className="endurance-field endurance-field-grow">
                      <span className="endurance-field-label">{t('admin_start_mode')}</span>
                      <select value={startMode} onChange={(e) => setStartMode(e.target.value)}>
                        <option value="grid">{t('admin_start_grid')}</option>
                        <option value="le_mans">{t('admin_start_le_mans')}</option>
                      </select>
                    </label>
                  </div>
                </div>
              </div>

              <div className="pro-event-section pro-event-rules-section">
                <label className="planner-field planner-field-compact">
                  <span>{t('admin_endurance_rules')}</span>
                  <textarea rows={2} value={enduranceRules} onChange={(e) => setEnduranceRules(e.target.value)} />
                </label>
              </div>
            </>
          ) : (
            <div className="pro-event-settings-grid pro-event-settings-compact">
              <div className="pro-event-settings-row">
                <label className="endurance-field">
                  <span className="endurance-field-label">{t('admin_laps_placeholder')}</span>
                  <input type="number" min="1" value={targetLaps} onChange={(e) => setTargetLaps(e.target.value)} />
                </label>
                <label className="endurance-field">
                  <span className="endurance-field-label">{t('admin_formation_laps')}</span>
                  <input type="number" min="0" max="5" value={formationLaps} onChange={(e) => setFormationLaps(e.target.value)} />
                </label>
                <label className="endurance-field">
                  <span className="endurance-field-label">{t('admin_pro_event_turnover_sec')}</span>
                  <input type="number" min="0" value={turnoverSec} onChange={(e) => setTurnoverSec(e.target.value)} />
                </label>
                <label className="endurance-field">
                  <span className="endurance-field-label">{t('admin_pro_event_advance_count')}</span>
                  <input type="number" min="1" value={advanceCount} onChange={(e) => setAdvanceCount(e.target.value)} />
                </label>
              </div>
              {normalizedGroups.length > 1 && (
                <p className="pro-event-groups-hint">{t('admin_pro_event_advance_count_hint')}</p>
              )}
            </div>
          )}
        </div>

        <footer className="admin-modal-footer track-planner-footer">
          <button type="button" className="btn-muted" onClick={onClose}>
            {t('modal_cancel')}
          </button>
          <button
            type="button"
            className="btn-preview track-planner-apply"
            onClick={handleApply}
            disabled={!canApply}
          >
            {isSaving
              ? t('admin_track_planner_saving')
              : prepOnly
                ? t('admin_pro_event_save_draft')
                : t('admin_pro_event_apply')}
          </button>
        </footer>
      </div>
    </div>
  );
}
