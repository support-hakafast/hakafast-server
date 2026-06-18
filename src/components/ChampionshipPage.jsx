import React, { useState, useEffect, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import HakafastLogo from './HakafastLogo.jsx';
import LanguageSwitcher from './LanguageSwitcher.jsx';
import ProRaceEventModal from './ProRaceEventModal.jsx';
import {
  createChampionship,
  createRound,
  createDivision,
  createSession,
  computeStandings,
  computeOfficialStandings,
  computeDivisionStandings,
  computeOverallStandings,
  exportStandingsCsv,
  resultsFromHeatHistory,
  parseRoundResultsCsv,
  normalizeChampionship,
  DEFAULT_POINTS_TABLES,
} from '../utils/championshipHelpers.js';
import { COUNTRIES, countryFlag } from '../data/countries.js';
import '../assets/AdminPanel.css';
import '../assets/ChampionshipPage.css';

function downloadTextFile(filename, content) {
  const blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function sessionKey(id) { return `hf_champ_auth_${id}`; }
function sessionPwKey(id) { return `hf_champ_pw_${id}`; }
function readSession(id) { try { return sessionStorage.getItem(sessionKey(id)) === 'true'; } catch { return false; } }
function readSessionPw(id) { try { return sessionStorage.getItem(sessionPwKey(id)) || ''; } catch { return ''; } }
function writeSession(id, v, pw) {
  try {
    sessionStorage.setItem(sessionKey(id), v ? 'true' : '');
    if (pw) sessionStorage.setItem(sessionPwKey(id), pw);
  } catch {}
}

// ── Venue list editor (in championship settings) ──────────────────────────────
function VenuesEditor({ venues, onChange, t }) {
  const [newName, setNewName] = useState('');
  const [newSlug, setNewSlug] = useState('');

  function add() {
    const name = newName.trim();
    if (!name) return;
    const slug = newSlug.trim() || name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    if (venues.some((v) => v.slug === slug || v.name.toLowerCase() === name.toLowerCase())) return;
    onChange([...venues, { name, slug }]);
    setNewName(''); setNewSlug('');
  }

  function remove(i) { onChange(venues.filter((_, idx) => idx !== i)); }

  return (
    <div className="cp-venues-editor">
      <div className="cp-section-label" style={{ marginBottom: '0.4rem' }}>
        📍 {t('champ_venues_label')}
        <span style={{ fontWeight: 400, fontSize: '0.78em', marginInlineStart: '0.5rem', opacity: 0.7 }}>{t('champ_venues_hint')}</span>
      </div>
      {venues.length === 0 && <p className="cp-empty" style={{ marginBottom: '0.4rem' }}>{t('champ_venues_empty')}</p>}
      <div className="cp-venues-list">
        {venues.map((v, i) => (
          <div key={i} className="cp-venue-row">
            <span className="cp-venue-name">{v.name}</span>
            {v.slug && <span className="cp-venue-slug">{v.slug}</span>}
            <button type="button" className="cp-mv-btn cp-del-btn" onClick={() => remove(i)}>✕</button>
          </div>
        ))}
      </div>
      <div className="cp-venues-add-row">
        <input type="text" dir="auto" value={newName} onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
          placeholder={t('champ_venue_name_ph')} className="cp-venue-name-input" />
        <input type="text" dir="ltr" value={newSlug} onChange={(e) => setNewSlug(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
          placeholder={t('champ_venue_slug_ph')} className="cp-venue-slug-input" />
        <button type="button" className="cp-tool-btn" onClick={add} disabled={!newName.trim()}>
          {t('champ_venue_add')}
        </button>
      </div>
    </div>
  );
}

// ── Points table editor (editor-only) ────────────────────────────────────────
function PointsTableEditor({ value, onChange, t }) {
  const [text, setText] = useState(value.join(', '));
  useEffect(() => { setText(value.join(', ')); }, [value]);

  const presets = [
    { key: 'classic', label: t('champ_preset_classic') },
    { key: 'karting', label: t('champ_preset_karting') },
    { key: 'f1', label: t('champ_preset_f1') },
    { key: 'top5', label: t('champ_preset_top5') },
    { key: 'simple', label: t('champ_preset_podium') },
  ];

  function commit(raw) {
    const pts = raw.split(/[,;\s]+/).map((s) => parseInt(s.trim(), 10)).filter((n) => !Number.isNaN(n) && n >= 0);
    if (pts.length) onChange(pts);
  }

  return (
    <div className="cp-points-editor">
      <div className="cp-points-presets">
        {presets.map(({ key, label }) => (
          <button key={key} type="button"
            className={`cp-preset-btn${JSON.stringify(value) === JSON.stringify(DEFAULT_POINTS_TABLES[key]) ? ' is-active' : ''}`}
            onClick={() => { onChange(DEFAULT_POINTS_TABLES[key]); setText(DEFAULT_POINTS_TABLES[key].join(', ')); }}
          >{label}</button>
        ))}
      </div>
      <label className="cp-field">
        <span>{t('champ_points_custom_label')}</span>
        <input type="text" value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          placeholder={t('champ_points_custom_ph')}
        />
      </label>
      <div className="cp-pts-preview">
        {value.map((pts, i) => <span key={i} className="cp-pts-chip">P{i + 1}={pts}</span>)}
      </div>
    </div>
  );
}

// ── Driver/team row in round editor ──────────────────────────────────────────
function DriverRow({ driver, index, isEndurance, onUpdate, onRemove, onMoveUp, onMoveDown, total, t }) {
  return (
    <li className="cp-result-row">
      <span className="cp-result-pos">{index + 1}</span>
      <input type="text" dir="auto" className="cp-result-name"
        value={driver.name}
        onChange={(e) => onUpdate({ ...driver, name: e.target.value })}
        placeholder={isEndurance ? t('champ_add_team_ph') : t('champ_add_driver_ph')}
        autoComplete="off"
      />
      {!isEndurance && (
        <>
          <select className="cp-result-nation" value={driver.nationality || ''}
            onChange={(e) => onUpdate({ ...driver, nationality: e.target.value })}>
            <option value="">—</option>
            {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{countryFlag(c.code)} {c.name}</option>)}
          </select>
          <input type="text" dir="ltr" className="cp-result-kart"
            value={driver.kartNumber || ''}
            onChange={(e) => onUpdate({ ...driver, kartNumber: e.target.value })}
            placeholder={t('champ_kart_ph')}
          />
        </>
      )}
      {isEndurance && (
        <input type="text" dir="auto" className="cp-result-drivers"
          value={(driver.drivers || []).join(', ')}
          onChange={(e) => onUpdate({ ...driver, drivers: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
          placeholder={t('champ_drivers_ph')}
        />
      )}
      <div className="cp-result-btns">
        <button type="button" className="cp-mv-btn" onClick={onMoveUp} disabled={index === 0}>↑</button>
        <button type="button" className="cp-mv-btn" onClick={onMoveDown} disabled={index === total - 1}>↓</button>
        <button type="button" className="cp-mv-btn cp-del-btn" onClick={onRemove}>✕</button>
      </div>
    </li>
  );
}

// Returns true when results may be entered: event date must be yesterday or earlier
function canEnterResults(dateStr) {
  if (!dateStr) return false;
  const eventDay = new Date(dateStr + 'T00:00:00');
  const tomorrow = new Date();
  tomorrow.setHours(0, 0, 0, 0);
  return eventDay < tomorrow; // strictly before today = at least 1 day ago
}

// Collect every unique participant name across all rounds of the championship
function collectKnownParticipants(championship) {
  const names = new Set();
  for (const r of championship.rounds || []) {
    for (const res of r.results || []) {
      if (res.name) names.add(res.name);
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

const SESSION_TYPE_KEYS = [
  { key: 'practice', tKey: 'champ_session_type_practice', emoji: '🔄' },
  { key: 'qualifying', tKey: 'champ_session_type_qualifying', emoji: '⏱' },
  { key: 'race', tKey: 'champ_session_type_race', emoji: '🏁' },
  { key: 'ironcut', tKey: 'champ_session_type_ironcut', emoji: '⏳' },
];
// Resolved with actual labels at render time (needs t)
const SESSION_TYPES = SESSION_TYPE_KEYS; // kept for backward compat — use tKey

function SessionsEditor({ sessions, onChange, roundDate, isMultiDay, championship, t }) {
  function addSession(type = 'practice') {
    const label = t(SESSION_TYPE_KEYS.find((x) => x.key === type)?.tKey || 'champ_session_type_practice');
    onChange([...sessions, createSession({ type, label, sessionDate: roundDate || null, durationMinutes: type === 'race' ? 60 : 15 })]);
  }
  function updateSession(i, patch) {
    onChange(sessions.map((s, idx) => idx === i ? { ...s, ...patch } : s));
  }
  function removeSession(i) {
    onChange(sessions.filter((_, idx) => idx !== i));
  }
  function moveSession(i, dir) {
    const next = [...sessions];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  }

  const gridOptions = [];
  if (championship.scope === 'multi-league' && (championship.divisions || []).length > 0) {
    for (const div of championship.divisions) {
      gridOptions.push({ value: `div:${div.id}`, label: `${t('champ_grid_from_league')}: ${div.name}` });
    }
    gridOptions.push({ value: 'overall', label: t('champ_grid_from_overall') });
  } else {
    gridOptions.push({ value: 'main', label: t('champ_grid_from_standings') });
  }

  return (
    <div className="cp-sessions-editor">
      <div className="cp-section-label" style={{ marginBottom: '0.4rem' }}>📋 {t('champ_session_label')}</div>
      {sessions.length === 0 && (
        <p className="cp-empty" style={{ marginBottom: '0.4rem' }}>{t('champ_session_empty')}</p>
      )}
      {sessions.map((s, i) => {
        const typeInfo = SESSION_TYPE_KEYS.find((x) => x.key === s.type) || SESSION_TYPE_KEYS[0];
        const isPractice = s.type === 'practice';
        const isQual = s.type === 'qualifying';
        const showDate = isMultiDay;
        return (
          <div key={s.id} className="cp-session-row">
            <div className="cp-session-row-top">
              <select value={s.type} onChange={(e) => updateSession(i, { type: e.target.value })} className="cp-session-type-sel">
                {SESSION_TYPE_KEYS.map((x) => <option key={x.key} value={x.key}>{x.emoji} {t(x.tKey)}</option>)}
              </select>
              <input type="text" dir="auto" value={s.label} onChange={(e) => updateSession(i, { label: e.target.value })}
                placeholder={t(typeInfo.tKey)} className="cp-session-label-input" />
              {showDate && (
                <input type="date" value={s.sessionDate || ''} onChange={(e) => updateSession(i, { sessionDate: e.target.value || null })}
                  className="cp-session-date-input" title={t('champ_session_day')} />
              )}
              {!isPractice && (
                <>
                  <input type="time" value={s.startTime} onChange={(e) => updateSession(i, { startTime: e.target.value })}
                    className="cp-session-time-input" />
                  <input type="number" min={1} max={1440} value={s.durationMinutes}
                    onChange={(e) => updateSession(i, { durationMinutes: parseInt(e.target.value, 10) || 15 })}
                    className="cp-session-dur-input" />
                  <span className="cp-session-dur-label">{t('champ_session_duration')}</span>
                </>
              )}
              <div className="cp-session-btns">
                <button type="button" className="cp-mv-btn" onClick={() => moveSession(i, -1)} disabled={i === 0}>↑</button>
                <button type="button" className="cp-mv-btn" onClick={() => moveSession(i, 1)} disabled={i === sessions.length - 1}>↓</button>
                <button type="button" className="cp-mv-btn cp-del-btn" onClick={() => removeSession(i)}>✕</button>
              </div>
            </div>

            {isPractice && (
              <div className="cp-session-practice-detail">
                <div className="cp-session-window-row">
                  <label className="cp-session-mini-field">
                    <span>{t('champ_practice_open')}</span>
                    <input type="time" value={s.openTime || ''} onChange={(e) => updateSession(i, { openTime: e.target.value })} className="cp-session-time-input" />
                  </label>
                  <label className="cp-session-mini-field">
                    <span>{t('champ_practice_close')}</span>
                    <input type="time" value={s.closeTime || ''} onChange={(e) => updateSession(i, { closeTime: e.target.value })} className="cp-session-time-input" />
                  </label>
                  <label className="cp-session-mini-field">
                    <span>{t('champ_practice_stint')}</span>
                    <input type="number" min={1} max={120} value={s.stintDurationMinutes || ''} placeholder="—"
                      onChange={(e) => updateSession(i, { stintDurationMinutes: parseInt(e.target.value, 10) || null })}
                      className="cp-session-dur-input" />
                    <span className="cp-session-dur-label">{t('champ_session_duration')}</span>
                  </label>
                  <label className="cp-session-mini-field">
                    <span>{t('champ_practice_rest')}</span>
                    <input type="number" min={0} max={30} value={s.restBetweenStintsMinutes ?? 5}
                      onChange={(e) => updateSession(i, { restBetweenStintsMinutes: parseInt(e.target.value, 10) || 0 })}
                      className="cp-session-dur-input" />
                    <span className="cp-session-dur-label">{t('champ_session_duration')}</span>
                  </label>
                </div>
                <div className="cp-session-breaks">
                  {(s.breaks || []).map((brk, bi) => (
                    <div key={bi} className="cp-session-break-row">
                      <span className="cp-break-label-icon">☕</span>
                      <input type="text" dir="auto" value={brk.label || ''} placeholder={t('champ_break_label_ph')}
                        onChange={(e) => { const nb = [...(s.breaks || [])]; nb[bi] = { ...nb[bi], label: e.target.value }; updateSession(i, { breaks: nb }); }}
                        className="cp-session-label-input" />
                      <input type="time" value={brk.startTime || ''}
                        onChange={(e) => { const nb = [...(s.breaks || [])]; nb[bi] = { ...nb[bi], startTime: e.target.value }; updateSession(i, { breaks: nb }); }}
                        className="cp-session-time-input" />
                      <span className="cp-session-dur-label">→</span>
                      <input type="time" value={brk.endTime || ''}
                        onChange={(e) => { const nb = [...(s.breaks || [])]; nb[bi] = { ...nb[bi], endTime: e.target.value }; updateSession(i, { breaks: nb }); }}
                        className="cp-session-time-input" />
                      <button type="button" className="cp-mv-btn cp-del-btn"
                        onClick={() => updateSession(i, { breaks: (s.breaks || []).filter((_, ii) => ii !== bi) })}>✕</button>
                    </div>
                  ))}
                  <button type="button" className="cp-session-add-chip"
                    onClick={() => updateSession(i, { breaks: [...(s.breaks || []), { label: '', startTime: '', endTime: '' }] })}>
                    ☕ {t('champ_break_add')}
                  </button>
                </div>
              </div>
            )}

            {isQual && (
              <div className="cp-session-qual-detail">
                <div className="cp-qual-mode-row">
                  <span className="cp-session-dur-label">{t('champ_qual_mode_label')}</span>
                  {[
                    { key: 'time', label: t('champ_qual_mode_time') },
                    { key: 'laps', label: t('champ_qual_mode_laps') },
                  ].map(({ key, label: lbl }) => (
                    <button key={key} type="button"
                      className={`cp-qual-mode-btn${(s.qualifyingMode || 'time') === key ? ' is-active' : ''}`}
                      onClick={() => updateSession(i, { qualifyingMode: key })}>
                      {lbl}
                    </button>
                  ))}
                  {(s.qualifyingMode === 'laps') && (
                    <label className="cp-session-opt">
                      <input type="number" min={1} max={30} value={s.qualifyingLaps || ''}
                        onChange={(e) => updateSession(i, { qualifyingLaps: parseInt(e.target.value, 10) || null })}
                        className="cp-session-dur-input" placeholder="—" />
                      <span className="cp-session-dur-label">{t('champ_qual_laps_unit')}</span>
                    </label>
                  )}
                </div>
              </div>
            )}

            <div className="cp-session-row-opts">
              <label className="cp-session-opt">
                <input type="checkbox" checked={Boolean(s.kartTransporter)} onChange={(e) => updateSession(i, { kartTransporter: e.target.checked })} />
                <span>🔄 {t('champ_session_kart_transporter')}</span>
              </label>
              {(s.type === 'race' || s.type === 'qualifying') && (
                <label className="cp-session-opt">
                  <span>{t('champ_session_grid_order')}</span>
                  <select value={s.gridFromStandings || ''} onChange={(e) => updateSession(i, { gridFromStandings: e.target.value || null })} className="cp-session-grid-sel">
                    <option value="">{t('champ_session_grid_manual')}</option>
                    {gridOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </label>
              )}
              <input type="text" dir="auto" value={s.notes || ''} onChange={(e) => updateSession(i, { notes: e.target.value })}
                placeholder={t('champ_session_notes_ph')} className="cp-session-notes" />
            </div>
          </div>
        );
      })}
      <div className="cp-sessions-add-row">
        {SESSION_TYPE_KEYS.map((x) => (
          <button key={x.key} type="button" className="cp-session-add-chip" onClick={() => addSession(x.key)}>
            {x.emoji} {t(x.tKey)}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Track field: dropdown when venues saved, plain input otherwise ────────────
function TrackField({ venues, trackSlug, setTrackSlug, t }) {
  if (!venues.length) {
    return (
      <label className="cp-field">
        <span>{t('champ_round_track')}</span>
        <input type="text" dir="ltr" value={trackSlug} onChange={(e) => setTrackSlug(e.target.value)} placeholder="track-slug" />
      </label>
    );
  }
  const venueMatch = venues.some((v) => v.slug === trackSlug);
  const isCustom = Boolean(trackSlug && !venueMatch);
  const selectVal = isCustom ? '__custom__' : (trackSlug || '');
  return (
    <label className="cp-field">
      <span>{t('champ_round_track')}</span>
      <div className="cp-track-field-row">
        <select
          value={selectVal}
          onChange={(e) => {
            if (e.target.value === '__custom__') setTrackSlug('');
            else setTrackSlug(e.target.value);
          }}
          className="cp-field-select"
        >
          <option value="">{t('champ_venue_select_ph')}</option>
          {venues.map((v, i) => (
            <option key={i} value={v.slug}>{v.name}{v.slug ? ` (${v.slug})` : ''}</option>
          ))}
          <option value="__custom__">{t('champ_venue_custom')}</option>
        </select>
        {isCustom && (
          <input type="text" dir="ltr" value={trackSlug} onChange={(e) => setTrackSlug(e.target.value)}
            placeholder="track-slug" className="cp-venue-slug-input" autoFocus />
        )}
      </div>
    </label>
  );
}

// ── Round setup wizard ────────────────────────────────────────────────────────
function RoundWizard({ championship, onFinish, onSkip, t }) {
  const steps = ['basic', 'type', 'sessions', 'confirm'];
  const [step, setStep] = useState(0);
  const [label, setLabel] = useState('');
  const [date, setDate] = useState('');
  const [isMultiDay, setIsMultiDay] = useState(false);
  const [endDate, setEndDate] = useState('');
  const [trackSlug, setTrackSlug] = useState('');
  const [raceType, setRaceType] = useState('sprint');
  const [maxKarts, setMaxKarts] = useState('');
  const [aiFormatNotes, setAiFormatNotes] = useState('');
  const [sessionTypes, setSessionTypes] = useState({ practice: false, qualifying: false, race: true });

  const venues = championship.venues || [];

  function toggleType(k) { setSessionTypes((p) => ({ ...p, [k]: !p[k] })); }

  function buildSessions() {
    const out = [];
    if (sessionTypes.practice) out.push(createSession({ type: 'practice', label: t('champ_session_type_practice'), sessionDate: date || null, durationMinutes: 120 }));
    if (sessionTypes.qualifying) out.push(createSession({ type: 'qualifying', label: t('champ_session_type_qualifying'), sessionDate: isMultiDay ? endDate || date : date, durationMinutes: 20, qualifyingMode: 'time' }));
    if (sessionTypes.race) out.push(createSession({ type: 'race', label: t('champ_session_type_race'), sessionDate: isMultiDay ? endDate || date : date, durationMinutes: 60 }));
    return out;
  }

  const stepKey = steps[step];

  return (
    <div className="cp-wizard">
      <div className="cp-wizard-header">
        <div className="cp-wizard-steps">
          {steps.map((s, i) => (
            <div key={s} className={`cp-wizard-step${i === step ? ' is-active' : i < step ? ' is-done' : ''}`}>{i + 1}</div>
          ))}
        </div>
        <button type="button" className="cp-wizard-skip" onClick={onSkip}>{t('champ_wizard_skip')}</button>
      </div>

      {stepKey === 'basic' && (
        <div className="cp-wizard-body">
          <h3 className="cp-wizard-q">{t('champ_wizard_q_basic')}</h3>
          <label className="cp-field">
            <span>{t('champ_round_label')}</span>
            <input type="text" dir="auto" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t('champ_round_label_ph')} autoFocus />
          </label>
          <label className="cp-field">
            <span>{t('champ_round_date_start')}</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="cp-multiday-check">
            <input type="checkbox" checked={isMultiDay} onChange={(e) => { setIsMultiDay(e.target.checked); if (!e.target.checked) setEndDate(''); }} />
            <span>📅 {t('champ_round_multiday')}</span>
          </label>
          {isMultiDay && (
            <label className="cp-field">
              <span>{t('champ_round_date_end')}</span>
              <input type="date" value={endDate} min={date || undefined} onChange={(e) => setEndDate(e.target.value)} />
            </label>
          )}
          {venues.length > 0 ? (
            <label className="cp-field">
              <span>{t('champ_round_track')}</span>
              <select value={trackSlug} onChange={(e) => setTrackSlug(e.target.value)} className="cp-field-select">
                <option value="">{t('champ_venue_select_ph')}</option>
                {venues.map((v, i) => <option key={i} value={v.slug}>{v.name}</option>)}
              </select>
            </label>
          ) : (
            <label className="cp-field">
              <span>{t('champ_round_track')}</span>
              <input type="text" dir="ltr" value={trackSlug} onChange={(e) => setTrackSlug(e.target.value)} placeholder="track-slug" />
            </label>
          )}
        </div>
      )}

      {stepKey === 'type' && (
        <div className="cp-wizard-body">
          <h3 className="cp-wizard-q">{t('champ_wizard_q_type')}</h3>
          <div className="cp-racetype-tabs" style={{ marginBottom: '1rem' }}>
            {[
              { key: 'sprint', label: t('champ_racetype_sprint'), cls: 'rt-sprint' },
              { key: 'endurance-team', label: t('champ_racetype_endurance_team'), cls: 'rt-endurance-team' },
              { key: 'endurance-solo', label: t('champ_racetype_endurance_solo'), cls: 'rt-endurance-solo' },
              { key: 'best-lap', label: t('champ_racetype_best_lap'), cls: 'rt-best-lap' },
            ].map(({ key, label: lbl, cls }) => (
              <button key={key} type="button" className={`cp-racetype-tab ${cls}${raceType === key ? ' is-active' : ''}`} onClick={() => setRaceType(key)}>{lbl}</button>
            ))}
          </div>
          <label className="cp-field">
            <span>{t('champ_round_max_karts')}</span>
            <input type="number" min={1} max={50} value={maxKarts} onChange={(e) => setMaxKarts(e.target.value)} placeholder="—" className="cp-karts-input" />
          </label>
        </div>
      )}

      {stepKey === 'sessions' && (
        <div className="cp-wizard-body">
          <h3 className="cp-wizard-q">{t('champ_wizard_q_sessions')}</h3>
          <div className="cp-wizard-session-picks">
            {[
              { key: 'practice', emoji: '🔄', tKey: 'champ_session_type_practice' },
              { key: 'qualifying', emoji: '⏱', tKey: 'champ_session_type_qualifying' },
              { key: 'race', emoji: '🏁', tKey: 'champ_session_type_race' },
            ].map(({ key, emoji, tKey }) => (
              <label key={key} className={`cp-wizard-session-pick${sessionTypes[key] ? ' is-on' : ''}`}>
                <input type="checkbox" checked={Boolean(sessionTypes[key])} onChange={() => toggleType(key)} />
                <span>{emoji} {t(tKey)}</span>
              </label>
            ))}
          </div>
          <div className="cp-ai-format-block" style={{ marginTop: '0.75rem' }}>
            <label className="cp-ai-format-label">
              <span className="cp-ai-format-icon">🤖</span>
              <span>{t('champ_ai_format_label')}</span>
            </label>
            <textarea dir="auto" value={aiFormatNotes} onChange={(e) => setAiFormatNotes(e.target.value)}
              placeholder={t('champ_ai_format_ph')} className="cp-ai-format-textarea" rows={2} />
          </div>
        </div>
      )}

      {stepKey === 'confirm' && (
        <div className="cp-wizard-body">
          <h3 className="cp-wizard-q">{t('champ_wizard_q_confirm')}</h3>
          <ul className="cp-wizard-summary">
            <li><strong>{t('champ_round_label')}:</strong> {label || '—'}</li>
            <li><strong>{t('champ_round_date_start')}:</strong> {date || '—'}{isMultiDay && endDate ? ` → ${endDate}` : ''}</li>
            <li><strong>{t('champ_round_track')}:</strong> {trackSlug || '—'}</li>
            <li><strong>{t('champ_racetype_label')}:</strong> {raceType}</li>
            {maxKarts && <li><strong>{t('champ_round_max_karts')}:</strong> {maxKarts}</li>}
            <li><strong>{t('champ_session_label')}:</strong> {Object.entries(sessionTypes).filter(([, v]) => v).map(([k]) => k).join(', ') || '—'}</li>
          </ul>
        </div>
      )}

      <div className="cp-wizard-footer">
        {step > 0 && <button type="button" className="cp-btn-ghost" onClick={() => setStep((s) => s - 1)}>{t('champ_wizard_back')}</button>}
        {step < steps.length - 1 && (
          <button type="button" className="cp-btn-primary" onClick={() => setStep((s) => s + 1)}>{t('champ_wizard_next')}</button>
        )}
        {step === steps.length - 1 && (
          <button type="button" className="cp-btn-primary" onClick={() => onFinish({ label, date, endDate: isMultiDay ? endDate : '', trackSlug, raceType, maxKarts, aiFormatNotes, sessions: buildSessions() })}>
            {t('champ_wizard_create')}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Round editor panel (editor-only) ─────────────────────────────────────────
function RoundEditor({ round, championship, heatHistory, onSave, onCancel, t }) {
  const [label, setLabel] = useState(round.label || '');
  const [date, setDate] = useState(round.date || '');
  const [endDate, setEndDate] = useState(round.endDate || '');
  const [isMultiDay, setIsMultiDay] = useState(Boolean(round.endDate && round.endDate !== round.date));
  const [time, setTime] = useState(round.time || '');
  const [trackSlug, setTrackSlug] = useState(round.trackSlug || '');
  const [isOfficial, setIsOfficial] = useState(round.isOfficial !== false);
  const [showUnofficialConfirm, setShowUnofficialConfirm] = useState(false);
  const [showWizard, setShowWizard] = useState(!round.id);
  const [raceType, setRaceType] = useState(round.raceType || 'sprint');
  const [divisionId, setDivisionId] = useState(round.divisionId || null);
  const [sessions, setSessions] = useState(round.sessions || []);
  const [maxKarts, setMaxKarts] = useState(round.maxKarts || '');
  const [aiFormatNotes, setAiFormatNotes] = useState(round.aiFormatNotes || '');
  const isMultiLeague = championship.scope === 'multi-league' && (championship.divisions || []).length > 0;
  const [results, setResults] = useState(() =>
    (round.results || []).map((r) => ({ ...r, nationality: r.nationality || '', kartNumber: r.kartNumber || '' }))
  );
  const [csvText, setCsvText] = useState('');
  const [csvMode, setCsvMode] = useState(false);
  const [addName, setAddName] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const isEndurance = raceType === 'endurance-team';

  // Results are locked until the day after the event
  const resultsUnlocked = canEnterResults(date);
  const knownParticipants = collectKnownParticipants(championship);
  const addInputId = `cp-add-input-${round.id || 'new'}`;

  const filteredSuggestions = addName.trim().length > 0
    ? knownParticipants.filter((n) =>
        n.toLowerCase().includes(addName.toLowerCase()) &&
        !results.some((r) => r.name === n)
      )
    : [];

  function addResult(name) {
    const n = (name || addName).trim();
    if (!n) return;
    setResults((prev) => [...prev, { name: n, position: prev.length + 1, nationality: '', kartNumber: '', ...(isEndurance ? { drivers: [] } : {}) }]);
    setAddName(''); setSuggestions([]);
  }
  function updateResult(i, updated) {
    setResults((prev) => prev.map((r, idx) => idx === i ? { ...updated, position: idx + 1 } : r));
  }
  function removeResult(i) {
    setResults((prev) => prev.filter((_, idx) => idx !== i).map((r, idx) => ({ ...r, position: idx + 1 })));
  }
  function moveResult(i, dir) {
    setResults((prev) => {
      const next = [...prev]; const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next.map((r, idx) => ({ ...r, position: idx + 1 }));
    });
  }
  function applyCSV() {
    const parsed = parseRoundResultsCsv(csvText);
    if (parsed.length) {
      setResults(parsed.map((r) => ({ ...r, nationality: '', kartNumber: '', ...(isEndurance ? { drivers: [] } : {}) })));
      setCsvMode(false); setCsvText('');
    }
  }
  function importFromHeat(entry) {
    const res = resultsFromHeatHistory(entry, championship.type);
    setResults(res.map((r) => ({ ...r, nationality: '', kartNumber: '', ...(isEndurance ? { drivers: r.drivers || [] } : {}) })));
  }

  if (showWizard) {
    return (
      <RoundWizard
        championship={championship}
        onFinish={(wizardData) => {
          if (wizardData.label) setLabel(wizardData.label);
          if (wizardData.date) setDate(wizardData.date);
          if (wizardData.endDate) { setEndDate(wizardData.endDate); setIsMultiDay(true); }
          if (wizardData.trackSlug) setTrackSlug(wizardData.trackSlug);
          if (wizardData.raceType) setRaceType(wizardData.raceType);
          if (wizardData.maxKarts) setMaxKarts(wizardData.maxKarts);
          if (wizardData.sessions?.length) setSessions(wizardData.sessions);
          if (wizardData.aiFormatNotes) setAiFormatNotes(wizardData.aiFormatNotes);
          setShowWizard(false);
        }}
        onSkip={() => setShowWizard(false)}
        t={t}
      />
    );
  }

  return (
    <div className="cp-round-editor">
      <div className="cp-round-editor-top">
        <h3 className="cp-round-editor-title">
          {round.label ? `${t('champ_round_edit')}: ${round.label}` : t('champ_add_round').replace('+ ', '')}
        </h3>
        <button type="button" className="cp-close-btn" onClick={onCancel}>×</button>
      </div>

      <div className="cp-round-fields">
        <label className="cp-field cp-field-full">
          <span>{t('champ_round_label')}</span>
          <input type="text" dir="auto" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t('champ_round_label_ph')} autoFocus />
        </label>
        <label className="cp-field">
          <span>{t('champ_round_date_start')}</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="cp-field cp-field-multiday-toggle">
          <span style={{ opacity: 0 }}>x</span>
          <label className="cp-multiday-check">
            <input type="checkbox" checked={isMultiDay} onChange={(e) => { setIsMultiDay(e.target.checked); if (!e.target.checked) setEndDate(''); }} />
            <span>📅 {t('champ_round_multiday')}</span>
          </label>
        </label>
        {isMultiDay && (
          <label className="cp-field">
            <span>{t('champ_round_date_end')}</span>
            <input type="date" value={endDate} min={date || undefined} onChange={(e) => setEndDate(e.target.value)} />
          </label>
        )}
        <label className="cp-field">
          <span>{t('champ_round_time')}</span>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
        <label className="cp-field">
          <span>{t('champ_round_max_karts')}</span>
          <input type="number" min={1} max={50} value={maxKarts} onChange={(e) => setMaxKarts(e.target.value)} placeholder="—" className="cp-karts-input" />
        </label>
        <TrackField
          venues={championship.venues || []}
          trackSlug={trackSlug}
          setTrackSlug={setTrackSlug}
          t={t}
        />
        {isMultiLeague && (
          <label className="cp-field">
            <span>{t('champ_round_division')}</span>
            <select value={divisionId || ''} onChange={(e) => setDivisionId(e.target.value || null)} className="cp-field-select">
              <option value="">{t('champ_round_division_main')}</option>
              {(championship.divisions || []).map((div) => (
                <option key={div.id} value={div.id}>{div.name}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="cp-ai-format-block">
        <label className="cp-ai-format-label">
          <span className="cp-ai-format-icon">🤖</span>
          <span>{t('champ_ai_format_label')}</span>
        </label>
        <textarea
          dir="auto"
          value={aiFormatNotes}
          onChange={(e) => setAiFormatNotes(e.target.value)}
          placeholder={t('champ_ai_format_ph')}
          className="cp-ai-format-textarea"
          rows={2}
        />
        {maxKarts && (
          <p className="cp-ai-karts-hint">
            {t('champ_ai_karts_hint', { karts: maxKarts })}
          </p>
        )}
      </div>

      <div className="cp-field-label">{t('champ_racetype_label')}</div>
      <div className="cp-racetype-tabs">
        {[
          { key: 'sprint', label: t('champ_racetype_sprint'), cls: 'rt-sprint' },
          { key: 'endurance-team', label: t('champ_racetype_endurance_team'), cls: 'rt-endurance-team' },
          { key: 'endurance-solo', label: t('champ_racetype_endurance_solo'), cls: 'rt-endurance-solo' },
          { key: 'best-lap', label: t('champ_racetype_best_lap'), cls: 'rt-best-lap' },
        ].map(({ key, label: lbl, cls }) => (
          <button key={key} type="button"
            className={`cp-racetype-tab ${cls}${raceType === key ? ' is-active' : ''}`}
            onClick={() => setRaceType(key)}>{lbl}</button>
        ))}
      </div>

      <div className={`cp-official-toggle-row${isOfficial ? ' is-official' : ' is-unofficial'}`}>
        <label className="cp-official-toggle">
          <input
            type="checkbox"
            checked={isOfficial}
            onChange={(e) => {
              if (!e.target.checked) setShowUnofficialConfirm(true);
              else setIsOfficial(true);
            }}
          />
          <span>{isOfficial ? '🏅' : '⚠'} {isOfficial ? t('champ_round_is_official') : t('champ_round_is_unofficial')}</span>
        </label>
        {!isOfficial && <span className="cp-unofficial-inline">{t('champ_unofficial_note')}</span>}
      </div>

      {showUnofficialConfirm && (
        <div className="cp-modal-overlay">
          <div className="cp-confirm-modal">
            <div className="cp-confirm-modal-icon">⚠</div>
            <h3 className="cp-confirm-modal-title">{t('champ_unofficial_confirm_title')}</h3>
            <p className="cp-confirm-modal-body">{t('champ_unofficial_confirm_body')}</p>
            <div className="cp-confirm-modal-actions">
              <button type="button" className="cp-btn-ghost" onClick={() => setShowUnofficialConfirm(false)}>
                {t('champ_unofficial_confirm_cancel')}
              </button>
              <button type="button" className="cp-btn-danger" onClick={() => { setIsOfficial(false); setShowUnofficialConfirm(false); }}>
                {t('champ_unofficial_confirm_ok')}
              </button>
            </div>
          </div>
        </div>
      )}

      <SessionsEditor sessions={sessions} onChange={setSessions} roundDate={date} isMultiDay={isMultiDay} championship={championship} t={t} />

      {/* Results section — locked until day after event */}
      <div className="cp-results-section">
        <div className="cp-results-toolbar">
          <span className="cp-section-label">
            {t('champ_results_label')} — {results.length} {isEndurance ? t('champ_round_teams') : t('champ_round_drivers')}
          </span>
          {resultsUnlocked && (
            <button type="button" className={`cp-tool-btn${csvMode ? ' is-active' : ''}`} onClick={() => setCsvMode((v) => !v)}>
              {t('champ_csv_paste')}
            </button>
          )}
        </div>

        {!date && (
          <p className="cp-results-lock-msg">📅 {t('champ_results_set_date_first')}</p>
        )}
        {date && !resultsUnlocked && (
          <p className="cp-results-lock-msg">🔒 {t('champ_results_locked_until_after')}</p>
        )}

        {resultsUnlocked && (
          <>
            {heatHistory?.length > 0 && (
              <div className="cp-heat-import">
                <span className="cp-section-label">{t('champ_from_heat')}</span>
                <div className="cp-heat-chips">
                  {heatHistory.slice().reverse().slice(0, 15).map((h, i) => (
                    <button key={i} type="button" className="cp-heat-chip" onClick={() => importFromHeat(h)}>
                      #{h.heat_number}{h.heat_type ? ` · ${h.heat_type}` : ''}{h.results?.length ? ` (${h.results.length})` : ''}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {csvMode && (
              <div className="cp-csv-paste">
                <textarea value={csvText} onChange={(e) => setCsvText(e.target.value)} placeholder={t('champ_csv_ph')} rows={5} />
                <button type="button" className="cp-tool-btn" onClick={applyCSV}>{t('champ_csv_apply')}</button>
              </div>
            )}

            <ol className="cp-results-list">
              {results.map((r, i) => (
                <DriverRow key={i} index={i} driver={r} isEndurance={isEndurance} total={results.length}
                  onUpdate={(u) => updateResult(i, u)} onRemove={() => removeResult(i)}
                  onMoveUp={() => moveResult(i, -1)} onMoveDown={() => moveResult(i, 1)} t={t} />
              ))}
              {results.length === 0 && <li className="cp-empty-row">{t('champ_results_empty')}</li>}
            </ol>

            <div className="cp-add-result" style={{ position: 'relative' }}>
              <input id={addInputId} type="text" dir="auto" value={addName}
                autoComplete="off"
                onChange={(e) => { setAddName(e.target.value); setSuggestions([]); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addResult();
                    // keep focus so user can type the next entry immediately
                    setTimeout(() => document.getElementById(addInputId)?.focus(), 0);
                  }
                  if (e.key === 'Escape') { setSuggestions([]); }
                }}
                placeholder={isEndurance ? t('champ_add_team_ph') : t('champ_add_driver_ph')}
              />
              <button type="button" className="cp-tool-btn" onClick={() => addResult()} disabled={!addName.trim()}>{t('champ_add_btn')}</button>
              {filteredSuggestions.length > 0 && (
                <ul className="cp-autocomplete">
                  {filteredSuggestions.map((name) => (
                    <li key={name}>
                      <button type="button" onMouseDown={(e) => { e.preventDefault(); addResult(name); }}>
                        {name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>

      <div className="cp-round-editor-footer">
        <button type="button" className="cp-btn-ghost" onClick={onCancel}>{t('champ_cancel')}</button>
        <button type="button" className="cp-btn-primary"
          onClick={() => onSave({ ...round, label: label || `Round ${Date.now()}`, date: date || null, endDate: (isMultiDay && endDate && endDate !== date) ? endDate : null, time: time || null, trackSlug: trackSlug || null, isOfficial, results, raceType, sessions, divisionId: divisionId || null, maxKarts: maxKarts ? Number(maxKarts) : null, aiFormatNotes: aiFormatNotes || '' })}
        >{t('champ_save_round')}</button>
      </div>
    </div>
  );
}

// ── Standings table ───────────────────────────────────────────────────────────
function StandingsTable({ championship, showAllRounds, t }) {
  const standings = showAllRounds ? computeStandings(championship) : computeOfficialStandings(championship);
  const rounds = showAllRounds
    ? (championship.rounds || [])
    : (championship.rounds || []).filter((r) => r.isOfficial);

  if (!rounds.length) return <p className="cp-empty">{t('champ_standings_empty')}</p>;

  return (
    <div className="cp-standings">
      <div className="cp-standings-toolbar">
        <button type="button" className="cp-tool-btn"
          onClick={() => downloadTextFile(`${championship.name || 'championship'}-standings.csv`, exportStandingsCsv(championship))}>
          {t('champ_export_csv')}
        </button>
      </div>
      <div className="cp-standings-wrap">
        <table className="cp-standings-table">
          <thead>
            <tr>
              <th>{t('champ_col_pos')}</th>
              <th>{t('champ_participant')}</th>
              <th>{t('champ_col_pts')}</th>
              <th>{t('champ_col_wins')}</th>
              {rounds.map((r, i) => (
                <th key={i} className="cp-round-th" title={r.date || ''}>
                  {r.isOfficial ? '🏅' : ''}{r.label ? r.label.replace(/\s*[–-].*$/, '').trim() : `R${i + 1}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {standings.map((s) => (
              <tr key={s.name} className={s.position <= 3 ? `cp-pos-${s.position}` : ''}>
                <td className="cp-td-pos">{s.position}</td>
                <td className="cp-td-name">{s.name}</td>
                <td className="cp-td-pts"><strong>{s.points}</strong></td>
                <td className="cp-td-wins">{s.wins || '—'}</td>
                {s.roundPoints.map((pts, ri) => (
                  <td key={ri} className={`cp-td-round${s.roundPositions[ri] === 1 ? ' cp-td-win' : ''}`}>
                    {pts != null ? pts : '—'}
                  </td>
                ))}
              </tr>
            ))}
            {!standings.length && <tr><td colSpan={4 + rounds.length} className="cp-empty">{t('champ_results_empty')}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Login modal (shown when championship has a password) ──────────────────────
function LoginModal({ championship, onUnlock, onClose, t }) {
  const [pwd, setPwd] = useState('');
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  async function tryLogin() {
    if (!pwd.trim()) return;
    setLoading(true); setError(false);
    try {
      const res = await fetch(`/api/championships/${championship.id}/verify-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwd }),
      });
      const data = await res.json();
      if (data.success) { writeSession(championship.id, true, pwd); onUnlock(pwd); }
      else setError(true);
    } catch { setError(true); }
    finally { setLoading(false); }
  }

  return (
    <div className="cp-modal-overlay" onClick={onClose}>
      <div className="cp-login-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cp-login-modal-header">
          <div className="cp-login-modal-icon">🔒</div>
          <div>
            <h3 className="cp-login-modal-title">{t('champ_editor_login')}</h3>
            <p className="cp-login-modal-sub">{championship.name}</p>
          </div>
        </div>
        <input
          type="password"
          className="cp-login-input"
          value={pwd}
          onChange={(e) => setPwd(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') tryLogin(); }}
          placeholder={t('champ_editor_password_ph')}
          autoFocus
        />
        {error && <p className="cp-login-error">{t('champ_editor_wrong_pw')}</p>}
        <div className="cp-login-modal-footer">
          <button type="button" className="cp-btn-ghost" onClick={onClose}>{t('champ_cancel')}</button>
          <button type="button" className="cp-btn-primary" onClick={tryLogin} disabled={loading || !pwd.trim()}>
            {loading ? '…' : t('champ_editor_unlock')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ChampionshipPage() {
  const { t } = useLanguage();
  const { trackName } = useParams();
  const trackSlug = trackName || null;

  const [championships, setChampionships] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState(null);
  const [isEditor, setIsEditor] = useState(false);
  const [view, setView] = useState('list');
  const [activeTab, setActiveTab] = useState('rounds');
  const [editingRound, setEditingRound] = useState(null);
  const [heatHistory, setHeatHistory] = useState([]);
  const [showAllRounds, setShowAllRounds] = useState(false);
  const [planningRoundIndex, setPlanningRoundIndex] = useState(null);
  const [planSaving, setPlanSaving] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);

  // Create form
  const [name, setName] = useState('');
  const [scope, setScope] = useState('singular'); // 'singular' | 'multi-league'
  const [pointsTable, setPointsTable] = useState([...DEFAULT_POINTS_TABLES.karting]);
  const [newChampPassword, setNewChampPassword] = useState('');
  const [newVenues, setNewVenues] = useState([]);

  // Settings form
  const [settingsName, setSettingsName] = useState('');
  const [settingsPoints, setSettingsPoints] = useState([...DEFAULT_POINTS_TABLES.karting]);
  const [settingsPassword, setSettingsPassword] = useState('');
  const [settingsVenues, setSettingsVenues] = useState([]);

  // Collapsible rounds
  const [expandedRound, setExpandedRound] = useState(null);

  // Division (sub-championship) state
  const [activeDivisionId, setActiveDivisionId] = useState(null); // null = top-level rounds
  const [expandedDivRound, setExpandedDivRound] = useState(null);
  const [editingDivRound, setEditingDivRound] = useState(null); // { divId, ri }
  const [newDivName, setNewDivName] = useState('');

  useEffect(() => { loadChampionships(); loadHeatHistory(); }, []);

  const loadChampionships = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/championships');
      if (res.ok) {
        const data = await res.json();
        const list = (data.championships || []).map(normalizeChampionship).filter(Boolean);
        setChampionships(list);
      }
    } catch { /* offline */ } finally { setLoading(false); }
  }, []);

  async function loadHeatHistory() {
    try {
      const res = await fetch('/api/results/list?limit=50');
      if (res.ok) { const d = await res.json(); setHeatHistory(d.heats || []); }
    } catch { /* ignore */ }
  }

  async function persist(championship, password) {
    setSaving(true);
    try {
      await fetch('/api/championships', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ championship, password }),
      });
    } catch { /* ignore */ } finally { setSaving(false); }
  }

  async function handleCreate() {
    if (!name.trim()) return;
    const c = createChampionship({ name: name.trim(), scope, pointsTable, adminPassword: newChampPassword });
    c.venues = newVenues;
    await persist(c, '');
    await loadChampionships();
    openDetail({ ...c, hasPassword: Boolean(newChampPassword) }, true);
    setName(''); setNewChampPassword(''); setScope('singular'); setNewVenues([]);
  }

  function openDetail(c, asEditor = false) {
    const editor = asEditor || readSession(c.id) || !c.hasPassword;
    setSelected(c);
    setIsEditor(editor);
    setSettingsName(c.name);
    setSettingsPoints([...c.pointsTable]);
    setSettingsPassword(readSessionPw(c.id));
    setSettingsVenues([...(c.venues || [])]);
    setActiveTab('rounds');
    setEditingRound(null);
    setExpandedRound(null);
    setPlanningRoundIndex(null);
    setView('detail');
  }

  function updateSelected(patch) {
    const updated = { ...selected, ...patch, updatedAt: Date.now() };
    setSelected(updated);
    setChampionships((prev) => prev.map((c) => c.id === updated.id ? updated : c));
    persist(updated, selected.adminPassword || settingsPassword || readSessionPw(selected.id));
  }

  async function deleteChampionship(id) {
    const c = championships.find((x) => x.id === id);
    await fetch(`/api/championships/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: c?.adminPassword || '' }),
    });
    setChampionships((prev) => prev.filter((x) => x.id !== id));
    if (selected?.id === id) { setView('list'); setSelected(null); }
  }

  function addRound() {
    const round = createRound({ label: `Round ${(selected.rounds?.length || 0) + 1}` });
    const rounds = [...(selected.rounds || []), round];
    updateSelected({ rounds });
    setEditingRound(rounds.length - 1);
  }

  function saveRound(ri, updatedRound) {
    const rounds = (selected.rounds || []).map((r, i) => i === ri ? updatedRound : r);
    updateSelected({ rounds });
    setEditingRound(null);
    setExpandedRound(null);
  }

  function deleteRound(ri) {
    const rounds = (selected.rounds || []).filter((_, i) => i !== ri);
    updateSelected({ rounds });
    if (editingRound === ri) setEditingRound(null);
  }

  // ── Division (sub-championship) handlers ──────────────────────────────────
  function addDivision() {
    if (!newDivName.trim()) return;
    const div = createDivision({ name: newDivName.trim(), pointsTable: selected.pointsTable });
    updateSelected({ divisions: [...(selected.divisions || []), div] });
    setNewDivName('');
    setActiveDivisionId(div.id);
  }

  function deleteDivision(divId) {
    updateSelected({ divisions: (selected.divisions || []).filter((d) => d.id !== divId) });
    if (activeDivisionId === divId) setActiveDivisionId(null);
  }

  function addDivRound(divId) {
    const divisions = (selected.divisions || []).map((d) => {
      if (d.id !== divId) return d;
      const round = createRound({ label: `Round ${(d.rounds?.length || 0) + 1}` });
      const rounds = [...(d.rounds || []), round];
      setEditingDivRound({ divId, ri: rounds.length - 1 });
      return { ...d, rounds };
    });
    updateSelected({ divisions });
  }

  function saveDivRound(divId, ri, updatedRound) {
    const divisions = (selected.divisions || []).map((d) => {
      if (d.id !== divId) return d;
      return { ...d, rounds: d.rounds.map((r, i) => i === ri ? updatedRound : r) };
    });
    updateSelected({ divisions });
    setEditingDivRound(null);
    setExpandedDivRound(null);
  }

  function deleteDivRound(divId, ri) {
    const divisions = (selected.divisions || []).map((d) => {
      if (d.id !== divId) return d;
      return { ...d, rounds: d.rounds.filter((_, i) => i !== ri) };
    });
    updateSelected({ divisions });
  }

  function saveSettings() {
    const patch = { name: settingsName.trim(), pointsTable: settingsPoints, venues: settingsVenues };
    if (settingsPassword) patch.adminPassword = settingsPassword;
    updateSelected(patch);
  }

  function handlePlanApply(planDraft) {
    if (planningRoundIndex === null) return;
    const rounds = (selected.rounds || []).map((r, i) => i === planningRoundIndex ? { ...r, eventPlan: planDraft } : r);
    updateSelected({ rounds });
    setPlanningRoundIndex(null);
  }

  const planningRound = planningRoundIndex !== null ? selected?.rounds?.[planningRoundIndex] : null;
  const adminLink = trackSlug ? `/admin/${trackSlug}` : '/admin/kart-demo';
  const officialRoundCount = selected?.rounds?.filter((r) => r.isOfficial).length || 0;

  return (
    <div className="cp-page">

      {/* ProRaceEventModal overlay */}
      {planningRound && (
        <div className="admin-modal-overlay">
          <div className="admin-modal" style={{ maxWidth: '820px', maxHeight: '90vh', overflow: 'auto' }}>
            <ProRaceEventModal t={t} onClose={() => setPlanningRoundIndex(null)}
              initialType={planningRound?.raceType === 'endurance-team' ? 'endurance' : 'sprint'}
              draft={planningRound.eventPlan || null} trackSlug={trackSlug || ''}
              isSaving={planSaving} onApply={handlePlanApply} />
          </div>
        </div>
      )}

      {/* Login modal */}
      {showLoginModal && selected && (
        <LoginModal
          championship={selected}
          t={t}
          onUnlock={(pw) => { setIsEditor(true); setShowLoginModal(false); if (pw) setSettingsPassword(pw); }}
          onClose={() => setShowLoginModal(false)}
        />
      )}

      {/* ── Header ── */}
      <header className="cp-header">
        <div className="cp-header-brand">
          <HakafastLogo to="/" className="cp-header-logo" />
          <span className="cp-header-title">🏆 {t('admin_championship')}</span>
        </div>
        <nav className="cp-header-nav">
          {view !== 'list' && (
            <button type="button" className="cp-nav-btn"
              onClick={() => { setView('list'); setSelected(null); setEditingRound(null); setPlanningRoundIndex(null); }}>
              ← {t('champ_back_all')}
            </button>
          )}
          <Link to={adminLink} className="cp-nav-btn">{t('champ_back_admin')}</Link>
          <LanguageSwitcher />
        </nav>
      </header>

      <main className="cp-main">

        {/* ── LIST ── */}
        {view === 'list' && (
          <div className="cp-list-view">
            <div className="cp-list-hero">
              <div>
                <h1 className="cp-list-title">{t('champ_page_title')}</h1>
                <p className="cp-list-sub">{t('champ_page_subtitle')}</p>
              </div>
              <button type="button" className="cp-btn-primary" onClick={() => setView('create')}>
                + {t('champ_create_new')}
              </button>
            </div>

            {loading && (
              <div className="cp-loading">
                <div className="cp-loading-spinner" />
                <span>{t('champ_saving')}</span>
              </div>
            )}

            {!loading && championships.length === 0 && (
              <div className="cp-onboarding">
                <div className="cp-onboarding-icon">🏆</div>
                <h2 className="cp-onboarding-title">{t('champ_list_empty_title')}</h2>
                <p className="cp-onboarding-desc">{t('champ_list_empty_desc')}</p>
                <button type="button" className="cp-btn-primary" onClick={() => setView('create')}>
                  {t('champ_create_btn')}
                </button>
              </div>
            )}

            <div className="cp-cards-grid">
              {championships.map((c) => {
                const standings = computeStandings(c);
                const leader = standings[0];
                const official = (c.rounds || []).filter((r) => r.isOfficial).length;
                return (
                  <div key={c.id} className="cp-card" onClick={() => openDetail(c)} role="button" tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') openDetail(c); }}>
                    <div className="cp-card-top">
                      <div className="cp-card-title-row">
                        <h3 className="cp-card-name">{c.name}</h3>
                        {c.hasPassword && <span className="cp-card-lock" title={t('champ_lock_icon')}>🔒</span>}
                      </div>
                      <div className="cp-card-badges">
                        {official > 0 && <span className="cp-official-pill">🏅 {official} {t('champ_official_plural')}</span>}
                        {c.scope === 'multi-league' && <span className="cp-scope-badge cp-scope-multi">{t('champ_scope_multi')}</span>}
                        <span className="cp-card-round-count">{c.rounds?.length || 0} {t('champ_tab_rounds')}</span>
                      </div>
                    </div>
                    <div className="cp-card-stats">
                      <div className="cp-card-stat">
                        <span className="cp-card-stat-val">{standings.length}</span>
                        <span className="cp-card-stat-lbl">{t('champ_participant')}</span>
                      </div>
                      {leader && (
                        <div className="cp-card-stat cp-card-stat-leader">
                          <span className="cp-card-stat-val">{leader.name}</span>
                          <span className="cp-card-stat-lbl">#{t('champ_col_pos')} 1 · {leader.points} {t('champ_pts_suffix')}</span>
                        </div>
                      )}
                    </div>
                    <div className="cp-card-footer">
                      <span className="cp-card-cta">
                        {t('champ_rounds_count', { count: c.rounds?.length || 0 })} →
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── CREATE ── */}
        {view === 'create' && (
          <div className="cp-create-view">
            <div className="cp-section-header">
              <h2 className="cp-section-title">{t('champ_create_title')}</h2>
              <button type="button" className="cp-nav-btn" onClick={() => setView('list')}>← {t('champ_back_all')}</button>
            </div>

            <div className="cp-form-card">
              <label className="cp-field">
                <span>{t('champ_name_label')}</span>
                <input type="text" dir="auto" value={name} onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) handleCreate(); }}
                  placeholder={t('champ_name_ph')} autoFocus />
              </label>

              <div className="cp-field-label">{t('champ_scope_label')}</div>
              <div className="cp-scope-tabs">
                <button type="button"
                  className={`cp-scope-tab${scope === 'singular' ? ' is-active' : ''}`}
                  onClick={() => setScope('singular')}>
                  <strong>{t('champ_scope_singular')}</strong>
                  <span>{t('champ_scope_singular_desc')}</span>
                </button>
                <button type="button"
                  className={`cp-scope-tab${scope === 'multi-league' ? ' is-active' : ''}`}
                  onClick={() => setScope('multi-league')}>
                  <strong>{t('champ_scope_multi')}</strong>
                  <span>{t('champ_scope_multi_desc')}</span>
                </button>
              </div>

              <div className="cp-field-label">{t('champ_points_label')}</div>
              <PointsTableEditor value={pointsTable} onChange={setPointsTable} t={t} />

              <div className="cp-divider" />

              <VenuesEditor venues={newVenues} onChange={setNewVenues} t={t} />

              <div className="cp-divider" />

              <label className="cp-field">
                <span>🔒 {t('champ_admin_password_label')}</span>
                <input type="password" value={newChampPassword} onChange={(e) => setNewChampPassword(e.target.value)}
                  placeholder={t('champ_admin_password_ph')} />
              </label>
              <p className="cp-hint">{t('champ_admin_password_hint')}</p>

              <div className="cp-form-footer">
                <button type="button" className="cp-btn-ghost" onClick={() => setView('list')}>{t('champ_cancel')}</button>
                <button type="button" className="cp-btn-primary" onClick={handleCreate} disabled={!name.trim()}>
                  {t('champ_create_btn')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── DETAIL ── */}
        {view === 'detail' && selected && (
          <div className="cp-detail-view">

            {/* Detail hero bar */}
            <div className="cp-detail-hero">
              <div className="cp-detail-hero-left">
                <div className="cp-detail-title-row">
                  <h2 className="cp-detail-title">{selected.name}</h2>
                  {officialRoundCount > 0 && <span className="cp-official-pill">🏅 {officialRoundCount} {t('champ_official_plural')}</span>}
                  {selected.scope === 'multi-league' && <span className="cp-scope-badge cp-scope-multi">{t('champ_scope_multi')}</span>}
                </div>
              </div>
              <div className="cp-detail-hero-right">
                {saving && <span className="cp-saving-badge">{t('champ_saving')}</span>}
                {isEditor ? (
                  <span className="cp-editor-badge">✏ {t('champ_editor_mode')}</span>
                ) : selected.hasPassword ? (
                  <button type="button" className="cp-unlock-btn" onClick={() => setShowLoginModal(true)}>
                    🔒 {t('champ_editor_login')}
                  </button>
                ) : null}
              </div>
            </div>

            {/* Tabs */}
            <div className="cp-tabs">
              <button className={`cp-tab${activeTab === 'rounds' ? ' is-active' : ''}`} onClick={() => setActiveTab('rounds')}>
                {t('champ_tab_rounds')}
                <span className="cp-tab-count">{selected.rounds?.length || 0}</span>
              </button>
              <button className={`cp-tab${activeTab === 'standings' ? ' is-active' : ''}`} onClick={() => setActiveTab('standings')}>
                {t('champ_tab_standings')}
              </button>
              {isEditor && (
                <button className={`cp-tab${activeTab === 'settings' ? ' is-active' : ''}`} onClick={() => setActiveTab('settings')}>
                  {t('champ_tab_settings')}
                </button>
              )}
            </div>

            {/* ROUNDS tab */}
            {activeTab === 'rounds' && (
              <div className="cp-rounds-panel">

                {/* Division nav pills — only shown for multi-league championships */}
                {selected.scope === 'multi-league' && ((selected.divisions || []).length > 0 || isEditor) && (
                  <div className="cp-division-nav">
                    <button
                      type="button"
                      className={`cp-division-pill${activeDivisionId === null ? ' is-active' : ''}`}
                      onClick={() => { setActiveDivisionId(null); setExpandedRound(null); setEditingRound(null); }}
                    >
                      🏁 {t('champ_div_main')}
                    </button>
                    {(selected.divisions || []).map((div) => (
                      <button
                        key={div.id}
                        type="button"
                        className={`cp-division-pill${activeDivisionId === div.id ? ' is-active' : ''}`}
                        onClick={() => { setActiveDivisionId(div.id); setExpandedDivRound(null); setEditingDivRound(null); }}
                      >
                        {div.name}
                        {isEditor && (
                          <span className="cp-div-del" onClick={(e) => { e.stopPropagation(); deleteDivision(div.id); }}>×</span>
                        )}
                      </button>
                    ))}
                    {isEditor && (
                      <div className="cp-div-add-row">
                        <input
                          type="text" dir="auto" value={newDivName}
                          onChange={(e) => setNewDivName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') addDivision(); }}
                          placeholder={t('champ_div_add_ph')}
                          className="cp-div-name-input"
                        />
                        <button type="button" className="cp-tool-btn" onClick={addDivision} disabled={!newDivName.trim()}>
                          + {t('champ_div_add')}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Active division info banner */}
                {activeDivisionId !== null && (() => {
                  const div = (selected.divisions || []).find((d) => d.id === activeDivisionId);
                  if (!div) return null;
                  return (
                    <div className="cp-div-banner">
                      <span className="cp-div-banner-name">{div.name}</span>
                      <span className="cp-div-banner-sub">{t('champ_div_own_standings')}</span>
                    </div>
                  );
                })()}

                {/* Round list — top-level or division */}
                {(() => {
                  const isDiv = activeDivisionId !== null;
                  const div = isDiv ? (selected.divisions || []).find((d) => d.id === activeDivisionId) : null;
                  const rounds = isDiv ? (div?.rounds || []) : (selected.rounds || []);
                  const editingIdx = isDiv ? editingDivRound?.ri : editingRound;
                  const expandedIdx = isDiv ? expandedDivRound : expandedRound;
                  const setEditing = isDiv
                    ? (i) => setEditingDivRound(i !== null ? { divId: activeDivisionId, ri: i } : null)
                    : setEditingRound;
                  const setExpanded = isDiv ? setExpandedDivRound : setExpandedRound;
                  const onSave = isDiv
                    ? (ri, updated) => saveDivRound(activeDivisionId, ri, updated)
                    : saveRound;
                  const onDelete = isDiv
                    ? (ri) => deleteDivRound(activeDivisionId, ri)
                    : deleteRound;
                  const onAddRound = isDiv
                    ? () => addDivRound(activeDivisionId)
                    : addRound;
                  const championship4editor = isDiv ? { ...selected, rounds: div?.rounds || [] } : selected;

                  const rtLabels = {
                    sprint: t('champ_racetype_sprint'),
                    'endurance-team': t('champ_racetype_endurance_team'),
                    'endurance-solo': t('champ_racetype_endurance_solo'),
                    'best-lap': t('champ_racetype_best_lap'),
                  };

                  if (editingIdx !== null && rounds[editingIdx]) {
                    return (
                      <RoundEditor
                        round={rounds[editingIdx]}
                        championship={championship4editor}
                        heatHistory={heatHistory}
                        onSave={(updated) => onSave(editingIdx, updated)}
                        onCancel={() => setEditing(null)}
                        t={t}
                      />
                    );
                  }

                  return (
                    <>
                      {rounds.length === 0 && <p className="cp-empty">{t('champ_rounds_empty')}</p>}
                      {rounds.map((r, i) => {
                        const isOpen = expandedIdx === i;
                        const rt = r.raceType || 'sprint';
                        return (
                          <div key={r.id} className={`cp-round-row${r.isOfficial ? ' is-official' : ''}${isOpen ? ' is-open' : ''}`}>
                            <div className="cp-round-header" onClick={() => setExpanded(isOpen ? null : i)}>
                              <div className="cp-round-num-badge">{r.isOfficial ? '🏅' : `R${i + 1}`}</div>
                              <div className="cp-round-info" style={{ flex: 1 }}>
                                <span className="cp-round-label">{r.label || `Round ${i + 1}`}</span>
                                {r.date && <span className="cp-round-meta" style={{ marginInlineStart: '0.5rem' }}>{r.date}{r.endDate && r.endDate !== r.date ? ` → ${r.endDate}` : ''}{r.time ? ` · ${r.time}` : ''}</span>}
                              </div>
                              <span className={`cp-rt-badge cp-rt-${rt}`}>{rtLabels[rt] || rt}</span>
                              <span className="cp-round-meta">{r.results?.length || 0}</span>
                              {r.isOfficial ? <span className="cp-official-badge">🏅</span> : <span className="cp-unofficial-badge">⚠</span>}
                              <span className="cp-round-chevron">{isOpen ? '▼' : '▶'}</span>
                            </div>
                            {isOpen && (
                              <div className="cp-round-body">
                                {r.trackSlug && <span className="cp-round-meta">📍 {r.trackSlug}</span>}
                                {r.results?.[0] && <span className="cp-round-meta">{t('champ_round_winner')}: {r.results[0].name}</span>}
                                {r.eventPlan && <span className="cp-linked-badge">✓ {t('champ_event_linked')}</span>}
                                {(r.sessions || []).length > 0 && (
                                  <div className="cp-round-sessions-summary">
                                    {r.sessions.map((s) => {
                                      const si = SESSION_TYPE_KEYS.find((x) => x.key === s.type) || SESSION_TYPE_KEYS[0];
                                      return (
                                        <span key={s.id} className={`cp-session-chip cp-session-${s.type}`}>
                                          {si.emoji} {s.label || t(si.tKey)}
                                          {s.startTime && ` · ${s.startTime}`}
                                          {s.durationMinutes > 0 && ` · ${s.durationMinutes}${t('champ_session_duration')}`}
                                          {s.kartTransporter && ' · 🔄'}
                                        </span>
                                      );
                                    })}
                                  </div>
                                )}
                                {isEditor && (
                                  <div className="cp-round-actions" onClick={(e) => e.stopPropagation()}>
                                    {!isDiv && (
                                      <>
                                        <button type="button" className={`cp-tool-btn${r.eventPlan ? ' is-active' : ''}`}
                                          onClick={() => setPlanningRoundIndex(i)}>
                                          📋 {t('champ_plan_event')}
                                        </button>
                                        {r.eventPlan && r.trackSlug && (
                                          <Link to={`/admin/${r.trackSlug}`} className="cp-tool-btn">
                                            🏁 {t('champ_open_admin')}
                                          </Link>
                                        )}
                                      </>
                                    )}
                                    <button type="button" className="cp-tool-btn" onClick={(e) => { e.stopPropagation(); setEditing(i); }}>
                                      ✏ {t('champ_round_edit')}
                                    </button>
                                    <button type="button" className="cp-tool-btn cp-del-btn" onClick={(e) => { e.stopPropagation(); onDelete(i); }}>✕</button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {isEditor && (
                        <button type="button" className="cp-add-round-btn" onClick={onAddRound}>
                          + {t('champ_add_round')}
                        </button>
                      )}
                    </>
                  );
                })()}
              </div>
            )}

            {/* STANDINGS tab */}
            {activeTab === 'standings' && (
              <div className="cp-standings-panel">
                {/* Division standings selector — only for multi-league */}
                {selected.scope === 'multi-league' && (selected.divisions || []).length > 0 && (
                  <div className="cp-division-nav" style={{ marginBottom: '1rem' }}>
                    <button
                      type="button"
                      className={`cp-division-pill${activeDivisionId === null ? ' is-active' : ''}`}
                      onClick={() => setActiveDivisionId(null)}
                    >
                      🏆 {t('champ_div_overall')}
                    </button>
                    {(selected.divisions || []).map((div) => (
                      <button key={div.id} type="button"
                        className={`cp-division-pill${activeDivisionId === div.id ? ' is-active' : ''}`}
                        onClick={() => setActiveDivisionId(div.id)}
                      >
                        {div.name}
                      </button>
                    ))}
                  </div>
                )}

                {officialRoundCount > 0 && activeDivisionId === null && (
                  <div className="cp-mode-toggle">
                    <button type="button"
                      className={`cp-mode-btn${!showAllRounds ? ' is-active' : ''}`}
                      onClick={() => setShowAllRounds(false)}>
                      🏅 {t('champ_official_only')}
                    </button>
                    <button type="button"
                      className={`cp-mode-btn${showAllRounds ? ' is-active' : ''}`}
                      onClick={() => setShowAllRounds(true)}>
                      {t('champ_all_rounds')}
                    </button>
                  </div>
                )}

                {activeDivisionId === null ? (
                  (selected.divisions || []).length > 0 ? (
                    // Overall standings aggregates top-level + all divisions
                    <StandingsTable
                      championship={{ ...selected, rounds: [
                        ...(selected.rounds || []),
                        ...(selected.divisions || []).flatMap((d) => d.rounds || [])
                      ]}}
                      showAllRounds={true}
                      t={t}
                    />
                  ) : (
                    <StandingsTable championship={selected} showAllRounds={showAllRounds || officialRoundCount === 0} t={t} />
                  )
                ) : (() => {
                  const div = (selected.divisions || []).find((d) => d.id === activeDivisionId);
                  if (!div) return null;
                  return (
                    <>
                      <p className="cp-div-standings-label">{div.name} — {t('champ_div_own_standings')}</p>
                      <StandingsTable championship={{ ...selected, pointsTable: div.pointsTable, rounds: div.rounds || [] }} showAllRounds={true} t={t} />
                    </>
                  );
                })()}
              </div>
            )}

            {/* SETTINGS tab — editor only */}
            {activeTab === 'settings' && isEditor && (
              <div className="cp-settings-panel">
                <label className="cp-field">
                  <span>{t('champ_name_label')}</span>
                  <input type="text" dir="auto" value={settingsName} onChange={(e) => setSettingsName(e.target.value)} />
                </label>
                <div className="cp-field-label">{t('champ_points_label')}</div>
                <PointsTableEditor value={settingsPoints} onChange={setSettingsPoints} t={t} />

                <div className="cp-divider" />

                <VenuesEditor venues={settingsVenues} onChange={setSettingsVenues} t={t} />

                <div className="cp-divider" />

                <label className="cp-field">
                  <span>🔒 {t('champ_change_password_label')}</span>
                  <input type="password" value={settingsPassword} onChange={(e) => setSettingsPassword(e.target.value)}
                    placeholder={t('champ_change_password_ph')} />
                </label>

                <div className="cp-settings-footer">
                  <button type="button" className="cp-tool-btn cp-del-btn"
                    onClick={() => { if (window.confirm(t('champ_delete_confirm', { name: selected.name }))) deleteChampionship(selected.id); }}>
                    {t('champ_delete')}
                  </button>
                  <button type="button" className="cp-btn-primary" onClick={saveSettings}>
                    {t('champ_settings_save')}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
