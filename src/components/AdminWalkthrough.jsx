import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import { useDialog } from '../i18n/DialogContext.jsx';
import { isStrongPassword } from '../utils/password.js';
import { apiFetch } from '../utils/apiClient.js';
import '../assets/AdminWalkthrough.css';

const CORE_STEPS = [
  { id: 'welcome', target: null, interactive: false },
  { id: 'warehouse', target: 'warehouse', interactive: true },
  { id: 'pits', target: 'pits', interactive: true },
  { id: 'drivers', target: 'drivers', interactive: true },
  { id: 'execute', target: 'drivers', interactive: true },
  { id: 'preview', target: 'preview', interactive: true },
  { id: 'planner', target: 'planner', interactive: true },
  { id: 'heat-settings', target: 'heat-settings', interactive: true },
];

const TOUR_STORAGE_KEY = (slug) => `hf_admin_tour_v2_${slug}`;
const SPOTLIGHT_PAD = 8;

function buildSteps(isFirstRun) {
  if (!isFirstRun) {
    return [...CORE_STEPS, { id: 'done', target: null, interactive: false }];
  }
  return [
    ...CORE_STEPS,
    { id: 'security', target: null, interactive: false },
    { id: 'done', target: null, interactive: false },
  ];
}

export function isAdminTourDone(trackSlug) {
  try {
    return localStorage.getItem(TOUR_STORAGE_KEY(trackSlug)) === '1'
      || localStorage.getItem(`hf_admin_tour_v1_${trackSlug}`) === '1';
  } catch {
    return false;
  }
}

export function markAdminTourDone(trackSlug) {
  try {
    localStorage.setItem(TOUR_STORAGE_KEY(trackSlug), '1');
  } catch {
    /* ignore */
  }
}

function TourCutout({ rect }) {
  const top = rect.top - SPOTLIGHT_PAD;
  const left = rect.left - SPOTLIGHT_PAD;
  const width = rect.width + SPOTLIGHT_PAD * 2;
  const height = rect.height + SPOTLIGHT_PAD * 2;

  return (
    <>
      <div className="admin-tour-shade" style={{ top: 0, left: 0, right: 0, height: Math.max(0, top) }} />
      <div className="admin-tour-shade" style={{ top, left: 0, width: Math.max(0, left), height }} />
      <div className="admin-tour-shade" style={{ top, left: left + width, right: 0, height }} />
      <div className="admin-tour-shade" style={{ top: top + height, left: 0, right: 0, bottom: 0 }} />
      <div className="admin-tour-spotlight-ring" style={{ top, left, width, height }} aria-hidden />
    </>
  );
}

export default function AdminWalkthrough({
  trackSlug,
  isFirstRun = false,
  onStepChange,
  onComplete,
}) {
  const { t, dir } = useLanguage();
  const { showAlert } = useDialog();
  const steps = useMemo(() => buildSteps(isFirstRun), [isFirstRun]);
  const [stepIndex, setStepIndex] = useState(0);
  const [spotlight, setSpotlight] = useState(null);
  const [saving, setSaving] = useState(false);

  const [enforceSecurity, setEnforceSecurity] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const step = steps[stepIndex];
  const stepId = step.id;

  const updateSpotlight = useCallback(() => {
    if (!step.target) {
      setSpotlight(null);
      return;
    }
    const el = document.querySelector(`[data-tour="${step.target}"]`);
    if (!el) {
      setSpotlight(null);
      return;
    }
    const domRect = el.getBoundingClientRect();
    setSpotlight({
      top: domRect.top,
      left: domRect.left,
      width: domRect.width,
      height: domRect.height,
    });
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [step.target]);

  useLayoutEffect(() => {
    onStepChange?.(stepId, stepIndex);
    const timer = window.setTimeout(updateSpotlight, 120);
    return () => window.clearTimeout(timer);
  }, [stepId, stepIndex, onStepChange, updateSpotlight]);

  useEffect(() => {
    window.addEventListener('resize', updateSpotlight);
    window.addEventListener('scroll', updateSpotlight, true);
    return () => {
      window.removeEventListener('resize', updateSpotlight);
      window.removeEventListener('scroll', updateSpotlight, true);
    };
  }, [updateSpotlight]);

  const submitFirstRunSetup = async (skipped = false) => {
    setSaving(true);
    try {
      const res = await apiFetch('/api/admin/track-setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trackSlug,
          kartNumbers: '',
          editPassword: (!skipped && enforceSecurity) ? password : '',
        }),
      }, trackSlug);
      const data = await res.json();
      if (!data.success) {
        showAlert(t('admin_alert_server_error'));
        return false;
      }
      return true;
    } catch {
      showAlert(t('admin_alert_server_error'));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const finish = async (skipped = false) => {
    if (isFirstRun) {
      if (!skipped && enforceSecurity) {
        if (!isStrongPassword(password)) {
          showAlert(t('admin_password_weak'));
          return;
        }
        if (password !== confirmPassword) {
          showAlert(t('admin_setup_password_mismatch'));
          return;
        }
      }
      const ok = await submitFirstRunSetup(skipped);
      if (!ok) return;
      onComplete?.({
        hasPassword: !skipped && enforceSecurity,
        skipped,
      });
    } else {
      onComplete?.({ skipped });
    }
    markAdminTourDone(trackSlug);
  };

  const validateSecurityStep = () => {
    if (!enforceSecurity) return true;
    if (!isStrongPassword(password)) {
      showAlert(t('admin_password_weak'));
      return false;
    }
    if (password !== confirmPassword) {
      showAlert(t('admin_setup_password_mismatch'));
      return false;
    }
    return true;
  };

  const next = async () => {
    if (stepId === 'security' && !validateSecurityStep()) return;

    if (stepIndex >= steps.length - 1) {
      await finish(false);
      return;
    }
    setStepIndex((i) => i + 1);
  };

  const isLast = stepIndex >= steps.length - 1;
  const hasSpotlight = Boolean(spotlight);
  const isInteractive = step.interactive && hasSpotlight;
  const isFormStep = stepId === 'security';

  return (
    <div className="admin-tour-root" dir={dir} role="dialog" aria-modal="true" aria-labelledby="admin-tour-title">
      {isInteractive ? (
        <TourCutout rect={spotlight} />
      ) : (
        <div className="admin-tour-overlay" aria-hidden />
      )}
      <div
        className={[
          'admin-tour-card',
          hasSpotlight ? 'has-spotlight' : 'is-centered',
          isFormStep ? 'has-form' : '',
        ].filter(Boolean).join(' ')}
      >
        <p className="admin-tour-step-label">
          {t('admin_tour_step_of', { current: stepIndex + 1, total: steps.length })}
        </p>
        <h2 id="admin-tour-title">{t(`admin_tour_${stepId}_title`)}</h2>
        <p className="admin-tour-body">{t(`admin_tour_${stepId}_body`)}</p>

        {stepId === 'security' && (
          <div className="admin-tour-form">
            <div className="security-toggle-row admin-tour-toggle-row">
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
                <label className="admin-tour-field">
                  <span>{t('admin_setup_password')}</span>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
                </label>
                <label className="admin-tour-field">
                  <span>{t('admin_setup_confirm')}</span>
                  <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
                </label>
                <p className="admin-tour-field-hint">{t('admin_password_rules')}</p>
              </>
            )}
            {!enforceSecurity && (
              <p className="admin-tour-field-hint">{t('admin_password_rules_optional')}</p>
            )}
          </div>
        )}

        {isInteractive && (
          <p className="admin-tour-try-hint">{t('admin_tour_try_hint')}</p>
        )}
        <div className="admin-tour-actions">
          <button type="button" className="admin-tour-btn admin-tour-btn-skip" onClick={() => finish(true)} disabled={saving}>
            {t('admin_tour_skip')}
          </button>
          <button type="button" className="admin-tour-btn admin-tour-btn-next" onClick={next} disabled={saving}>
            {saving ? t('admin_track_planner_saving') : (isLast ? t('admin_tour_finish') : t('admin_tour_next'))}
          </button>
        </div>
      </div>
    </div>
  );
}
