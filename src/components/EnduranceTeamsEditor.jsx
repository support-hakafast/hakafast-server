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

const MAX_TEAMS_ENDURANCE = 80;
const MAX_TEAMS_SPRINT = 150;

export default function EnduranceTeamsEditor({
  t,
  groups,
  onChange,
  eventType = 'endurance',
  groupsLabelKey = 'admin_pro_event_groups_endurance',
  onImportError,
  timingSystem = 'mylaps_tranx',
  trackWeight = false,
  onTrackWeightChange,
}) {
  const fileRef = useRef(null);
  const teams = groupsToTeamRecords(groups, { preserveRaw: true });
  const [driversLineDraft, setDriversLineDraft] = useState({});
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [transponderOpen, setTransponderOpen] = useState({});
  const [overflowOpen, setOverflowOpen] = useState(false);
  const nameLabelKey = eventType === 'sprint' ? 'admin_sprint_heat_name_ph' : 'admin_endurance_team_name_ph';
  const isEndurance = eventType === 'endurance';
  const MAX_TEAMS = isEndurance ? MAX_TEAMS_ENDURANCE : MAX_TEAMS_SPRINT;
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

  const collapseTeam = (teamIndex) => {
    setCollapsed((prev) => new Set([...prev, teamIndex]));
  };

  const expandTeam = (teamIndex) => {
    setCollapsed((prev) => { const n = new Set(prev); n.delete(teamIndex); return n; });
  };

  const updateDriversLine = (teamIndex, line) => {
    setDriversLineDraft((prev) => ({ ...prev, [teamIndex]: line }));
    updateTeam(teamIndex, { members: parseTeamDriversLine(line) });
  };

  const handleDriversBlur = (teamIndex) => {
    // Auto-collapse when team name + at least one driver are present
    const team = teams[teamIndex];
    if (!team) return;
    const hasName = team.name?.trim();
    const hasDrivers = (team.members || []).some((m) => m?.name?.trim());
    if (hasName && hasDrivers) collapseTeam(teamIndex);
  };

  const getDriversLineValue = (teamIndex, team) => {
    if (driversLineDraft[teamIndex] !== undefined) return driversLineDraft[teamIndex];
    return serializeTeamDriversLine(team.members);
  };

  const setStarter = (teamIndex, memberIndex) => {
    // Only toggle starter flag — never touch the text input draft.
    const members = teams[teamIndex].members.map((m, i) => ({ ...m, starter: i === memberIndex }));
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
          {/* Weight monitoring toggle */}
          {onTrackWeightChange && (
            <button
              type="button"
              className={`ete2-toggle-btn${trackWeight ? ' is-on' : ''}`}
              onClick={() => onTrackWeightChange(!trackWeight)}
              title={t('admin_pro_event_track_weight')}
            >
              ⚖ {t('admin_pro_event_track_weight')}
            </button>
          )}

          <button
            type="button"
            className="ete2-btn ete2-btn-primary"
            onClick={addTeam}
            disabled={atLimit}
          >
            {isEndurance ? `+ ${t('admin_endurance_add_team')}` : `+ ${t('admin_sprint_add_driver')}`}
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

      {isEndurance && (
        <p className="ete2-hint">
          {trackWeight
            ? t('admin_endurance_drivers_line_ph')
            : t('admin_endurance_drivers_line_ph').replace(/\(\d+kg\)/g, '').replace(/\s+,/g, ',')}
        </p>
      )}

      {atLimit && (
        <p className="ete2-limit-msg" role="status">{t('admin_endurance_team_limit')}</p>
      )}

      {/* ── Teams list ── */}
      <ul className="ete2-list">
        {teams.map((team, teamIndex) => {
          const ready = isTeamReady(team);
          const isCollapsed = collapsed.has(teamIndex);
          const namedMembers = (team.members || []).filter((m) => m?.name?.trim());
          const showTransponder = transponderOpen[teamIndex];
          const starterMember = namedMembers.find((m) => m.starter) || namedMembers[0];

          /* ── Sprint mode: one card = one driver ── */
          if (!isEndurance) {
            const firstMember = team.members?.[0] || { name: '', weightKg: '', starter: true, nationality: '', transponderId: '' };
            const driverName = firstMember.name || '';
            const isReady = driverName.trim().length > 0;

            return (
              <li
                key={`team-${teamIndex}`}
                className={`ete2-card ete2-card-sprint${isReady ? ' is-ready' : ''}`}
              >
                <div className="ete2-card-header">
                  <span className="ete2-badge" aria-hidden>{teamIndex + 1}</span>

                  <input
                    type="text"
                    className="ete2-name-input"
                    dir="auto"
                    value={driverName}
                    onChange={(e) => updateMember(teamIndex, 0, { name: e.target.value })}
                    placeholder={t('admin_driver_placeholder')}
                    aria-label={t('admin_sprint_driver_label')}
                    autoComplete="off"
                  />

                  {trackWeight && (
                    <input
                      type="number"
                      className="ete2-weight-input"
                      value={firstMember.weightKg || ''}
                      onChange={(e) => updateMember(teamIndex, 0, { weightKg: e.target.value })}
                      placeholder="kg"
                      min="30"
                      max="200"
                      title="Weight (kg)"
                    />
                  )}

                  <select
                    className="ete2-member-nation"
                    value={firstMember.nationality || ''}
                    onChange={(e) => updateMember(teamIndex, 0, { nationality: e.target.value })}
                    aria-label={t('admin_endurance_member_nationality')}
                  >
                    <option value="">—</option>
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
                      value={firstMember.transponderId || ''}
                      onChange={(e) => updateMember(teamIndex, 0, { transponderId: normalizeTransponderId(e.target.value, timingSystem) })}
                      placeholder={transponderSys.idExample}
                      title={transponderSys.idFormat}
                      autoComplete="off"
                    />
                  )}

                  {isReady && <span className="ete2-ready-badge" aria-label="ready">✓</span>}

                  <button
                    type="button"
                    className="ete2-remove-btn"
                    onClick={() => removeTeam(teamIndex)}
                    disabled={teams.length <= 1}
                    aria-label={t('admin_endurance_remove_member')}
                    title={t('admin_endurance_remove_member')}
                  >
                    ×
                  </button>
                </div>
              </li>
            );
          }

          /* ── Endurance mode: team cards with name + drivers ── */
          return (
            <li
              key={`team-${teamIndex}`}
              className={`ete2-card${ready ? ' is-ready' : ''}${isCollapsed ? ' is-collapsed' : ''}`}
            >
              {/* ── Card header row ── */}
              <div className="ete2-card-header" onClick={isCollapsed ? () => expandTeam(teamIndex) : undefined} style={isCollapsed ? { cursor: 'pointer' } : undefined}>
                <span className="ete2-badge" aria-hidden>{teamIndex + 1}</span>

                {isCollapsed ? (
                  /* Collapsed summary — click anywhere to expand */
                  <div className="ete2-collapsed-summary">
                    <span className="ete2-collapsed-name">{team.name || t('admin_endurance_team_unnamed')}</span>
                    <span className="ete2-collapsed-drivers">
                      {namedMembers.map((m, mi) => (
                        <span key={mi} className={m.starter ? 'ete2-collapsed-starter' : ''}>
                          {m.name.trim()}
                          {m.starter && ' ★'}
                          {trackWeight && m.weightKg && m.weightKg !== '0' && ` ${m.weightKg}kg`}
                          {mi < namedMembers.length - 1 && ' · '}
                        </span>
                      ))}
                    </span>
                  </div>
                ) : (
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
                )}

                {/* Transponder toggle — hidden when collapsed */}
                {hasTransponder && !isCollapsed && (
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

                {!isCollapsed && (
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
                )}
              </div>

              {/* Expanded content */}
              {!isCollapsed && (
                <>
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

                  {/* ── Drivers body (endurance only — sprint cards return early above) ── */}
                  <div className="ete2-drivers-body">
                    <input
                      type="text"
                      className="ete2-drivers-input"
                      dir="auto"
                      value={getDriversLineValue(teamIndex, team)}
                      onChange={(e) => updateDriversLine(teamIndex, e.target.value)}
                      onBlur={() => handleDriversBlur(teamIndex)}
                      placeholder={trackWeight ? t('admin_endurance_drivers_line_ph') : 'Joe, Dan, Sara'}
                      autoComplete="off"
                    />
                    {namedMembers.length > 0 && (
                      <div className="ete2-driver-chips">
                        {namedMembers.map((m, mi) => {
                          const isStarter = m.starter;
                          const realIndex = team.members.indexOf(m);
                          const hasWeight = m.weightKg !== '' && m.weightKg != null && m.weightKg !== '0';
                          return (
                            <div key={mi} className={`ete2-chip-wrap${isStarter ? ' is-starter' : ''}`}>
                              <button
                                type="button"
                                className={`ete2-driver-chip${isStarter ? ' is-starter' : ''}`}
                                onClick={() => setStarter(teamIndex, realIndex)}
                                title={isStarter ? t('admin_endurance_starter_short') : t('admin_endurance_set_starter')}
                              >
                                <span className="ete2-chip-name">{m.name.trim()}</span>
                                {!trackWeight && hasWeight && (
                                  <span className="ete2-chip-weight">{m.weightKg}kg</span>
                                )}
                                {isStarter && <span className="ete2-starter-flag" aria-hidden>★</span>}
                              </button>
                              {trackWeight && (
                                <input
                                  type="number"
                                  className="ete2-weight-input"
                                  value={m.weightKg || ''}
                                  onChange={(e) => updateMember(teamIndex, realIndex, { weightKg: e.target.value })}
                                  placeholder="kg"
                                  min="30"
                                  max="200"
                                />
                              )}
                            </div>
                          );
                        })}
                        <span className="ete2-chips-hint">{t('admin_endurance_tap_starter_hint')}</span>
                      </div>
                    )}
                  </div>
                </>
              )}
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
