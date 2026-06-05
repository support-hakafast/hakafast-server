import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import '../assets/AdminPanel.css';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import LanguageSwitcher from './LanguageSwitcher.jsx';

const SESSION_KEYS = {
  Practice: 'admin_session_practice',
  Qualifying: 'admin_session_quali',
  Race: 'admin_session_race',
};

const LEVEL_KEYS = {
  Amateur: 'level_amateur',
  Pro: 'level_pro',
  Master: 'level_master',
};

const AdminPanel = () => {
  const { t } = useLanguage();
  const [sessionType, setSessionType] = useState('Practice');
  const [queue, setQueue] = useState([
    { id: 1, name: 'ישראל ישראלי', level: 'Pro' },
    { id: 2, name: 'אבי כהן', level: 'Amateur' },
    { id: 3, name: 'לוני לוי', level: 'Pro' },
  ]);
  const [selectedDriver, setSelectedDriver] = useState({ name: '', phone: '', email: '', level: 'Amateur' });

  const handleSessionChange = (type) => {
    setSessionType(type);
  };

  const levelLabel = (level) => t(LEVEL_KEYS[level] || 'level_amateur');

  return (
    <div className="admin-dashboard">
      <div className="hf-page-bar admin-top-bar">
        <Link to="/">{t('title')}</Link>
        <LanguageSwitcher />
      </div>

      <section className="session-settings-card">
        <h2>{t('admin_session_settings')}</h2>
        <div className="session-options-grid">
          <button
            type="button"
            className={`session-btn ${sessionType === 'Practice' ? 'active-practice' : ''}`}
            onClick={() => handleSessionChange('Practice')}
          >
            ⏱️ {t('admin_session_practice')}
          </button>
          <button
            type="button"
            className={`session-btn ${sessionType === 'Qualifying' ? 'active-quali' : ''}`}
            onClick={() => handleSessionChange('Qualifying')}
          >
            🏁 {t('admin_session_quali')}
          </button>
          <button
            type="button"
            className={`session-btn ${sessionType === 'Race' ? 'active-race' : ''}`}
            onClick={() => handleSessionChange('Race')}
          >
            🏆 {t('admin_session_race')}
          </button>
        </div>
        <div className="current-status-bar">
          {t('admin_sync_status')}: <strong>{t(SESSION_KEYS[sessionType])}</strong>
        </div>
      </section>

      <div className="main-workspace">
        <div className="lanes-container">
          <div className="draggable-panel">
            <h3>🏎️ {t('admin_active_lane')}</h3>
          </div>
        </div>

        <section className="queue-panel">
          <h3>👥 {t('admin_queue_title')}</h3>
          <div className="vertical-queue-list">
            {queue.map((driver, index) => (
              <div key={driver.id} className="queue-item-row">
                <span className="position-badge">{index + 1}</span>
                <div className="driver-info">
                  <span className="driver-name">{driver.name}</span>
                  <span className={`level-tag ${driver.level.toLowerCase()}`}>{levelLabel(driver.level)}</span>
                </div>
                <button type="button" onClick={() => setSelectedDriver(driver)} className="btn-edit-inline">📝</button>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="floating-edit-driver-widget">
        <div className="widget-header">
          <h4>📝 {t('admin_edit_widget')}</h4>
        </div>
        <div className="widget-body">
          <input
            type="text"
            placeholder={t('admin_driver_placeholder')}
            value={selectedDriver.name}
            onChange={(e) => setSelectedDriver({ ...selectedDriver, name: e.target.value })}
          />
          <input
            type="text"
            placeholder={t('admin_phone_placeholder')}
            value={selectedDriver.phone}
            onChange={(e) => setSelectedDriver({ ...selectedDriver, phone: e.target.value })}
          />
          <select
            value={selectedDriver.level}
            onChange={(e) => setSelectedDriver({ ...selectedDriver, level: e.target.value })}
          >
            <option value="Amateur">{t('level_amateur')}</option>
            <option value="Pro">{t('level_pro')}</option>
          </select>
          <button type="button" className="btn-save-widget">{t('admin_save_driver')} 💾</button>
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;
