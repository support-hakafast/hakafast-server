import React from 'react';

export default function TrackPlannerModal({
  onClose,
  t,
  trackDisplayName,
  setTrackDisplayName,
  openingTime,
  setOpeningTime,
  closingTime,
  setClosingTime,
  sessionDurationPlan,
  setSessionDurationPlan,
  turnoverMin,
  setTurnoverMin,
  competitiveBlockMin,
  setCompetitiveBlockMin,
  avgDriversPerSession,
  setAvgDriversPerSession,
  pricePerSession,
  setPricePerSession,
  competitiveHeatsPlanned,
  setCompetitiveHeatsPlanned,
  dayPlan,
  onSave,
  isSaving,
}) {
  return (
    <div className="admin-modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div
        className="admin-modal admin-modal-wide admin-modal-light track-planner-modal"
        data-tour="planner"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="admin-modal-header admin-modal-header-light">
          <div>
            <h2>{t('admin_track_planner')}</h2>
            <p className="admin-modal-subtitle">{t('admin_track_planner_hint')}</p>
          </div>
          <button type="button" className="admin-modal-close" onClick={onClose} aria-label={t('modal_cancel')}>×</button>
        </header>

        <div className="track-planner-panel track-planner-panel-modal">
          <label className="planner-field">
            <span>{t('admin_track_display_name')}</span>
            <input type="text" value={trackDisplayName} onChange={(e) => setTrackDisplayName(e.target.value)} />
          </label>
          <div className="planner-row">
            <label className="planner-field">
              <span>{t('admin_opening_time')}</span>
              <input type="time" value={openingTime} onChange={(e) => setOpeningTime(e.target.value)} />
            </label>
            <label className="planner-field">
              <span>{t('admin_closing_time')}</span>
              <input type="time" value={closingTime} onChange={(e) => setClosingTime(e.target.value)} />
            </label>
          </div>
          <div className="planner-row">
            <label className="planner-field">
              <span>{t('admin_session_duration_plan')}</span>
              <input type="number" min="1" value={sessionDurationPlan} onChange={(e) => setSessionDurationPlan(e.target.value)} />
            </label>
            <label className="planner-field">
              <span>{t('admin_turnover_min')}</span>
              <input type="number" min="0" value={turnoverMin} onChange={(e) => setTurnoverMin(e.target.value)} />
            </label>
          </div>
          <div className="planner-row">
            <label className="planner-field">
              <span>{t('admin_competitive_block_min')}</span>
              <input type="number" min="1" value={competitiveBlockMin} onChange={(e) => setCompetitiveBlockMin(e.target.value)} />
            </label>
            <label className="planner-field">
              <span>{t('admin_avg_drivers_per_session')}</span>
              <input type="number" min="1" value={avgDriversPerSession} onChange={(e) => setAvgDriversPerSession(e.target.value)} />
            </label>
          </div>
          <div className="planner-row">
            <label className="planner-field">
              <span>{t('admin_price_per_session')}</span>
              <input type="number" min="0" value={pricePerSession} onChange={(e) => setPricePerSession(e.target.value)} />
            </label>
            <label className="planner-field">
              <span>{t('admin_competitive_heats_planned')}</span>
              <input
                type="number"
                min="0"
                max="20"
                value={competitiveHeatsPlanned}
                onChange={(e) => setCompetitiveHeatsPlanned(e.target.value)}
              />
            </label>
          </div>
          <div className="planner-stats planner-stats-modal">
            <div className="planner-stat-card">
              <strong>{dayPlan.maxSessionHeats}</strong>
              <span>{t('admin_plan_max_heats')}</span>
            </div>
            <div className="planner-stat-card">
              <strong>{dayPlan.maxSessionHeatsAfterCompetitive}</strong>
              <span>{t('admin_plan_after_competitive')}</span>
            </div>
            <div className="planner-stat-card">
              <strong>{dayPlan.estimatedRidersAfterCompetitive}</strong>
              <span>{t('admin_plan_estimated_riders')}</span>
            </div>
            <div className="planner-stat-card planner-stat-revenue">
              <strong>{dayPlan.estimatedRevenueAfterCompetitive}</strong>
              <span>{t('admin_plan_revenue')}</span>
            </div>
          </div>
        </div>

        <footer className="admin-modal-footer track-planner-footer">
          <button
            type="button"
            className="btn-preview track-planner-apply"
            onClick={onSave}
            disabled={isSaving}
          >
            {isSaving ? t('admin_track_planner_saving') : t('admin_track_planner_save')}
          </button>
          <button type="button" className="btn-muted track-planner-cancel" onClick={onClose}>
            {t('modal_cancel')}
          </button>
        </footer>
      </div>
    </div>
  );
}
