// File: EnduranceTeamsEditor.jsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  createEmptyTeamRecord,
  groupsToTeamRecords,
  parseRaceGroupsCsv,
  raceGroupsCsvTemplate,
  teamRecordsToGroups,
} from '../utils/raceEventHelpers.js';

const MAX_TEAMS = 80;

export default function EnduranceTeamsEditor({
  t,
  groups,
  onChange,
  eventType = 'endurance',
  groupsLabelKey = 'admin_pro_event_groups_endurance',
  onImportError,
}) {
  const fileRef = useRef(null);
  const teams = groupsToTeamRecords(groups);
  const [collapsed, setCollapsed] = useState(() => new Set());
  const nameLabelKey = eventType === 'sprint' ? 'admin_sprint_heat_name_ph' : 'admin_endurance_team_name_ph';
  const isEndurance = eventType === 'endurance';
  const atLimit = teams.length >= MAX_TEAMS;

  const isTeamReady = useCallback((team) => {
    if (!team?.name?.trim()) return false;
    if (!Array.isArray(team.members) || !team.members.length) return false;
    const named = team.members.filter((m) => m?.name?.trim());
    if (!named.length) return false;
    if (isEndurance) {
      const hasStarter = named.some((m) => m.starter);
      if (!hasStarter) return false;
      const allComplete = team.members.every((m) =>
        !m?.name?.trim() || (m.name.trim() && m.weightKg !== '' && m.weightKg != null),
      );
      if (!allComplete) return false;
    }
    return true;
  }, [isEndurance]);

  // Auto-collapse ready teams, auto-expand teams that became incomplete
  useEffect(() => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      let changed = false;
      teams.forEach((team, idx) => {
        const ready = isTeamReady(team);
        if (ready && !next.has(idx)) { next.add(idx); changed = true; }
        else if (!ready && next.has(idx)) { next.delete(idx); changed = true; }
      });
      return changed ? next : prev;
    });
  }, [teams, isTeamReady]);

  const toggleCollapse = (teamIndex, e) => {
    e?.stopPropagation();
    e?.preventDefault();
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(teamIndex)) next.delete(teamIndex);
      else next.add(teamIndex);
      return next;
    });
  };

  const stopInside = (e) => {
    // Prevent the team-card-head click handler from firing when the user
    // clicks/touches an input or button inside it.
    e.stopPropagation();
  };

  const updateTeams = (nextTeams) => {
    onChange(teamRecordsToGroups(nextTeams, { preserveEmpty: true }));
  };

  const updateTeam = (teamIndex, patch) => {
    updateTeams(teams.map((team, i) => (i === teamIndex ? { ...team, ...patch } : team)));
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
      members: [...team.members, { name: '', weightKg: '', starter: team.members.length === 0 }],
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
    updateTeams(groupsToTeamRecords(imported.slice(0, MAX_TEAMS)));
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
    return {
      driverCount: named.length,
      starterName: starter?.name || '—',
    };
  };

  return (
    <div className="endurance-teams-editor">
      <div className="endurance-teams-editor-head">
        <span className="field-label">
          {t(groupsLabelKey)} · {t('admin_endurance_team_count', { count: teams.length, max: MAX_TEAMS })}
        </span>
        <div className="endurance-import-actions">
          <button type="button" className="btn-muted endurance-collapse-all" onClick={collapseAllReady} title={t('admin_endurance_collapse_ready')}>
            {t('admin_endurance_collapse_ready')}
          </button>
          <button type="button" className="btn-muted endurance-expand-all" onClick={expandAll} title={t('admin_endurance_expand_all')}>
            {t('admin_endurance_expand_all')}
          </button>
          <button type="button" className="btn-muted endurance-csv-template" onClick={downloadTemplate}>
            {t('admin_pro_event_csv_template')}
          </button>
          <button
            type="button"
            className="btn-muted endurance-csv-import"
            onClick={() => fileRef.current?.click()}
          >
            {t('admin_pro_event_csv_import')}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="endurance-csv-input"
            onChange={handleCsvFile}
          />
          <button type="button" className="endurance-team-add-btn" onClick={addTeam} disabled={atLimit}>
            + {t('admin_endurance_add_team')}
          </button>
        </div>
      </div>
      <p className="pro-event-groups-hint">{t('admin_endurance_teams_editor_hint')}</p>
      {atLimit && (
        <p className="pro-event-import-msg" role="status">{t('admin_endurance_team_limit')}</p>
      )}

      <ul className="endurance-teams-list">
        {teams.map((team, teamIndex) => {
          const isCollapsed = collapsed.has(teamIndex);
          const ready = isTeamReady(team);
          const summary = getTeamSummary(team);
          return (
            <li
              key={`team-${teamIndex}`}
              className={`endurance-team-card${isCollapsed ? ' is-collapsed' : ''}${ready ? ' is-ready' : ''}`}
            >
              <div
                className="endurance-team-card-head"
                onClick={() => toggleCollapse(teamIndex)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleCollapse(teamIndex, e); }
                }}
                aria-expanded={!isCollapsed}
              >
                <span className="endurance-team-number" aria-hidden>{teamIndex + 1}</span>

                {isCollapsed ? (
                  <div className="endurance-team-summary" onClick={(e) => { e.stopPropagation(); toggleCollapse(teamIndex, e); }}>
                    <strong className="endurance-team-summary-name">
                      {team.name || t('admin_endurance_team_unnamed')}
                    </strong>
                    <span className="endurance-team-summary-meta">
                      {t('admin_endurance_drivers_short', { count: summary.driverCount })}
                      {isEndurance && ` · ${t('admin_endurance_starter_short')}: ${summary.starterName}`}
                      {ready && <span className="endurance-team-ready-badge" aria-label="ready">✓</span>}
                    </span>
                  </div>
                ) : (
                  <input
                    type="text"
                    className="endurance-team-name-input"
                    dir="auto"
                    value={team.name}
                    onChange={(e) => updateTeam(teamIndex, { name: e.target.value })}
                    onClick={stopInside}
                    onMouseDown={stopInside}
                    onKeyDown={stopInside}
                    placeholder={t(nameLabelKey)}
                    aria-label={t(nameLabelKey)}
                  />
                )}

                <button
                  type="button"
                  className="endurance-team-toggle"
                  onClick={(e) => toggleCollapse(teamIndex, e)}
                  aria-label={isCollapsed ? t('admin_endurance_expand') : t('admin_endurance_collapse')}
                  title={isCollapsed ? t('admin_endurance_expand') : t('admin_endurance_collapse')}
                >
                  <span aria-hidden>{isCollapsed ? '▾' : '▴'}</span>
                </button>
                <button
                  type="button"
                  className="endurance-team-remove"
                  onClick={(e) => { e.stopPropagation(); removeTeam(teamIndex); }}
                  disabled={teams.length <= 1}
                  aria-label={t('admin_endurance_remove_team')}
                >
                  ×
                </button>
              </div>

              {!isCollapsed && (
                <>
                  <div
                    className={`endurance-members-head${isEndurance ? '' : ' endurance-member-row-sprint'}`}
                    aria-hidden
                  >
                    <span>{t('admin_endurance_member_name')}</span>
                    {isEndurance && <span>{t('admin_endurance_member_weight')}</span>}
                    {isEndurance && <span>{t('admin_endurance_member_starter')}</span>}
                    <span />
                  </div>

                  <ul className="endurance-members-list">
                    {team.members.map((member, memberIndex) => (
                      <li
                        key={`m-${teamIndex}-${memberIndex}`}
                        className={`endurance-member-row${isEndurance ? '' : ' endurance-member-row-sprint'}`}
                      >
                        <input
                          type="text"
                          dir="auto"
                          value={member.name}
                          onChange={(e) => updateMember(teamIndex, memberIndex, { name: e.target.value })}
                          placeholder={t('admin_driver_placeholder')}
                        />
                        {isEndurance && (
                          <input
                            type="number"
                            min="0"
                            step="0.1"
                            value={member.weightKg}
                            onChange={(e) => updateMember(teamIndex, memberIndex, { weightKg: e.target.value })}
                            placeholder="kg"
                            title={t('admin_endurance_member_weight')}
                          />
                        )}
                        {isEndurance && (
                          <label className="endurance-starter-mark" title={t('admin_endurance_member_starter')}>
                            <input
                              type="radio"
                              name={`starter-${teamIndex}`}
                              checked={Boolean(member.starter)}
                              onChange={() => setStarter(teamIndex, memberIndex)}
                            />
                            <span>{t('admin_endurance_starter_short')}</span>
                          </label>
                        )}
                        <button
                          type="button"
                          className="endurance-member-remove"
                          onClick={() => removeMember(teamIndex, memberIndex)}
                          disabled={team.members.length <= 1}
                          aria-label={t('admin_endurance_remove_member')}
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>

                  <button type="button" className="endurance-member-add" onClick={() => addMember(teamIndex)}>
                    + {t('admin_endurance_add_member')}
                  </button>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
