import React from 'react';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import { formatDriverName } from '../utils/teamDrivers.js';
import '../assets/AdminPanel.css';
import '../assets/SalesPages.css';

export default function EnduranceToolsModal({
  onClose,
  darkMode = false,
  t,
  enduranceTeams,
  penaltyKart,
  setPenaltyKart,
  penaltySec,
  setPenaltySec,
  onAddPenalty,
  driverChangeKart,
  setDriverChangeKart,
  driverChangeName,
  setDriverChangeName,
  selectedEnduranceTeam,
  onDriverChange,
  enduranceRules,
  setEnduranceRules,
}) {
  const modalThemeClass = darkMode ? 'admin-modal-dark' : 'admin-modal-light';
  const headerThemeClass = darkMode ? 'admin-modal-header-dark' : 'admin-modal-header-light';

  return (
    <div className="admin-modal-overlay" role="dialog" aria-modal="true">
      <div className={`admin-modal endurance-tools-modal ${modalThemeClass}`}>
        <header className={`admin-modal-header ${headerThemeClass}`}>
          <h2>{t('admin_endurance_tools')}</h2>
          <button type="button" className="admin-modal-close" onClick={onClose}>×</button>
        </header>
        <div className="endurance-admin-panel endurance-admin-panel-modal">
          <div className="endurance-tool-row">
            <input
              type="number"
              value={penaltyKart}
              onChange={(e) => setPenaltyKart(e.target.value)}
              placeholder={t('kart')}
            />
            <input
              type="number"
              min="1"
              value={penaltySec}
              onChange={(e) => setPenaltySec(e.target.value)}
              placeholder={t('admin_penalty_seconds')}
            />
            <button type="button" className="btn-muted" onClick={onAddPenalty}>
              {t('admin_add_penalty')}
            </button>
          </div>
          <div className="endurance-tool-row">
            <select
              value={driverChangeKart}
              onChange={(e) => {
                setDriverChangeKart(e.target.value);
                const team = enduranceTeams.find((item) => String(item.kart_number) === e.target.value);
                const firstDriver = team?.team_drivers?.[0];
                if (team?.active_driver) setDriverChangeName(team.active_driver);
                else if (firstDriver) setDriverChangeName(typeof firstDriver === 'string' ? firstDriver : (firstDriver.name || ''));
              }}
            >
              <option value="">{t('admin_driver_change_pick_kart')}</option>
              {enduranceTeams.map((team) => (
                <option key={team.kart_number} value={team.kart_number}>
                  #{team.kart_number} {team.team_name}
                </option>
              ))}
            </select>
            <select
              value={driverChangeName}
              onChange={(e) => setDriverChangeName(e.target.value)}
              disabled={!selectedEnduranceTeam}
            >
              <option value="">{t('admin_driver_change_pick_driver')}</option>
              {(selectedEnduranceTeam?.team_drivers || []).map((entry) => {
                const name = formatDriverName(entry);
                return name ? <option key={name} value={name}>{name}</option> : null;
              })}
            </select>
            <button type="button" className="btn-muted" onClick={onDriverChange}>
              {t('admin_driver_change')}
            </button>
          </div>
          <p className="endurance-hint">{t('admin_endurance_hint')}</p>
          <p className="endurance-hint">{t('admin_driver_change_pending_hint')}</p>
          <label className="endurance-rules-field">
            <span className="field-label">{t('admin_endurance_rules')}</span>
            <textarea
              rows={5}
              value={enduranceRules}
              onChange={(e) => setEnduranceRules(e.target.value)}
              placeholder={t('admin_endurance_rules_placeholder')}
            />
            <span className="endurance-hint">{t('admin_endurance_rules_hint')}</span>
          </label>
        </div>
      </div>
    </div>
  );
}
