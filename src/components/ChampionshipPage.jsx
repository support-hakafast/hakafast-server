import React, { useState, useEffect, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import HakafastLogo from './HakafastLogo.jsx';
import LanguageSwitcher from './LanguageSwitcher.jsx';
import ProRaceEventModal from './ProRaceEventModal.jsx';
import {
  createChampionship,
  createRound,
  computeStandings,
  computeOfficialStandings,
  exportStandingsCsv,
  resultsFromHeatHistory,
  parseRoundResultsCsv,
  normalizeChampionship,
  DEFAULT_POINTS_TABLES,
} from '../utils/championshipHelpers.js';
import { COUNTRIES, countryFlag } from '../data/countries.js';
import '../assets/AdminPanel.css';

// ── Utility ─────────────────────────────────────────────────────────────────

function downloadTextFile(filename, content) {
  const blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// Local storage key for championship admin sessions
function sessionKey(id) { return `hf_champ_auth_${id}`; }
function readSession(id) { try { return sessionStorage.getItem(sessionKey(id)) === 'true'; } catch { return false; } }
function writeSession(id, v) { try { sessionStorage.setItem(sessionKey(id), v ? 'true' : ''); } catch {} }

// ── Sub-components ──────────────────────────────────────────────────────────

function PointsTableEditor({ value, onChange, t }) {
  const [text, setText] = useState(value.join(', '));
  useEffect(() => { setText(value.join(', ')); }, [value]);

  const presets = [
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
    <div className="champ-points-editor">
      <div className="champ-points-presets">
        {presets.map(({ key, label }) => (
          <button key={key} type="button"
            className={`champ-preset-btn${JSON.stringify(value) === JSON.stringify(DEFAULT_POINTS_TABLES[key]) ? ' is-active' : ''}`}
            onClick={() => { onChange(DEFAULT_POINTS_TABLES[key]); setText(DEFAULT_POINTS_TABLES[key].join(', ')); }}
          >{label}</button>
        ))}
      </div>
      <label className="planner-field planner-field-compact" style={{ marginTop: '0.4rem' }}>
        <span>{t('champ_points_custom_label')}</span>
        <input type="text" value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          placeholder={t('champ_points_custom_ph')}
        />
      </label>
      <div className="champ-points-preview">
        {value.map((pts, i) => <span key={i} className="champ-pts-chip">P{i + 1}={pts}</span>)}
      </div>
    </div>
  );
}

function DriverRow({ driver, index, isEndurance, onUpdate, onRemove, onMoveUp, onMoveDown, total, t }) {
  return (
    <li className="champ-result-row">
      <span className="champ-pos">{index + 1}</span>
      <input type="text" dir="auto" className="champ-result-name-input"
        value={driver.name}
        onChange={(e) => onUpdate({ ...driver, name: e.target.value })}
        placeholder={isEndurance ? t('champ_add_team_ph') : t('champ_add_driver_ph')}
        autoComplete="off"
      />
      {!isEndurance && (
        <>
          <select className="champ-result-nation" value={driver.nationality || ''}
            onChange={(e) => onUpdate({ ...driver, nationality: e.target.value })}>
            <option value="">—</option>
            {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{countryFlag(c.code)} {c.name}</option>)}
          </select>
          <input type="text" dir="ltr" className="champ-result-kart"
            value={driver.kartNumber || ''}
            onChange={(e) => onUpdate({ ...driver, kartNumber: e.target.value })}
            placeholder={t('champ_kart_ph')}
          />
        </>
      )}
      {isEndurance && (
        <input type="text" dir="auto" className="champ-result-drivers-input"
          value={(driver.drivers || []).join(', ')}
          onChange={(e) => onUpdate({ ...driver, drivers: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
          placeholder={t('champ_drivers_ph')}
        />
      )}
      <div className="champ-result-controls">
        <button type="button" className="champ-mv-btn" onClick={onMoveUp} disabled={index === 0}>↑</button>
        <button type="button" className="champ-mv-btn" onClick={onMoveDown} disabled={index === total - 1}>↓</button>
        <button type="button" className="champ-mv-btn champ-action-delete" onClick={onRemove}>✕</button>
      </div>
    </li>
  );
}

function RoundEditor({ round, championship, heatHistory, onSave, onCancel, isEditor, t, availableTracks }) {
  const [label, setLabel] = useState(round.label || '');
  const [date, setDate] = useState(round.date || '');
  const [time, setTime] = useState(round.time || '');
  const [trackSlug, setTrackSlug] = useState(round.trackSlug || '');
  const [isOfficial, setIsOfficial] = useState(round.isOfficial || false);
  const [results, setResults] = useState(() =>
    (round.results || []).map((r) => ({ ...r, nationality: r.nationality || '', kartNumber: r.kartNumber || '' }))
  );
  const [csvText, setCsvText] = useState('');
  const [csvMode, setCsvMode] = useState(false);
  const [addName, setAddName] = useState('');
  const isEndurance = championship.type === 'endurance';

  function addResult() {
    if (!addName.trim()) return;
    setResults((prev) => [...prev, { name: addName.trim(), position: prev.length + 1, nationality: '', kartNumber: '', ...(isEndurance ? { drivers: [] } : {}) }]);
    setAddName('');
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

  return (
    <div className="champ-round-editor">
      <div className="champ-round-editor-header">
        <h3>{round.label ? `${t('champ_round_edit')}: ${round.label}` : t('champ_add_round').replace('+ ', '')}</h3>
        <button type="button" className="admin-modal-close champ-inline-close" onClick={onCancel}>×</button>
      </div>

      <div className="champ-round-editor-fields">
        <label className="planner-field planner-field-compact">
          <span>{t('champ_round_label')}</span>
          <input type="text" dir="auto" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t('champ_round_label_ph')} autoFocus />
        </label>
        <label className="planner-field planner-field-compact">
          <span>{t('champ_round_date')}</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="planner-field planner-field-compact">
          <span>{t('champ_round_time')}</span>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
        <label className="planner-field planner-field-compact">
          <span>{t('champ_round_track')}</span>
          <input type="text" dir="ltr" value={trackSlug} onChange={(e) => setTrackSlug(e.target.value)} placeholder="track-slug" />
        </label>
      </div>

      {isEditor && (
        <label className="champ-official-toggle">
          <input type="checkbox" checked={isOfficial} onChange={(e) => setIsOfficial(e.target.checked)} />
          <span>🏅 {t('champ_mark_official')}</span>
          <span className="champ-official-hint">{t('champ_official_hint')}</span>
        </label>
      )}

      {!isOfficial && (
        <p className="champ-unofficial-note">⚠ {t('champ_unofficial_note')}</p>
      )}

      {heatHistory?.length > 0 && (
        <div className="champ-heat-import">
          <span className="champ-section-label">{t('champ_from_heat')}</span>
          <div className="champ-heat-list">
            {heatHistory.slice().reverse().slice(0, 15).map((h, i) => (
              <button key={i} type="button" className="champ-heat-chip" onClick={() => importFromHeat(h)}>
                #{h.heat_number}{h.heat_type ? ` · ${h.heat_type}` : ''}{h.results?.length ? ` (${h.results.length})` : ''}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="champ-results-section">
        <div className="champ-results-toolbar">
          <span className="champ-section-label">
            {t('champ_results_label')} — {results.length} {isEndurance ? t('champ_round_teams') : t('champ_round_drivers')}
          </span>
          <button type="button" className={`champ-action-btn${csvMode ? ' is-active' : ''}`} onClick={() => setCsvMode((v) => !v)}>
            {t('champ_csv_paste')}
          </button>
        </div>
        {csvMode && (
          <div className="champ-csv-paste">
            <textarea value={csvText} onChange={(e) => setCsvText(e.target.value)} placeholder={t('champ_csv_ph')} rows={6} />
            <button type="button" className="btn-muted" onClick={applyCSV}>{t('champ_csv_apply')}</button>
          </div>
        )}
        <ol className="champ-results-list">
          {results.map((r, i) => (
            <DriverRow key={i} index={i} driver={r} isEndurance={isEndurance} total={results.length}
              onUpdate={(u) => updateResult(i, u)} onRemove={() => removeResult(i)}
              onMoveUp={() => moveResult(i, -1)} onMoveDown={() => moveResult(i, 1)} t={t} />
          ))}
          {results.length === 0 && <li className="champ-empty" style={{ listStyle: 'none' }}>{t('champ_results_empty')}</li>}
        </ol>
        <div className="champ-add-result">
          <input type="text" dir="auto" value={addName} onChange={(e) => setAddName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addResult(); } }}
            placeholder={isEndurance ? t('champ_add_team_ph') : t('champ_add_driver_ph')}
          />
          <button type="button" className="btn-muted" onClick={addResult} disabled={!addName.trim()}>{t('champ_add_btn')}</button>
        </div>
      </div>

      <div className="champ-round-editor-footer">
        <button type="button" className="btn-muted" onClick={onCancel}>{t('champ_cancel')}</button>
        <button type="button" className="btn-primary"
          onClick={() => onSave({ ...round, label: label || `Round ${Date.now()}`, date: date || null, time: time || null, trackSlug: trackSlug || null, isOfficial, results })}
        >{t('champ_save_round')}</button>
      </div>
    </div>
  );
}

function StandingsTable({ championship, showAllRounds, t }) {
  const standings = showAllRounds ? computeStandings(championship) : computeOfficialStandings(championship);
  const rounds = showAllRounds
    ? (championship.rounds || [])
    : (championship.rounds || []).filter((r) => r.isOfficial);
  const isEndurance = championship.type === 'endurance';

  if (!rounds.length) return <p className="champ-empty">{t('champ_standings_empty')}</p>;

  return (
    <div className="champ-standings">
      <div className="champ-standings-toolbar">
        <button type="button" className="champ-action-btn"
          onClick={() => downloadTextFile(`${championship.name || 'championship'}-standings.csv`, exportStandingsCsv(championship))}>
          {t('champ_export_csv')}
        </button>
      </div>
      <div className="champ-standings-table-wrap">
        <table className="champ-standings-table">
          <thead>
            <tr>
              <th>{t('champ_col_pos')}</th>
              <th>{isEndurance ? t('champ_col_team') : t('champ_col_driver')}</th>
              <th>{t('champ_col_pts')}</th>
              <th>{t('champ_col_wins')}</th>
              {rounds.map((r, i) => (
                <th key={i} className="champ-round-th" title={r.date || ''}>
                  {r.isOfficial ? '🏅' : ''}
                  {r.label ? r.label.replace(/\s*[–-].*$/, '').trim() : `R${i + 1}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {standings.map((s) => (
              <tr key={s.name} className={s.position === 1 ? 'champ-leader' : ''}>
                <td className="champ-td-pos">{s.position}</td>
                <td className="champ-td-name">{s.name}</td>
                <td className="champ-td-pts"><strong>{s.points}</strong></td>
                <td className="champ-td-wins">{s.wins || '—'}</td>
                {s.roundPoints.map((pts, ri) => (
                  <td key={ri} className={`champ-td-round${s.roundPositions[ri] === 1 ? ' champ-td-win' : ''}`}>
                    {pts != null ? pts : '—'}
                  </td>
                ))}
              </tr>
            ))}
            {!standings.length && <tr><td colSpan={4 + rounds.length} className="champ-empty">{t('champ_results_empty')}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Championship login widget ────────────────────────────────────────────────
function ChampLoginWidget({ championship, onUnlock, t }) {
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
      if (data.success) { writeSession(championship.id, true); onUnlock(); }
      else setError(true);
    } catch { setError(true); }
    finally { setLoading(false); }
  }

  return (
    <div className="champ-login-widget">
      <span className="champ-login-label">🔒 {t('champ_editor_login')}</span>
      <input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') tryLogin(); }}
        placeholder={t('champ_editor_password_ph')} className="champ-login-input" />
      <button type="button" className="btn-primary champ-login-btn" onClick={tryLogin} disabled={loading || !pwd.trim()}>
        {loading ? '…' : t('champ_editor_unlock')}
      </button>
      {error && <span className="champ-login-error">{t('champ_editor_wrong_pw')}</span>}
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
  const [isEditor, setIsEditor] = useState(false); // authenticated as championship admin for `selected`
  const [view, setView] = useState('list');
  const [activeTab, setActiveTab] = useState('rounds');
  const [editingRound, setEditingRound] = useState(null);
  const [heatHistory, setHeatHistory] = useState([]);
  const [showAllRounds, setShowAllRounds] = useState(false);
  const [planningRoundIndex, setPlanningRoundIndex] = useState(null);
  const [planSaving, setPlanSaving] = useState(false);

  // Create form
  const [name, setName] = useState('');
  const [type, setType] = useState('sprint');
  const [pointsTable, setPointsTable] = useState([...DEFAULT_POINTS_TABLES.karting]);
  const [newChampPassword, setNewChampPassword] = useState('');

  // Settings form
  const [settingsName, setSettingsName] = useState('');
  const [settingsType, setSettingsType] = useState('sprint');
  const [settingsPoints, setSettingsPoints] = useState([...DEFAULT_POINTS_TABLES.karting]);
  const [settingsPassword, setSettingsPassword] = useState('');

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
    const c = createChampionship({ name: name.trim(), type, pointsTable, adminPassword: newChampPassword });
    await persist(c, '');
    await loadChampionships();
    openDetail({ ...c, hasPassword: Boolean(newChampPassword) }, true);
    setName(''); setNewChampPassword('');
  }

  function openDetail(c, asEditor = false) {
    const editor = asEditor || readSession(c.id) || !c.hasPassword;
    setSelected(c);
    setIsEditor(editor);
    setSettingsName(c.name);
    setSettingsType(c.type);
    setSettingsPoints([...c.pointsTable]);
    setSettingsPassword('');
    setActiveTab('rounds');
    setEditingRound(null);
    setPlanningRoundIndex(null);
    setView('detail');
  }

  function updateSelected(patch) {
    const updated = { ...selected, ...patch, updatedAt: Date.now() };
    setSelected(updated);
    setChampionships((prev) => prev.map((c) => c.id === updated.id ? updated : c));
    persist(updated, selected.adminPassword || settingsPassword);
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
  }

  function deleteRound(ri) {
    const rounds = (selected.rounds || []).filter((_, i) => i !== ri);
    updateSelected({ rounds });
    if (editingRound === ri) setEditingRound(null);
  }

  function saveSettings() {
    const patch = { name: settingsName.trim(), type: settingsType, pointsTable: settingsPoints };
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
  const adminLink = trackSlug ? `/admin/${trackSlug}` : '/admin';

  const officialRoundCount = selected?.rounds?.filter((r) => r.isOfficial).length || 0;

  return (
    <div className="champ-page">

      {/* ProRaceEventModal overlay */}
      {planningRound && (
        <div className="admin-modal-overlay">
          <div className="admin-modal" style={{ maxWidth: '820px', maxHeight: '90vh', overflow: 'auto' }}>
            <ProRaceEventModal t={t} onClose={() => setPlanningRoundIndex(null)}
              initialType={selected?.type === 'endurance' ? 'endurance' : 'sprint'}
              draft={planningRound.eventPlan || null} trackSlug={trackSlug || ''}
              isSaving={planSaving} onApply={handlePlanApply} />
          </div>
        </div>
      )}

      {/* Header */}
      <header className="admin-header champ-page-header">
        <div className="admin-header-brand">
          <HakafastLogo to="/" className="admin-header-logo" />
          <h1>🏆 {t('admin_championship')}</h1>
        </div>
        <nav className="champ-page-nav">
          {view !== 'list' && (
            <button type="button" className="btn-muted champ-nav-btn"
              onClick={() => { setView('list'); setSelected(null); setEditingRound(null); setPlanningRoundIndex(null); }}>
              {t('champ_back_all')}
            </button>
          )}
          <Link to={adminLink} className="btn-muted champ-nav-btn">{t('champ_back_admin')}</Link>
          <LanguageSwitcher />
        </nav>
      </header>

      <main className="champ-page-body">

        {/* ── LIST ── */}
        {view === 'list' && (
          <div className="champ-page-list">
            <div className="champ-page-list-header">
              <div>
                <h2>{t('champ_page_title')}</h2>
                <p className="champ-page-subtitle">{t('champ_page_subtitle')}</p>
              </div>
              <button type="button" className="btn-primary" onClick={() => setView('create')}>
                {t('champ_create_new')}
              </button>
            </div>

            {loading && <p className="champ-empty">{t('champ_saving')}</p>}

            {!loading && championships.length === 0 && (
              <div className="champ-onboarding">
                <div className="champ-onboarding-icon">🏆</div>
                <p className="champ-onboarding-title">{t('champ_list_empty_title')}</p>
                <p className="champ-onboarding-desc">{t('champ_list_empty_desc')}</p>
                <button type="button" className="btn-primary" style={{ marginTop: '1.25rem' }} onClick={() => setView('create')}>
                  {t('champ_create_btn')}
                </button>
              </div>
            )}

            {championships.map((c) => {
              const standings = computeStandings(c);
              const leader = standings[0];
              const official = (c.rounds || []).filter((r) => r.isOfficial).length;
              return (
                <div key={c.id} className="champ-list-card" onClick={() => openDetail(c)}>
                  <div className="champ-list-card-body">
                    <span className="champ-list-name">{c.name}</span>
                    <span className={`champ-type-badge champ-type-${c.type}`}>{c.type}</span>
                    <span className="champ-list-meta">{t('champ_rounds_count', { count: c.rounds?.length || 0 })}</span>
                    {official > 0 && <span className="champ-official-count">🏅 {official} {t('champ_official_plural')}</span>}
                    {leader && <span className="champ-list-leader">{t('champ_leader_prefix')}: {leader.name} — {leader.points} {t('champ_pts_suffix')}</span>}
                    {c.hasPassword && <span className="champ-lock-icon">🔒</span>}
                  </div>
                  <button type="button" className="champ-action-btn champ-action-delete"
                    onClick={(e) => { e.stopPropagation(); deleteChampionship(c.id); }}
                    title={t('champ_delete')}>✕</button>
                </div>
              );
            })}
          </div>
        )}

        {/* ── CREATE ── */}
        {view === 'create' && (
          <div className="champ-page-create">
            <div className="champ-page-section-header">
              <h2>{t('champ_create_title')}</h2>
              <button type="button" className="btn-muted champ-nav-btn" onClick={() => setView('list')}>{t('champ_back_all')}</button>
            </div>

            <label className="planner-field planner-field-compact">
              <span>{t('champ_name_label')}</span>
              <input type="text" dir="auto" value={name} onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) handleCreate(); }}
                placeholder={t('champ_name_ph')} autoFocus />
            </label>

            <div className="champ-section-label" style={{ marginTop: '1rem' }}>{t('champ_type_label')}</div>
            <div className="champ-type-tabs">
              <button type="button" className={`pro-event-type-tab${type === 'sprint' ? ' active' : ''}`} onClick={() => setType('sprint')}>
                {t('champ_type_sprint')}
              </button>
              <button type="button" className={`pro-event-type-tab${type === 'endurance' ? ' active' : ''}`} onClick={() => setType('endurance')}>
                {t('champ_type_endurance')}
              </button>
            </div>

            <div className="champ-section-label" style={{ marginTop: '1rem' }}>{t('champ_points_label')}</div>
            <PointsTableEditor value={pointsTable} onChange={setPointsTable} t={t} />

            <label className="planner-field planner-field-compact" style={{ marginTop: '1rem' }}>
              <span>🔒 {t('champ_admin_password_label')}</span>
              <input type="password" value={newChampPassword} onChange={(e) => setNewChampPassword(e.target.value)}
                placeholder={t('champ_admin_password_ph')} />
            </label>
            <p className="champ-password-hint">{t('champ_admin_password_hint')}</p>

            <div className="champ-create-footer" style={{ marginTop: '1.5rem' }}>
              <button type="button" className="btn-muted" onClick={() => setView('list')}>{t('champ_cancel')}</button>
              <button type="button" className="btn-primary" onClick={handleCreate} disabled={!name.trim()}>
                {t('champ_create_btn')}
              </button>
            </div>
          </div>
        )}

        {/* ── DETAIL ── */}
        {view === 'detail' && selected && (
          <div className="champ-page-detail">
            <div className="champ-page-detail-header">
              <div>
                <h2>{selected.name}</h2>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.25rem' }}>
                  <span className={`champ-type-badge champ-type-${selected.type}`}>{selected.type}</span>
                  {officialRoundCount > 0 && <span className="champ-official-count">🏅 {officialRoundCount} {t('champ_official_plural')}</span>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                {saving && <span className="champ-saving-badge">{t('champ_saving')}</span>}
                {!isEditor && selected.hasPassword && (
                  <ChampLoginWidget championship={selected} t={t} onUnlock={() => setIsEditor(true)} />
                )}
                {isEditor && <span className="champ-editor-badge">✏ {t('champ_editor_mode')}</span>}
              </div>
            </div>

            <div className="champ-edit-tabs">
              <button className={`champ-edit-tab${activeTab === 'rounds' ? ' active' : ''}`} onClick={() => setActiveTab('rounds')}>
                {t('champ_tab_rounds')} ({selected.rounds?.length || 0})
              </button>
              <button className={`champ-edit-tab${activeTab === 'standings' ? ' active' : ''}`} onClick={() => setActiveTab('standings')}>
                {t('champ_tab_standings')}
              </button>
              {isEditor && (
                <button className={`champ-edit-tab${activeTab === 'settings' ? ' active' : ''}`} onClick={() => setActiveTab('settings')}>
                  {t('champ_tab_settings')}
                </button>
              )}
            </div>

            {/* ROUNDS */}
            {activeTab === 'rounds' && (
              <div className="champ-rounds-panel">
                {editingRound !== null && selected.rounds[editingRound] ? (
                  <RoundEditor
                    round={selected.rounds[editingRound]}
                    championship={selected}
                    heatHistory={heatHistory}
                    onSave={(updated) => saveRound(editingRound, updated)}
                    onCancel={() => setEditingRound(null)}
                    isEditor={isEditor}
                    t={t}
                  />
                ) : (
                  <>
                    {(!selected.rounds || selected.rounds.length === 0) && (
                      <p className="champ-empty">{t('champ_rounds_empty')}</p>
                    )}
                    {(selected.rounds || []).map((r, i) => (
                      <div key={r.id} className={`champ-round-row${r.isOfficial ? ' champ-round-official' : ''}`}>
                        <div className="champ-round-info">
                          <span className="champ-round-num">{r.isOfficial ? '🏅' : ''}R{i + 1}</span>
                          <div className="champ-round-meta">
                            <span className="champ-round-label">{r.label || `Round ${i + 1}`}</span>
                            {r.date && <span className="champ-round-date">{r.date}{r.time ? ` · ${r.time}` : ''}</span>}
                            {r.trackSlug && <span className="champ-round-track">📍 {r.trackSlug}</span>}
                            <span className="champ-round-count">
                              {r.results?.length || 0} {selected.type === 'endurance' ? t('champ_round_teams') : t('champ_round_drivers')}
                              {r.results?.[0] && ` · ${t('champ_round_winner')}: ${r.results[0].name}`}
                            </span>
                            {!r.isOfficial && <span className="champ-unofficial-badge">⚠ {t('champ_unofficial_label')}</span>}
                            {r.eventPlan && <span className="champ-event-linked-badge">✓ {t('champ_event_linked')}</span>}
                          </div>
                        </div>
                        {isEditor && (
                          <div className="champ-round-actions">
                            <button type="button" className={`champ-action-btn${r.eventPlan ? ' is-active' : ''}`}
                              onClick={() => setPlanningRoundIndex(i)} title={t('champ_event_link_hint')}>
                              📋 {t('champ_plan_event')}
                            </button>
                            {r.eventPlan && r.trackSlug && (
                              <Link to={`/admin/${r.trackSlug}`} className="champ-action-btn">
                                🏁 {t('champ_open_admin')}
                              </Link>
                            )}
                            <button type="button" className="champ-action-btn" onClick={() => setEditingRound(i)}>
                              ✏ {t('champ_round_edit')}
                            </button>
                            <button type="button" className="champ-action-btn champ-action-delete" onClick={() => deleteRound(i)}>✕</button>
                          </div>
                        )}
                      </div>
                    ))}
                    {isEditor && (
                      <button type="button" className="btn-primary champ-add-round-btn" onClick={addRound}>
                        {t('champ_add_round')}
                      </button>
                    )}
                    {!isEditor && selected.hasPassword && (selected.rounds?.length === 0) && (
                      <p className="champ-empty" style={{ fontStyle: 'italic' }}>{t('champ_login_to_edit')}</p>
                    )}
                  </>
                )}
              </div>
            )}

            {/* STANDINGS */}
            {activeTab === 'standings' && (
              <div>
                {officialRoundCount > 0 && (
                  <div className="champ-standings-mode-toggle">
                    <button type="button"
                      className={`champ-action-btn${!showAllRounds ? ' is-active' : ''}`}
                      onClick={() => setShowAllRounds(false)}>
                      🏅 {t('champ_official_only')}
                    </button>
                    <button type="button"
                      className={`champ-action-btn${showAllRounds ? ' is-active' : ''}`}
                      onClick={() => setShowAllRounds(true)}>
                      {t('champ_all_rounds')}
                    </button>
                  </div>
                )}
                <StandingsTable championship={selected} showAllRounds={showAllRounds || officialRoundCount === 0} t={t} />
              </div>
            )}

            {/* SETTINGS — editor only */}
            {activeTab === 'settings' && isEditor && (
              <div className="champ-settings-panel">
                <label className="planner-field planner-field-compact">
                  <span>{t('champ_name_label')}</span>
                  <input type="text" dir="auto" value={settingsName} onChange={(e) => setSettingsName(e.target.value)} />
                </label>
                <div className="champ-section-label" style={{ marginTop: '1rem' }}>{t('champ_type_label')}</div>
                <div className="champ-type-tabs">
                  <button type="button" className={`pro-event-type-tab${settingsType === 'sprint' ? ' active' : ''}`} onClick={() => setSettingsType('sprint')}>
                    {t('champ_type_sprint')}
                  </button>
                  <button type="button" className={`pro-event-type-tab${settingsType === 'endurance' ? ' active' : ''}`} onClick={() => setSettingsType('endurance')}>
                    {t('champ_type_endurance')}
                  </button>
                </div>
                <div className="champ-section-label" style={{ marginTop: '1rem' }}>{t('champ_points_label')}</div>
                <PointsTableEditor value={settingsPoints} onChange={setSettingsPoints} t={t} />

                <label className="planner-field planner-field-compact" style={{ marginTop: '1rem' }}>
                  <span>🔒 {t('champ_change_password_label')}</span>
                  <input type="password" value={settingsPassword} onChange={(e) => setSettingsPassword(e.target.value)}
                    placeholder={t('champ_change_password_ph')} />
                </label>

                <div className="champ-settings-footer" style={{ marginTop: '1.5rem' }}>
                  <button type="button" className="champ-action-btn champ-action-delete"
                    onClick={() => { if (window.confirm(t('champ_delete_confirm', { name: selected.name }))) deleteChampionship(selected.id); }}>
                    {t('champ_delete')}
                  </button>
                  <button type="button" className="btn-primary" onClick={saveSettings}>
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
