import React, { useState } from 'react';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import { isStrongPassword } from '../utils/password.js';
import { apiFetch } from '../utils/apiClient.js';

export default function AdminSetupModal({ trackSlug, onComplete }) {
  const { t } = useLanguage();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [karts, setKarts] = useState('');
  const [skipPassword, setSkipPassword] = useState(false);

  const submit = async () => {
    if (!karts.trim()) {
      alert(t('admin_setup_karts_required'));
      return;
    }
    if (!skipPassword) {
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
          editPassword: skipPassword ? '' : password,
        }),
      }, trackSlug);
      const data = await res.json();
      if (!data.success) {
        alert(t('admin_alert_server_error'));
        return;
      }
      onComplete({ kartNumbers: karts.trim(), hasPassword: !skipPassword });
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

        <label className="field-label">
          <input type="checkbox" checked={skipPassword} onChange={(e) => setSkipPassword(e.target.checked)} />
          {' '}{t('admin_setup_skip_password')}
        </label>

        {!skipPassword && (
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
