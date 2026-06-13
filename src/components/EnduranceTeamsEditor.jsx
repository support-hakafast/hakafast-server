import React from 'react';
import {
  createEmptyTeamRecord,
  groupsToTeamRecords,
  teamRecordsToGroups,
} from '../utils/raceEventHelpers.js';

export default function EnduranceTeamsEditor({ t, groups, onChange, showBulkImport = true }) {
  const teams = groupsToTeamRecords(groups);

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

  const removeTeam = (teamIndex) => {
    if (teams.length <= 1) return;
    updateTeams(teams.filter((_, i) => i !== teamIndex));
  };

  const addTeam = () => {
    updateTeams([...teams, createEmptyTeamRecord(teams.length + 1)]);
  };

  return (
    <div className="endurance-teams-editor">
      <div className="endurance-teams-editor-head">
        <span className="field-label">{t('admin_pro_event_groups_endurance')}</span>
        <button type="button" className="endurance-team-add-btn" onClick={addTeam}>
          + {t('admin_endurance_add_team')}
        </button>
      </div>
      <p className="pro-event-groups-hint">{t('admin_endurance_teams_editor_hint')}</p>

      <ul className="endurance-teams-list">
        {teams.map((team, teamIndex) => (
          <li key={`team-${teamIndex}`} className="endurance-team-card">
            <div className="endurance-team-card-head">
              <input
                type="text"
                className="endurance-team-name-input"
                value={team.name}
                onChange={(e) => updateTeam(teamIndex, { name: e.target.value })}
                placeholder={t('admin_endurance_team_name_ph')}
              />
              <button
                type="button"
                className="endurance-team-remove"
                onClick={() => removeTeam(teamIndex)}
                disabled={teams.length <= 1}
                aria-label={t('admin_endurance_remove_team')}
              >
                ×
              </button>
            </div>

            <div className="endurance-members-head" aria-hidden>
              <span>{t('admin_endurance_member_name')}</span>
              <span>{t('admin_endurance_member_weight')}</span>
              <span>{t('admin_endurance_member_starter')}</span>
              <span />
            </div>

            <ul className="endurance-members-list">
              {team.members.map((member, memberIndex) => (
                <li key={`m-${teamIndex}-${memberIndex}`} className="endurance-member-row">
                  <input
                    type="text"
                    value={member.name}
                    onChange={(e) => updateMember(teamIndex, memberIndex, { name: e.target.value })}
                    placeholder={t('admin_driver_placeholder')}
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={member.weightKg}
                    onChange={(e) => updateMember(teamIndex, memberIndex, { weightKg: e.target.value })}
                    placeholder="kg"
                    title={t('admin_endurance_member_weight')}
                  />
                  <label className="endurance-starter-mark" title={t('admin_endurance_member_starter')}>
                    <input
                      type="radio"
                      name={`starter-${teamIndex}`}
                      checked={Boolean(member.starter)}
                      onChange={() => setStarter(teamIndex, memberIndex)}
                      aria-label={t('admin_endurance_member_starter')}
                    />
                  </label>
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
          </li>
        ))}
      </ul>
    </div>
  );
}
