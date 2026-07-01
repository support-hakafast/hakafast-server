import React, { useState } from 'react';
import { apiFetch } from '../utils/apiClient.js';

export default function AdminUnlockGate({ t, trackSlug, onUnlocked }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!password.trim()) return;
    setSubmitting(true);
    try {
      const res = await apiFetch('/api/admin/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: password.trim() }),
      }, trackSlug);
      const data = await res.json();
      if (data.success) {
        onUnlocked();
        return;
      }
      setError(t('admin_edit_password_wrong'));
    } catch {
      setError(t('admin_alert_server_error'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="admin-unlock-overlay" role="dialog" aria-modal="true">
      <form className="admin-unlock-card" onSubmit={submit}>
        <h2>{t('admin_unlock')}</h2>
        <p>{t('admin_advanced_locked')}</p>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t('admin_edit_password_placeholder')}
          autoFocus
        />
        {error && <p className="admin-unlock-error">{error}</p>}
        <button type="submit" className="btn-full" disabled={submitting}>
          {submitting ? '...' : t('admin_unlock')}
        </button>
      </form>
    </div>
  );
}
