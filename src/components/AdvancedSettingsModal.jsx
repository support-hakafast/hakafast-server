import React, { useState, useEffect, useCallback } from 'react';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import { useDialog } from '../i18n/DialogContext.jsx';
import { isStrongPassword } from '../utils/password.js';
import { apiFetch } from '../utils/apiClient.js';

export default function AdvancedSettingsModal({
  trackSlug,
  hasPassword,
  isLicensed,
  onClose,
  masterLapThreshold,
  setMasterLapThreshold,
  proLapThreshold,
  setProLapThreshold,
  pitExitPosition,
  setPitExitPosition,
  onSaveSettings,
  onUpdateDriverLevel,
  showResetWorkspace,
  onResetWorkspace,
  exportCsv,
  setExportCsv,
  exportPdf,
  setExportPdf,
  onFinishHeat,
  onLicenseActivated,
}) {
  const { t } = useLanguage();
  const { showAlert } = useDialog();
  const [gatePassword, setGatePassword] = useState('');
  const [unlocked, setUnlocked] = useState(!hasPassword);
  const [settingsPassword, setSettingsPassword] = useState('');
  const [editLookup, setEditLookup] = useState('');
  const [editLevel, setEditLevel] = useState('Amateur');
  const [editPassword, setEditPassword] = useState('');
  const [licenseKey, setLicenseKey] = useState('');
  const [licenseStatus, setLicenseStatus] = useState(isLicensed ? 'active' : null);

  const [decoderHost, setDecoderHost] = useState('');
  const [decoderPort, setDecoderPort] = useState('5403');
  const [decoderStatus, setDecoderStatus] = useState(null);
  const [decoderSaving, setDecoderSaving] = useState(false);
  const [transponderRows, setTransponderRows] = useState([{ tid: '', kart: '' }]);

  const loadDecoderConfig = useCallback(() => {
    apiFetch('/api/install/decoder').then((r) => r.json()).then((d) => {
      if (!d.success) return;
      setDecoderHost(d.host || '');
      setDecoderPort(String(d.port || 5403));
      setDecoderStatus(d.status);
      const map = d.transponderMap || {};
      const rows = Object.entries(map).map(([tid, kart]) => ({ tid, kart: String(kart) }));
      setTransponderRows(rows.length ? [...rows, { tid: '', kart: '' }] : [{ tid: '', kart: '' }]);
    }).catch(() => {});
  }, []);

  useEffect(() => { if (unlocked) loadDecoderConfig(); }, [unlocked, loadDecoderConfig]);

  const saveDecoder = async () => {
    setDecoderSaving(true);
    try {
      const map = {};
      transponderRows.forEach(({ tid, kart }) => {
        if (tid.trim() && kart.trim()) map[tid.trim()] = Number(kart.trim());
      });
      const res = await apiFetch('/api/install/decoder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host: decoderHost.trim(), port: Number(decoderPort) || 5403, transponderMap: map }),
      });
      const data = await res.json();
      if (data.success) {
        setDecoderStatus(data.status);
        showAlert(t('decoder_saved'));
      }
    } catch { showAlert(t('admin_alert_server_error')); }
    setDecoderSaving(false);
  };

  const updateTransponderRow = (idx, field, val) => {
    setTransponderRows((prev) => {
      const next = prev.map((r, i) => i === idx ? { ...r, [field]: val } : r);
      const last = next[next.length - 1];
      if (last.tid.trim() || last.kart.trim()) next.push({ tid: '', kart: '' });
      return next;
    });
  };

  const removeTransponderRow = (idx) => {
    setTransponderRows((prev) => prev.length > 1 ? prev.filter((_, i) => i !== idx) : [{ tid: '', kart: '' }]);
  };

  const tryActivateLicense = async () => {
    if (!licenseKey.trim()) return;
    try {
      const res = await apiFetch('/api/admin/verify-license', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenseKey: licenseKey.trim() }),
      }, trackSlug);
      const data = await res.json();
      if (data.success) {
        setLicenseStatus('active');
        onLicenseActivated?.();
      } else {
        setLicenseStatus('invalid');
      }
    } catch {
      setLicenseStatus('error');
    }
  };

  const tryUnlock = async () => {
    const res = await apiFetch('/api/admin/verify-settings-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: gatePassword }),
    }, trackSlug);
    const data = await res.json();
    if (data.success) setUnlocked(true);
    else showAlert(t('admin_edit_password_wrong'));
  };

  const saveSettings = () => {
    if (settingsPassword && !isStrongPassword(settingsPassword)) {
      showAlert(t('admin_password_weak'));
      return;
    }
    onSaveSettings(settingsPassword);
  };

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal admin-modal-wide admin-modal-light admin-advanced-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close" onClick={onClose}>×</button>
        <h2>{t('admin_advanced_settings')}</h2>

        {!unlocked ? (
          <div>
            <p>{t('admin_advanced_locked')}</p>
            <input
              type="password"
              value={gatePassword}
              onChange={(e) => setGatePassword(e.target.value)}
              placeholder={t('admin_edit_password_placeholder')}
            />
            <button type="button" className="btn-full" onClick={tryUnlock}>{t('admin_unlock')}</button>
          </div>
        ) : (
          <>
            <p className="level-hint">{t('admin_lap_auto_upgrade_hint')}</p>
            <label className="field-label">{t('admin_pit_exit_position')}</label>
            <select value={pitExitPosition} onChange={(e) => setPitExitPosition(e.target.value)}>
              <option value="top">{t('admin_pit_exit_top')}</option>
              <option value="bottom">{t('admin_pit_exit_bottom')}</option>
            </select>
            <p className="level-hint">{t('admin_pit_exit_position_hint')}</p>
            <label className="field-label">{t('admin_lap_master_threshold')}</label>
            <input type="text" value={masterLapThreshold} onChange={(e) => setMasterLapThreshold(e.target.value)} />
            <label className="field-label">{t('admin_lap_pro_threshold')}</label>
            <input type="text" value={proLapThreshold} onChange={(e) => setProLapThreshold(e.target.value)} />
            <label className="field-label">{t('admin_edit_password_set_label')}</label>
            <input
              type="password"
              value={settingsPassword}
              onChange={(e) => setSettingsPassword(e.target.value)}
              placeholder={t('admin_edit_password_set_placeholder')}
            />
            <p className="password-hint">{t('admin_password_rules_optional')}</p>
            <button type="button" className="btn-muted btn-full" onClick={saveSettings}>{t('admin_save_level_settings')}</button>

            <hr className="panel-divider" />
            <h3>{t('admin_edit_db_title')}</h3>
            <input type="text" value={editLookup} onChange={(e) => setEditLookup(e.target.value)} placeholder={t('admin_edit_lookup_placeholder')} />
            <select value={editLevel} onChange={(e) => setEditLevel(e.target.value)}>
              <option value="Amateur">{t('level_amateur')}</option>
              <option value="Master">{t('level_master')}</option>
              <option value="Pro">{t('level_pro')}</option>
            </select>
            {hasPassword && (
              <input type="password" value={editPassword} onChange={(e) => setEditPassword(e.target.value)} placeholder={t('admin_edit_password_placeholder')} />
            )}
            <button
              type="button"
              className="btn-muted btn-full"
              onClick={() => onUpdateDriverLevel(editLookup, editLevel, editPassword)}
            >
              {t('admin_btn_update_db')}
            </button>

            <hr className="panel-divider" />
            <h3>{t('admin_license_title')}</h3>
            {licenseStatus === 'active' ? (
              <p className="license-active-msg">✓ {t('admin_license_active')}</p>
            ) : (
              <>
                <p className="level-hint">{t('admin_license_hint')}</p>
                <div className="license-input-row">
                  <input
                    type="text"
                    value={licenseKey}
                    onChange={(e) => setLicenseKey(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') tryActivateLicense(); }}
                    placeholder={t('admin_license_key_ph')}
                    dir="ltr"
                  />
                  <button type="button" className="btn-muted" onClick={tryActivateLicense} disabled={!licenseKey.trim()}>
                    {t('admin_license_activate')}
                  </button>
                </div>
                {licenseStatus === 'invalid' && <p className="license-error-msg">{t('admin_license_invalid')}</p>}
                {licenseStatus === 'error' && <p className="license-error-msg">{t('admin_license_error')}</p>}
              </>
            )}

            <hr className="panel-divider" />
            <h3>{t('decoder_settings_title')}</h3>
            <p className="level-hint">{t('decoder_settings_hint')}</p>
            <div className="decoder-status-row">
              <span className={`decoder-dot ${decoderStatus?.connected ? 'decoder-dot-on' : 'decoder-dot-off'}`} />
              <span className="decoder-status-label">
                {decoderStatus?.connected
                  ? t('decoder_status_connected')
                  : decoderHost ? t('decoder_status_disconnected') : t('decoder_status_not_configured')}
              </span>
              {decoderStatus?.lastPassingAt && (
                <span className="decoder-last-passing">
                  {t('decoder_last_passing')}: {new Date(decoderStatus.lastPassingAt).toLocaleTimeString()}
                </span>
              )}
              <button type="button" className="btn-decoder-refresh" onClick={loadDecoderConfig} title={t('decoder_refresh')}>↻</button>
            </div>
            <div className="decoder-ip-row">
              <div className="decoder-field">
                <label className="field-label">{t('decoder_host_label')}</label>
                <input
                  type="text"
                  value={decoderHost}
                  onChange={(e) => setDecoderHost(e.target.value)}
                  placeholder="192.168.1.50"
                  dir="ltr"
                />
              </div>
              <div className="decoder-field decoder-field-port">
                <label className="field-label">{t('decoder_port_label')}</label>
                <input
                  type="number"
                  value={decoderPort}
                  onChange={(e) => setDecoderPort(e.target.value)}
                  placeholder="5403"
                  dir="ltr"
                />
              </div>
            </div>

            <label className="field-label">{t('decoder_transponder_map_label')}</label>
            <p className="level-hint">{t('decoder_transponder_map_hint')}</p>
            <div className="decoder-map-table">
              <div className="decoder-map-header">
                <span>{t('decoder_col_transponder')}</span>
                <span>{t('decoder_col_kart')}</span>
                <span />
              </div>
              {transponderRows.map((row, idx) => (
                <div className="decoder-map-row" key={idx}>
                  <input
                    type="text"
                    value={row.tid}
                    onChange={(e) => updateTransponderRow(idx, 'tid', e.target.value)}
                    placeholder={t('decoder_transponder_ph')}
                    dir="ltr"
                  />
                  <input
                    type="number"
                    value={row.kart}
                    onChange={(e) => updateTransponderRow(idx, 'kart', e.target.value)}
                    placeholder={t('decoder_kart_ph')}
                    dir="ltr"
                  />
                  <button
                    type="button"
                    className="btn-decoder-remove"
                    onClick={() => removeTransponderRow(idx)}
                    disabled={transponderRows.length === 1 && !row.tid && !row.kart}
                  >×</button>
                </div>
              ))}
            </div>
            <button type="button" className="btn-muted btn-full" onClick={saveDecoder} disabled={decoderSaving}>
              {decoderSaving ? '...' : t('decoder_save')}
            </button>

            <hr className="panel-divider" />
            <div className="finish-section finish-section-modal">
              <h3>{t('admin_finish_section')}</h3>
              <div className="export-options">
                <label><input type="checkbox" checked={exportCsv} onChange={(e) => setExportCsv(e.target.checked)} />{t('admin_export_csv')}</label>
                <label><input type="checkbox" checked={exportPdf} onChange={(e) => setExportPdf(e.target.checked)} />{t('admin_export_pdf')}</label>
              </div>
              <button type="button" className="btn-finish-turquoise" onClick={onFinishHeat}>{t('admin_btn_finish_heat')}</button>
            </div>

            {showResetWorkspace && onResetWorkspace && (
              <>
                <hr className="panel-divider panel-divider-subtle" />
                <button type="button" className="btn-reset-workspace-subtle" onClick={onResetWorkspace}>
                  {t('admin_reset_workspace')}
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
