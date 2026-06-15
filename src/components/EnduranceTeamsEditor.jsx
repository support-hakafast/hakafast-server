import React, { useCallback, useRef, useState } from 'react';
import {
  createEmptyTeamRecord,
  groupsToTeamRecords,
  parseRaceGroupsCsv,
  parseTeamDriversLine,
  raceGroupsCsvTemplate,
  serializeTeamDriversLine,
  teamRecordsToGroups,
} from '../utils/raceEventHelpers.js';
import { COUNTRIES, countryFlag } from '../data/countries.js';
import { getTransponderSystem, normalizeTransponderId } from '../data/transponderSystems.js';

const MAX_TEAMS = 80;

export default function EnduranceTeamsEditor({
  t,
  groups,
  onChange,
  eventType = 'endurance',
  groupsLabelKey = 'admin_pro_event_groups_endurance',
  onImportError,
  timingSystem = 'mylaps_tranx',
}) {
  const fileRef = useRef(null);
  const teams = groupsToTeamRecords(groups, { preserveRaw: true });
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [driversLineDraft, setDriversLineDraft] = useState({});
  const nameLabelKey = eventType === 'sprint' ? 'admin_sprint_heat_name_ph' : 'admin_endurance_team_name_ph';
  const isEndurance = eventType === 'endurance';
  const atLimit = teams.length >= MAX_TEAMS;
  const transponderSys = getTransponderSystem(timingSystem);

  const isTeamReady = useCallback((team) => {
    if (!team?.name?.trim()) return false;
    if (!Array.isArray(team.members) || !team.members.length) return false;
    const named = team.members.filter((m) => m?.name?.trim());
    if (!named.length) return false;
    if (isEndurance) {
      return named.length > 0;
    }
    return true;
  }, [isEndurance]);

  const toggleCollapse = (teamIndex) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(teamIndex)) next.delete(teamIndex);
      else next.add(teamIndex);
      return next;
    });
  };

  const updateTeams = (nextTeams) => {
    onChange(teamRecordsToGroups(nextTeams, { preserveEmpty: true, preserveRaw: true }));
  };

  const updateTeam = (teamIndex, patch) => {
    updateTeams(teams.map((team, i) => (i === teamIndex ? { ...team, ...patch } : team)));
  };

  const updateDriversLine = (teamIndex, line) => {
    setDriversLineDraft((prev) => ({ ...prev, [teamIndex]: line }));
    updateTeam(teamIndex, { members: parseTeamDriversLine(line) });
  };

  const getDriversLineValue = (teamIndex, team) => {
    if (driversLineDraft[teamIndex] !== undefined) return driversLineDraft[teamIndex];
    return serializeTeamDriversLine(team.members);
  };

  const updateMember = (teamIndex, memberIndex, patch) => {
    const team = teams[teamIndex];
    const members = team.members.map((m, i) => (i === memberIndex ? { ...m, ...patch } : m));
    updateTeam(teamIndex, { members });
  };

  const setStarter = (teamIndex, memberIndex) => {
    const members = teams[teamIndex].members.map((m, i) => ({ ...m, starter: i === memberIndex }));
    updateTeam(teamIndex, { members });
  };

  const addMember = (teamIndex) => {
    const team = teams[teamIndex];
    updateTeam(teamIndex, {
      members: [...team.members, {
        name: '',
        weightKg: '',
        starter: team.members.length === 0,
        nationality: '',
        transponderId: '',
      }],
    });
  };

  const removeMember = (teamIndex, memberIndex) => {
    const team = teams[teamIndex];
    if (team.members.length <= 1) return;
    const members = team.members.filter((_, i) => i !== memberIndex);
    if (!members.some((m) => m.starter)) members[0].starter = true;
    updateTeam(teamIndex, { members });
  };

  const addTeam = () => {
    if (atLimit) return;
    updateTeams([...teams, createEmptyTeamRecord(teams.length + 1)]);
  };

  const removeTeam = (teamIndex) => {
    if (teams.length <= 1) return;
    updateTeams(teams.filter((_, i) => i !== teamIndex));
  };

  const expandAll = () => setCollapsed(new Set());
  const collapseAllReady = () => {
    const next = new Set();
    teams.forEach((team, idx) => { if (isTeamReady(team)) next.add(idx); });
    setCollapsed(next);
  };

  const applyImportedGroups = (imported) => {
    if (!imported.length) {
      onImportError?.(t('admin_pro_event_csv_empty'));
      return;
    }
    updateTeams(groupsToTeamRecords(imported.slice(0, MAX_TEAMS), { preserveRaw: true }));
    setDriversLineDraft({});
  };

  const handleCsvFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const { groups: imported, errors } = parseRaceGroupsCsv(String(reader.result || ''), { mode: eventType });
      if (errors.length && !imported.length) {
        onImportError?.(t('admin_pro_event_csv_error'));
        return;
      }
      applyImportedGroups(imported);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const downloadTemplate = () => {
    const blob = new Blob([raceGroupsCsvTemplate(eventType)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = eventType === 'sprint' ? 'sprint-heats-template.csv' : 'endurance-teams-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const getTeamSummary = (team) => {
    const named = team.members.filter((m) => m?.name?.trim());
    const starter = team.members.find((m) => m.starter && m?.name?.trim());
    const driversLine = serializeTeamDriversLine(team.members);
    return {
      driverCount: named.length,
      starterName: starter?.name || named[0]?.name || '—',
      driversLine,
      flag: countryFlag(team.nationality),
    };
  };

  const handleTransponderChange = (teamIndex, memberIndex, raw) => {
    updateMember(teamIndex, memberIndex, {
      transponderId: normalizeTransponderId(raw, timingSystem),
    });
  };

  const handleTeamTransponderChange = (teamIndex, raw) => {
    updateTeam(teamIndex, {
      transponderId: normalizeTransponderId(raw, timingSystem),
    });
  };

  return (
    <div className="endurance-teams-editor endurance-teams-editor-v2">
      <div className="ete-toolbar">
        <div className="ete-toolbar-title">
          <span className="field-label">{t(groupsLabelKey)}</span>
          <span className="ete-team-count">
            {t('admin_endurance_team_count', { count: teams.length, max: MAX_TEAMS })}
          </span>
        </div>
        <div className="ete-toolbar-actions">
          <button type="button" className="ete-tool-btn" onClick={() => fileRef.current?.click()}>
            {t('admin_pro_event_csv_import')}
          </button>
          <button type="button" className="ete-tool-btn" onClick={downloadTemplate}>
            {t('admin_pro_event_csv_template')}
          </button>
          <button type="button" className="ete-tool-btn" onClick={expandAll}>
            {t('admin_endurance_expand_all')}
          </button>
          <button type="button" className="ete-tool-btn" onClick={collapseAllReady}>
            {t('admin_endurance_collapse_ready')}
          </button>
          <button type="button" className="ete-tool-btn ete-tool-btn-primary" onClick={addTeam} disabled={atLimit}>
            + {t('admin_endurance_add_team')}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="endurance-csv-input"
            onChange={handleCsvFile}
          />
        </div>
      </div>

      <p className="ete-hint">{t('admin_endurance_teams_editor_hint')}</p>
      {atLimit && (
        <p className="pro-event-import-msg" role="status">{t('admin_endurance_team_limit')}</p>
      )}

      <ul className="ete-teams-list">
        {teams.map((team, teamIndex) => {
          const isCollapsed = collapsed.has(teamIndex);
          const ready = isTeamReady(team);
          const summary = getTeamSummary(team);

          return (
            <li
              key={`team-${teamIndex}`}
              className={`ete-team-card${isCollapsed ? ' is-collapsed' : ''}${ready ? ' is-ready' : ''}`}
            >
              <div className="ete-team-header">
                <span className="ete-team-badge" aria-hidden>{teamIndex + 1}</span>

                {isCollapsed ? (
                  <button
                    type="button"
                    className="ete-team-summary-btn"
                    onClick={() => toggleCollapse(teamIndex)}
                  >
                    <strong className="ete-summary-name">
                      {summary.flag && <span className="ete-summary-flag" aria-hidden>{summary.flag}</span>}
                      {team.name || t('admin_endurance_team_unnamed')}
                    </strong>
                    <span className="ete-summary-meta">
                      {isEndurance && summary.driversLine
                        ? summary.driversLine
                        : t('admin_endurance_drivers_short', { count: summary.driverCount })}
                      {isEndurance && ` · ${t('admin_endurance_starter_short')}: ${summary.starterName}`}
                      {ready && <span className="ete-ready-dot" aria-label="ready">✓</span>}
                    </span>
                  </button>
                ) : (
                  <div className="ete-team-fields">
                    <label className="ete-field ete-field-grow">
                      <span className="ete-field-label">{t(nameLabelKey)}</span>
                      <input
                        type="text"
                        className="ete-text-input"
                        dir="auto"
                        value={team.name}
                        onChange={(e) => updateTeam(teamIndex, { name: e.target.value })}
                        placeholder={t(nameLabelKey)}
                        aria-label={t(nameLabelKey)}
                        autoComplete="off"
                        spellCheck
                      />
                    </label>
                    <label className="ete-field ete-field-nation">
                      <span className="ete-field-label">{t('admin_endurance_team_nationality')}</span>
                      <select
                        className="ete-select"
                        value={team.nationality || ''}
                        onChange={(e) => updateTeam(teamIndex, { nationality: e.target.value })}
                        aria-label={t('admin_endurance_team_nationality')}
                      >
                        <option value="">{t('admin_endurance_nationality_none')}</option>
                        {COUNTRIES.map((c) => (
                          <option key={c.code} value={c.code}>
                            {countryFlag(c.code)} {c.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    {timingSystem !== 'manual' && (
                      <label className="ete-field ete-field-transponder">
                        <span className="ete-field-label">{t('admin_endurance_team_transponder')}</span>
                        <input
                          type="text"
                          className="ete-text-input ete-transponder-input"
                          dir="ltr"
                          value={team.transponderId || ''}
                          onChange={(e) => handleTeamTransponderChange(teamIndex, e.target.value)}
                          placeholder={transponderSys.idExample}
                          title={t('admin_endurance_transponder_format', { format: transponderSys.idFormat })}
                          autoComplete="off"
                        />
                      </label>
                    )}
                  </div>
                )}

                <div className="ete-team-actions">
                  <button
                    type="button"
                    className="ete-icon-btn"
                    onClick={() => toggleCollapse(teamIndex)}
                    aria-label={isCollapsed ? t('admin_endurance_expand') : t('admin_endurance_collapse')}
                    title={isCollapsed ? t('admin_endurance_expand') : t('admin_endurance_collapse')}
                  >
                    {isCollapsed ? '▾' : '▴'}
                  </button>
                  <button
                    type="button"
                    className="ete-icon-btn ete-icon-btn-danger"
                    onClick={() => removeTeam(teamIndex)}
                    disabled={teams.length <= 1}
                    aria-label={t('admin_endurance_remove_team')}
                  >
                    ×
                  </button>
                </div>
              </div>

              {!isCollapsed && (
                <div className="ete-members-panel">
                  {isEndurance ? (
                    <label className="ete-field ete-drivers-line-field">
                      <span className="ete-field-label">{t('admin_endurance_drivers_line')}</span>
                      <input
                        type="text"
                        className="ete-text-input ete-drivers-line-input"
                        dir="auto"
                        value={getDriversLineValue(teamIndex, team)}
                        onChange={(e) => updateDriversLine(teamIndex, e.target.value)}
                        placeholder={t('admin_endurance_drivers_line_ph')}
                        autoComplete="off"
                        spellCheck
                      />
                      <span className="ete-drivers-line-hint">{t('admin_endurance_teams_simple_hint')}</span>
                    </label>
                  ) : (
                    <>
                      <div className="ete-members-grid ete-members-head ete-sprint" aria-hidden>
                        <span>{t('admin_endurance_member_name')}</span>
                        <span>{t('admin_endurance_nationality_short')}</span>
                        {timingSystem !== 'manual' && <span>{t('admin_endurance_transponder_short')}</span>}
                        <span />
                      </div>
                      <ul className="ete-members-list">
                        {team.members.map((member, memberIndex) => (
                          <li
                            key={`m-${teamIndex}-${memberIndex}`}
                            className="ete-members-grid ete-member-row ete-sprint"
                          >
                            <input
                              type="text"
                              className="ete-text-input"
                              dir="auto"
                              value={member.name}
                              onChange={(e) => updateMember(teamIndex, memberIndex, { name: e.target.value })}
                              placeholder={t('admin_driver_placeholder')}
                              autoComplete="off"
                              spellCheck
                            />
                            <select
                              className="ete-select"
                              value={member.nationality || ''}
                              onChange={(e) => updateMember(teamIndex, memberIndex, { nationality: e.target.value })}
                              title={t('admin_endurance_member_nationality')}
                              aria-label={t('admin_endurance_member_nationality')}
                            >
                              <option value="">
                                {team.nationality
                                  ? `${countryFlag(team.nationality)} ${t('admin_endurance_team_nationality')}`
                                  : t('admin_endurance_nationality_none')}
                              </option>
                              {COUNTRIES.map((c) => (
                                <option key={c.code} value={c.code}>
                                  {countryFlag(c.code)} {c.name}
                                </option>
                              ))}
                            </select>
                            {timingSystem !== 'manual' && (
                              <input
                                type="text"
                                className="ete-text-input ete-transponder-input"
                                dir="ltr"
                                value={member.transponderId || ''}
                                onChange={(e) => handleTransponderChange(teamIndex, memberIndex, e.target.value)}
                                placeholder={transponderSys.idExample}
                                title={t('admin_endurance_transponder_format', { format: transponderSys.idFormat })}
                                autoComplete="off"
                              />
                            )}
                            <button
                              type="button"
                              className="ete-icon-btn ete-icon-btn-danger"
                              onClick={() => removeMember(teamIndex, memberIndex)}
                              disabled={team.members.length <= 1}
                              aria-label={t('admin_endurance_remove_member')}
                            >
                              ×
                            </button>
                          </li>
                        ))}
                      </ul>
                      <button type="button" className="ete-add-member" onClick={() => addMember(teamIndex)}>
                        + {t('admin_endurance_add_member')}
                      </button>
                    </>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
