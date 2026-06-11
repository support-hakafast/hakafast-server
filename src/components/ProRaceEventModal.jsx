import React, { useMemo, useState } from 'react';
import {
  parseRaceGroupsText,
  serializeGroupsText,
  summarizeRaceEvent,
} from '../utils/raceEventHelpers.js';

export default function ProRaceEventModal({
  onClose,
  t,
  initialType = 'endurance',
  prepOnly = false,
  draft,
  onApply,
  isSaving = false,
}) {
  const [eventType, setEventType] = useState(initialType === 'sprint' ? 'sprint' : 'endurance');
  const [eventName, setEventName] = useState(draft?.name || '');
  const [groupsText, setGroupsText] = useState(draft?.groupsText || '');
  const [enduranceHours, setEnduranceHours] = useState(String(draft?.enduranceHours ?? 1));
  const [enduranceMinutes, setEnduranceMinutes] = useState(String(draft?.enduranceMinutes ?? 0));
  const [stintMinutes, setStintMinutes] = useState(String(draft?.stintMinutes ?? 45));
  const [driverChangeSec, setDriverChangeSec] = useState(String(draft?.driverChangeSec ?? 90));
  const [targetLaps, setTargetLaps] = useState(String(draft?.targetLaps ?? 12));
  const [formationLaps, setFormationLaps] = useState(String(draft?.formationLaps ?? 0));
  const [startMode, setStartMode] = useState(draft?.startMode === 'le_mans' ? 'le_mans' : 'grid');
  const [turnoverSec, setTurnoverSec] = useState(String(draft?.turnoverSec ?? 120));
  const [enduranceRules, setEnduranceRules] = useState(draft?.enduranceRules || '');

  const parsed = useMemo(
    () => parseRaceGroupsText(groupsText, { mode: eventType }),
    [groupsText, eventType],
  );

  const preview = useMemo(() => summarizeRaceEvent({
    type: eventType,
    groups: parsed.groups,
    stintMinutes,
    driverChangeSec,
    turnoverSec,
  }), [eventType, parsed.groups, stintMinutes, driverChangeSec, turnoverSec]);

  const handleApply = () => {
    if (!parsed.groups.length) return;
    onApply({
      type: eventType,
      name: eventName.trim(),
      groupsText: serializeGroupsText(parsed.groups),
      groups: parsed.groups,
      enduranceHours: parseInt(enduranceHours, 10) || 0,
      enduranceMinutes: parseInt(enduranceMinutes, 10) || 0,
      stintMinutes: parseInt(stintMinutes, 10) || 45,
      driverChangeSec: parseInt(driverChangeSec, 10) || 90,
      targetLaps: parseInt(targetLaps, 10) || 12,
      formationLaps: parseInt(formationLaps, 10) || 0,
      startMode,
      turnoverSec: parseInt(turnoverSec, 10) || 120,
      enduranceRules,
      prepOnly,
      updatedAt: Date.now(),
    });
  };

  const isEndurance = eventType === 'endurance';
  const canApply = parsed.groups.length > 0 && !isSaving;

  return (
    <div className="admin-modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div
        className="admin-modal admin-modal-wide admin-modal-light pro-race-event-modal"
        data-tour="pro-event"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="admin-modal-header admin-modal-header-light">
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
          <label className="planner-field">
            <span>{t('admin_pro_event_name')}</span>
            <input
              type="text"
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
              placeholder={t('admin_pro_event_name_ph')}
            />
          </label>

          <label className="planner-field">
            <span>{isEndurance ? t('admin_pro_event_groups_endurance') : t('admin_pro_event_groups_sprint')}</span>
            <textarea
              className="pro-event-groups-text"
              rows={8}
              value={groupsText}
              onChange={(e) => setGroupsText(e.target.value)}
              placeholder={isEndurance ? t('admin_pro_event_groups_endurance_ph') : t('admin_pro_event_groups_sprint_ph')}
            />
          </label>
          <p className="pro-event-groups-hint">
            {isEndurance ? t('admin_pro_event_groups_endurance_hint') : t('admin_pro_event_groups_sprint_hint')}
          </p>

          {parsed.errors.length > 0 && (
            <p className="pro-event-parse-warning">{t('admin_pro_event_parse_warning')}</p>
          )}

          {preview && parsed.groups.length > 0 && (
            <div className="pro-event-preview">
              <span className="field-label">{t('admin_pro_event_preview')}</span>
              <ul className="pro-event-preview-list">
                {parsed.groups.map((g) => (
                  <li key={g.name}>
                    <strong>{g.name}</strong>
                    <span>{g.drivers.join(' · ')}</span>
                  </li>
                ))}
              </ul>
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

          {isEndurance ? (
            <div className="pro-event-settings-grid">
              <div className="endurance-row">
                <label className="endurance-field">
                  <span className="endurance-field-label">{t('admin_hours_placeholder')}</span>
                  <input type="number" min="0" value={enduranceHours} onChange={(e) => setEnduranceHours(e.target.value)} />
                </label>
                <label className="endurance-field">
                  <span className="endurance-field-label">{t('admin_minutes_placeholder')}</span>
                  <input type="number" min="0" max="59" value={enduranceMinutes} onChange={(e) => setEnduranceMinutes(e.target.value)} />
                </label>
              </div>
              <label className="planner-field">
                <span>{t('admin_pro_event_stint_min')}</span>
                <input type="number" min="1" value={stintMinutes} onChange={(e) => setStintMinutes(e.target.value)} />
              </label>
              <label className="planner-field">
                <span>{t('admin_pro_event_driver_change_sec')}</span>
                <input type="number" min="15" value={driverChangeSec} onChange={(e) => setDriverChangeSec(e.target.value)} />
              </label>
              <label className="planner-field">
                <span>{t('admin_formation_laps')}</span>
                <input type="number" min="0" max="5" value={formationLaps} onChange={(e) => setFormationLaps(e.target.value)} />
              </label>
              <label className="planner-field">
                <span>{t('admin_start_mode')}</span>
                <select value={startMode} onChange={(e) => setStartMode(e.target.value)}>
                  <option value="grid">{t('admin_start_grid')}</option>
                  <option value="le_mans">{t('admin_start_le_mans')}</option>
                </select>
              </label>
              <label className="planner-field">
                <span>{t('admin_endurance_rules')}</span>
                <textarea rows={3} value={enduranceRules} onChange={(e) => setEnduranceRules(e.target.value)} />
              </label>
            </div>
          ) : (
            <div className="pro-event-settings-grid">
              <label className="planner-field">
                <span>{t('admin_laps_placeholder')}</span>
                <input type="number" min="1" value={targetLaps} onChange={(e) => setTargetLaps(e.target.value)} />
              </label>
              <label className="planner-field">
                <span>{t('admin_formation_laps')}</span>
                <input type="number" min="0" max="5" value={formationLaps} onChange={(e) => setFormationLaps(e.target.value)} />
              </label>
              <label className="planner-field">
                <span>{t('admin_pro_event_turnover_sec')}</span>
                <input type="number" min="0" value={turnoverSec} onChange={(e) => setTurnoverSec(e.target.value)} />
              </label>
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
