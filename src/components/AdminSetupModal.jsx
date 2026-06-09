import React, { useState } from 'react';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import { useDialog } from '../i18n/DialogContext.jsx';
import { isStrongPassword } from '../utils/password.js';
import { apiFetch } from '../utils/apiClient.js';

export default function AdminSetupModal({ trackSlug, onComplete }) {
  const { t } = useLanguage();
  const { showAlert } = useDialog();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [karts, setKarts] = useState('');
  const [enforceSecurity, setEnforceSecurity] = useState(false);

  const submit = async () => {
    if (enforceSecurity) {
      if (!isStrongPassword(password)) {
        showAlert(t('admin_password_weak'));
        return;
      }
      if (password !== confirm) {
        showAlert(t('admin_setup_password_mismatch'));
        return;
      }
    }
    try {
      const res = await apiFetch('/api/admin/track-setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trackSlug,
          kartNumbers: karts.trim(),
          editPassword: enforceSecurity ? password : '',
        }),
      }, trackSlug);
      const data = await res.json();
      if (!data.success) {
        showAlert(t('admin_alert_server_error'));
        return;
      }
      onComplete({ kartNumbers: karts.trim(), hasPassword: enforceSecurity });
    } catch {
      showAlert(t('admin_alert_server_error'));
    }
  };

  return (
    <div className="admin-modal-overlay admin-setup-overlay" role="dialog" aria-modal="true">
      <div className="admin-modal admin-modal-wide admin-modal-light admin-setup-modal">
        <header className="admin-modal-header admin-modal-header-light admin-setup-header">
          <div>
            <span className="admin-setup-icon" aria-hidden>🏁</span>
            <h2>{t('admin_setup_title')}</h2>
            <p className="admin-modal-subtitle">{t('admin_setup_lead')}</p>
          </div>
        </header>

        <div className="admin-setup-body">
          <label className="planner-field">
            <span>{t('admin_kart_input_placeholder')}</span>
            <input
              type="text"
              value={karts}
              onChange={(e) => setKarts(e.target.value)}
              placeholder={t('admin_setup_karts_optional_ph')}
            />
          </label>
          <p className="password-hint">{t('admin_setup_karts_optional_hint')}</p>

          <div className="security-toggle-row">
            <span className="field-label">{t('admin_setup_enforce_security')}</span>
            <button
              type="button"
              role="switch"
              aria-checked={enforceSecurity}
              className={`hf-toggle${enforceSecurity ? ' is-on' : ''}`}
              onClick={() => setEnforceSecurity((v) => !v)}
            >
              <span className="hf-toggle-knob" />
            </button>
          </div>

          {enforceSecurity && (
            <div className="admin-setup-security-fields">
              <label className="planner-field">
                <span>{t('admin_setup_password')}</span>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </label>
              <label className="planner-field">
                <span>{t('admin_setup_confirm')}</span>
                <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              </label>
              <p className="password-hint">{t('admin_password_rules')}</p>
            </div>
          )}
        </div>

        <footer className="admin-modal-footer">
          <button type="button" className="btn-preview admin-setup-submit" onClick={submit}>
            {t('admin_setup_start')}
          </button>
        </footer>
      </div>
    </div>
  );
}
