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
  const [driversLineDraft, setDriversLineDraft] = useState({});
  const [transponderOpen, setTransponderOpen] = useState({});
  const [overflowOpen, setOverflowOpen] = useState(false);
  const nameLabelKey = eventType === 'sprint' ? 'admin_sprint_heat_name_ph' : 'admin_endurance_team_name_ph';
  const isEndurance = eventType === 'endurance';
  const atLimit = teams.length >= MAX_TEAMS;
  const transponderSys = getTransponderSystem(timingSystem);
  const hasTransponder = timingSystem !== 'manual';

  const isTeamReady = useCallback((team) => {
    if (!team?.name?.trim()) return false;
    const named = (team.members || []).filter((m) => m?.name?.trim());
    return named.length > 0;
  }, []);

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

  const setStarter = (teamIndex, memberIndex) => {
    const members = teams[teamIndex].members.map((m, i) => ({ ...m, starter: i === memberIndex }));
    // Update the drivers line draft to reflect the new starter
    const newLine = serializeTeamDriversLine(members);
    setDriversLineDraft((prev) => ({ ...prev, [teamIndex]: newLine }));
    updateTeam(teamIndex, { members });
  };

  const updateMember = (teamIndex, memberIndex, patch) => {
    const team = teams[teamIndex];
    const members = team.members.map((m, i) => (i === memberIndex ? { ...m, ...patch } : m));
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

  const toggleTransponder = (teamIndex) => {
    setTransponderOpen((prev) => ({ ...prev, [teamIndex]: !prev[teamIndex] }));
  };

  const handleTeamTransponderChange = (teamIndex, raw) => {
    updateTeam(teamIndex, {
      transponderId: normalizeTransponderId(raw, timingSystem),
    });
  };

  const handleTransponderChange = (teamIndex, memberIndex, raw) => {
    updateMember(teamIndex, memberIndex, {
      transponderId: normalizeTransponderId(raw, timingSystem),
    });
  };

  return (
    <div className="ete2">
      {/* ── Toolbar ── */}
      <div className="ete2-toolbar">
        <div className="ete2-title">
          <span className="ete2-label">{t(groupsLabelKey)}</span>
          <span className="ete2-count">{teams.length}/{MAX_TEAMS}</span>
        </div>
        <div className="ete2-actions">
          <button
            type="button"
            className="ete2-btn ete2-btn-primary"
            onClick={addTeam}
            disabled={atLimit}
          >
            + {t('admin_endurance_add_team')}
          </button>

          {/* Overflow menu */}
          <div className="ete2-overflow-wrap">
            <button
              type="button"
              className="ete2-btn ete2-btn-icon"
              onClick={() => setOverflowOpen((v) => !v)}
              aria-label="More options"
              title="More options"
            >
              ⋯
            </button>
            {overflowOpen && (
              <div className="ete2-overflow-menu" role="menu">
                <button type="button" role="menuitem" onClick={() => { fileRef.current?.click(); setOverflowOpen(false); }}>
                  📥 {t('admin_pro_event_csv_import')}
                </button>
                <button type="button" role="menuitem" onClick={() => { downloadTemplate(); setOverflowOpen(false); }}>
                  📄 {t('admin_pro_event_csv_template')}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <p className="ete2-hint">
        {t('admin_endurance_drivers_line_ph')}
        {' — '}
        {t('admin_endurance_teams_simple_hint')}
      </p>

      {atLimit && (
        <p className="ete2-limit-msg" role="status">{t('admin_endurance_team_limit')}</p>
      )}

      {/* ── Teams list ── */}
      <ul className="ete2-list">
        {teams.map((team, teamIndex) => {
          const ready = isTeamReady(team);
          const namedMembers = (team.members || []).filter((m) => m?.name?.trim());
          const starterMember = team.members?.find((m) => m.starter && m?.name?.trim())
            || namedMembers[0];
          const showTransponder = transponderOpen[teamIndex];

          return (
            <li
              key={`team-${teamIndex}`}
              className={`ete2-card${ready ? ' is-ready' : ''}`}
            >
              {/* ── Card header row ── */}
              <div className="ete2-card-header">
                <span className="ete2-badge" aria-hidden>{teamIndex + 1}</span>

                <input
                  type="text"
                  className="ete2-name-input"
                  dir="auto"
                  value={team.name}
                  onChange={(e) => updateTeam(teamIndex, { name: e.target.value })}
                  placeholder={t(nameLabelKey)}
                  aria-label={t(nameLabelKey)}
                  autoComplete="off"
                />

                {/* Transponder toggle (only when timing system requires it) */}
                {hasTransponder && (
                  <button
                    type="button"
                    className={`ete2-transponder-toggle${showTransponder ? ' is-open' : ''}${team.transponderId ? ' has-value' : ''}`}
                    onClick={() => toggleTransponder(teamIndex)}
                    title={t('admin_endurance_team_transponder')}
                  >
                    📡
                    {team.transponderId && (
                      <span className="ete2-transponder-pill">{team.transponderId}</span>
                    )}
                  </button>
                )}

                {ready && (
                  <span className="ete2-ready-badge" aria-label="ready">✓</span>
                )}

                <button
                  type="button"
                  className="ete2-remove-btn"
                  onClick={() => removeTeam(teamIndex)}
                  disabled={teams.length <= 1}
                  aria-label={t('admin_endurance_remove_team')}
                  title={t('admin_endurance_remove_team')}
                >
                  ×
                </button>
              </div>

              {/* ── Transponder row (expandable) ── */}
              {hasTransponder && showTransponder && (
                <div className="ete2-transponder-row">
                  <span className="ete2-transponder-label">
                    {t('admin_endurance_team_transponder')} · {transponderSys.idFormat}
                  </span>
                  <input
                    type="text"
                    className="ete2-transponder-input"
                    dir="ltr"
                    value={team.transponderId || ''}
                    onChange={(e) => handleTeamTransponderChange(teamIndex, e.target.value)}
                    placeholder={transponderSys.idExample}
                    autoComplete="off"
                  />
                </div>
              )}

              {/* ── Drivers body ── */}
              <div className="ete2-drivers-body">
                {isEndurance ? (
                  /* Endurance: text line input + clickable driver chips */
                  <>
                    <input
                      type="text"
                      className="ete2-drivers-input"
                      dir="auto"
                      value={getDriversLineValue(teamIndex, team)}
                      onChange={(e) => updateDriversLine(teamIndex, e.target.value)}
                      placeholder={t('admin_endurance_drivers_line_ph')}
                      autoComplete="off"
                    />
                    {/* Driver chips — click to set starter */}
                    {namedMembers.length > 0 && (
                      <div className="ete2-driver-chips">
                        {namedMembers.map((m, mi) => {
                          const isStarter = m.starter;
                          const realIndex = team.members.indexOf(m);
                          return (
                            <button
                              key={mi}
                              type="button"
                              className={`ete2-driver-chip${isStarter ? ' is-starter' : ''}`}
                              onClick={() => setStarter(teamIndex, realIndex)}
                              title={isStarter ? 'Starter' : 'Set as starter'}
                            >
                              {isStarter && <span className="ete2-starter-flag" aria-hidden>★</span>}
                              <span className="ete2-chip-name">{m.name.trim()}</span>
                              {(m.weightKg !== '' && m.weightKg != null) && (
                                <span className="ete2-chip-weight">{m.weightKg}kg</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </>
                ) : (
                  /* Sprint: individual member rows with transponder per driver */
                  <>
                    <ul className="ete2-sprint-members">
                      {team.members.map((member, memberIndex) => (
                        <li key={`m-${teamIndex}-${memberIndex}`} className="ete2-sprint-member">
                          <button
                            type="button"
                            className={`ete2-starter-btn${member.starter ? ' is-active' : ''}`}
                            onClick={() => setStarter(teamIndex, memberIndex)}
                            title={member.starter ? 'Starter' : 'Set as starter'}
                            aria-label={member.starter ? 'Starter' : 'Set as starter'}
                          >
                            ★
                          </button>
                          <input
                            type="text"
                            className="ete2-member-name"
                            dir="auto"
                            value={member.name}
                            onChange={(e) => updateMember(teamIndex, memberIndex, { name: e.target.value })}
                            placeholder={t('admin_driver_placeholder')}
                            autoComplete="off"
                          />
                          <select
                            className="ete2-member-nation"
                            value={member.nationality || ''}
                            onChange={(e) => updateMember(teamIndex, memberIndex, { nationality: e.target.value })}
                            aria-label={t('admin_endurance_member_nationality')}
                          >
                            <option value="">
                              {team.nationality
                                ? `${countryFlag(team.nationality)} `
                                : '—'}
                            </option>
                            {COUNTRIES.map((c) => (
                              <option key={c.code} value={c.code}>
                                {countryFlag(c.code)} {c.name}
                              </option>
                            ))}
                          </select>
                          {hasTransponder && (
                            <input
                              type="text"
                              className="ete2-member-transponder"
                              dir="ltr"
                              value={member.transponderId || ''}
                              onChange={(e) => handleTransponderChange(teamIndex, memberIndex, e.target.value)}
                              placeholder={transponderSys.idExample}
                              title={transponderSys.idFormat}
                              autoComplete="off"
                            />
                          )}
                          <button
                            type="button"
                            className="ete2-remove-member"
                            onClick={() => removeMember(teamIndex, memberIndex)}
                            disabled={team.members.length <= 1}
                            aria-label={t('admin_endurance_remove_member')}
                          >
                            ×
                          </button>
                        </li>
                      ))}
                    </ul>
                    <button type="button" className="ete2-add-member" onClick={() => addMember(teamIndex)}>
                      + {t('admin_endurance_add_member')}
                    </button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        className="endurance-csv-input"
        onChange={handleCsvFile}
      />
    </div>
  );
}
