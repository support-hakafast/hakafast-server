import React, { useState } from 'react';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import { isStrongPassword } from '../utils/password.js';
import { apiFetch } from '../utils/apiClient.js';

export default function AdminSetupModal({ trackSlug, onComplete }) {
  const { t } = useLanguage();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [karts, setKarts] = useState('');
  const [enforceSecurity, setEnforceSecurity] = useState(false);

  const submit = async () => {
    if (!karts.trim()) {
      alert(t('admin_setup_karts_required'));
      return;
    }
    if (enforceSecurity) {
      if (!isStrongPassword(password)) {
        alert(t('admin_password_weak'));
        return;
      }
      if (password !== confirm) {
        alert(t('admin_setup_password_mismatch'));
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
        alert(t('admin_alert_server_error'));
        return;
      }
      onComplete({ kartNumbers: karts.trim(), hasPassword: enforceSecurity });
    } catch {
      alert(t('admin_alert_server_error'));
    }
  };

  return (
    <div className="admin-modal-overlay">
      <div className="admin-modal">
        <h2>{t('admin_setup_title')}</h2>
        <p>{t('admin_setup_lead')}</p>

        <label className="field-label">{t('admin_kart_input_placeholder')}</label>
        <input
          type="text"
          value={karts}
          onChange={(e) => setKarts(e.target.value)}
          placeholder="1-10, 16-19"
        />

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
          <>
            <label className="field-label">{t('admin_setup_password')}</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={t('admin_setup_confirm')} />
            <p className="password-hint">{t('admin_password_rules')}</p>
          </>
        )}

        <button type="button" className="btn-preview" onClick={submit}>
          {t('admin_setup_start')}
        </button>
      </div>
    </div>
  );
}
