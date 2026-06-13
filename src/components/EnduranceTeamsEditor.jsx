import React, { useRef } from 'react';
import {
  createEmptyTeamRecord,
  formatDriversLine,
  groupsToTeamRecords,
  parseDriversLine,
  parseRaceGroupsCsv,
  raceGroupsCsvTemplate,
  teamRecordsToGroups,
} from '../utils/raceEventHelpers.js';

function teamToSimpleRecord(team) {
  const members = team.members || [];
  const driversLine = formatDriversLine(members.map((m) => ({
    name: m.name,
    weightKg: m.weightKg === '' || m.weightKg == null ? null : Number(m.weightKg),
    starter: Boolean(m.starter),
  })));
  return {
    name: team.name,
    driversLine,
  };
}

function simpleRecordToTeam(record, index) {
  const drivers = parseDriversLine(record.driversLine);
  return {
    name: String(record.name || '').trim(),
    members: drivers.length
      ? drivers.map((d) => ({
        name: d.name,
        weightKg: d.weightKg != null ? String(d.weightKg) : '',
        starter: Boolean(d.starter),
      }))
      : [{ name: '', weightKg: '', starter: true }],
  };
}

export default function EnduranceTeamsEditor({
  t,
  groups,
  onChange,
  eventType = 'endurance',
  groupsLabelKey = 'admin_pro_event_groups_endurance',
  onImportError,
}) {
  const fileRef = useRef(null);
  const teams = groupsToTeamRecords(groups).map(teamToSimpleRecord);
  const nameLabelKey = eventType === 'sprint' ? 'admin_sprint_heat_name_ph' : 'admin_endurance_team_name_ph';

  const updateTeams = (nextSimple) => {
    onChange(teamRecordsToGroups(
      nextSimple.map((row, i) => simpleRecordToTeam(row, i)),
      { preserveEmpty: true },
    ));
  };

  const updateTeam = (index, patch) => {
    updateTeams(teams.map((team, i) => (i === index ? { ...team, ...patch } : team)));
  };

  const setStarter = (teamIndex, starterName) => {
    const drivers = parseDriversLine(teams[teamIndex].driversLine);
    const driversLine = formatDriversLine(drivers.map((d) => ({ ...d, starter: d.name === starterName })));
    updateTeam(teamIndex, { driversLine });
  };

  const addTeam = () => {
    const empty = createEmptyTeamRecord(teams.length + 1);
    updateTeams([...teams, teamToSimpleRecord(empty)]);
  };

  const removeTeam = (index) => {
    if (teams.length <= 1) return;
    updateTeams(teams.filter((_, i) => i !== index));
  };

  const applyImportedGroups = (imported) => {
    if (!imported.length) {
      onImportError?.(t('admin_pro_event_csv_empty'));
      return;
    }
    updateTeams(imported.map((g) => ({
      name: g.name,
      driversLine: formatDriversLine(g.drivers),
    })));
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

  return (
    <div className="endurance-teams-editor endurance-teams-simple">
      <div className="endurance-teams-editor-head">
        <span className="field-label">{t(groupsLabelKey)}</span>
        <div className="endurance-import-actions">
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
          <button type="button" className="endurance-team-add-btn" onClick={addTeam}>
            + {t('admin_endurance_add_team')}
          </button>
        </div>
      </div>
      <p className="pro-event-groups-hint">{t('admin_endurance_teams_simple_hint')}</p>

      <div className="endurance-simple-table" role="table">
        <div className="endurance-simple-head" role="row">
          <span role="columnheader">{t(nameLabelKey)}</span>
          <span role="columnheader">{t('admin_endurance_drivers_line')}</span>
          <span role="columnheader" aria-hidden />
        </div>
        {teams.map((team, teamIndex) => {
          const drivers = eventType === 'endurance' ? parseDriversLine(team.driversLine) : [];
          const starterName = drivers.find((d) => d.starter)?.name || drivers[0]?.name;
          return (
            <div key={`team-${teamIndex}`} className="endurance-simple-row-wrap">
              <div className="endurance-simple-row" role="row">
                <input
                  type="text"
                  className="endurance-team-name-input"
                  dir="auto"
                  value={team.name}
                  onChange={(e) => updateTeam(teamIndex, { name: e.target.value })}
                  placeholder={t(nameLabelKey)}
                  aria-label={t(nameLabelKey)}
                />
                <input
                  type="text"
                  className="endurance-drivers-line-input"
                  dir="auto"
                  value={team.driversLine}
                  onChange={(e) => updateTeam(teamIndex, { driversLine: e.target.value })}
                  placeholder={t('admin_endurance_drivers_line_ph')}
                  aria-label={t('admin_endurance_drivers_line')}
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
              {eventType === 'endurance' && drivers.length > 1 && (
                <div className="endurance-starter-picker">
                  <span className="endurance-starter-picker-label">{t('admin_starter_drivers')}:</span>
                  {drivers.map((d) => (
                    <label key={d.name} className="endurance-starter-option">
                      <input
                        type="radio"
                        name={`starter-${teamIndex}`}
                        checked={starterName === d.name}
                        onChange={() => setStarter(teamIndex, d.name)}
                      />
                      {d.name}
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
