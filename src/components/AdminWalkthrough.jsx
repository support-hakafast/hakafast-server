import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import '../assets/AdminWalkthrough.css';

const STEP_IDS = ['welcome', 'warehouse', 'pits', 'drivers', 'execute', 'preview', 'planner', 'heat-settings', 'done'];

const TOUR_STORAGE_KEY = (slug) => `hf_admin_tour_v1_${slug}`;

export function isAdminTourDone(trackSlug) {
  try {
    return localStorage.getItem(TOUR_STORAGE_KEY(trackSlug)) === '1';
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

export default function AdminWalkthrough({ trackSlug, onStepChange, onComplete }) {
  const { t, dir } = useLanguage();
  const [stepIndex, setStepIndex] = useState(0);
  const [spotlight, setSpotlight] = useState(null);
  const stepId = STEP_IDS[stepIndex];

  const updateSpotlight = useCallback(() => {
    if (stepId === 'welcome' || stepId === 'done') {
      setSpotlight(null);
      return;
    }
    const el = document.querySelector(`[data-tour="${stepId}"]`);
    if (!el) {
      setSpotlight(null);
      return;
    }
    const rect = el.getBoundingClientRect();
    setSpotlight({
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    });
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [stepId]);

  useLayoutEffect(() => {
    onStepChange?.(stepId, stepIndex);
    const timer = window.setTimeout(updateSpotlight, 100);
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

  const finish = () => {
    markAdminTourDone(trackSlug);
    onComplete?.();
  };

  const next = () => {
    if (stepIndex >= STEP_IDS.length - 1) {
      finish();
      return;
    }
    setStepIndex((i) => i + 1);
  };

  const isLast = stepIndex >= STEP_IDS.length - 1;

  return (
    <div className="admin-tour-root" dir={dir} role="dialog" aria-modal="true" aria-labelledby="admin-tour-title">
      <div className="admin-tour-overlay" aria-hidden />
      {spotlight && (
        <div
          className="admin-tour-spotlight"
          style={{
            top: spotlight.top - 8,
            left: spotlight.left - 8,
            width: spotlight.width + 16,
            height: spotlight.height + 16,
          }}
        />
      )}
      <div className={`admin-tour-card${spotlight ? ' has-spotlight' : ' is-centered'}`}>
        <p className="admin-tour-step-label">
          {t('admin_tour_step_of', { current: stepIndex + 1, total: STEP_IDS.length })}
        </p>
        <h2 id="admin-tour-title">{t(`admin_tour_${stepId}_title`)}</h2>
        <p className="admin-tour-body">{t(`admin_tour_${stepId}_body`)}</p>
        <div className="admin-tour-actions">
          <button type="button" className="btn-muted" onClick={finish}>
            {t('admin_tour_skip')}
          </button>
          <button type="button" className="btn-preview" onClick={next}>
            {isLast ? t('admin_tour_finish') : t('admin_tour_next')}
          </button>
        </div>
      </div>
    </div>
  );
}
