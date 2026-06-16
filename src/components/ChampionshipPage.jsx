import React, { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import HakafastLogo from './HakafastLogo.jsx';
import {
  createChampionship,
  createRound,
  computeStandings,
  exportStandingsCsv,
  resultsFromHeatHistory,
  parseRoundResultsCsv,
  normalizeChampionship,
  DEFAULT_POINTS_TABLES,
} from '../utils/championshipHelpers.js';
import { apiFetch } from '../utils/apiClient.js';
import { COUNTRIES, countryFlag } from '../data/countries.js';
import '../assets/AdminPanel.css';

const PRESET_LABELS = {
  karting: 'Karting (15·12·10·8·6·4·3·2·1)',
  f1: 'F1 (25·18·15·12·10·8·6·4·2·1)',
  top5: 'Top 5 (10·7·5·3·1)',
  simple: 'Podium (3·2·1)',
};

function downloadTextFile(filename, content) {
  const blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function PointsTableEditor({ value, onChange }) {
  const [text, setText] = useState(value.join(', '));

  useEffect(() => {
    setText(value.join(', '));
  }, [value]);

  function commit(raw) {
    const pts = raw.split(/[,;\s]+/).map((s) => parseInt(s.trim(), 10)).filter((n) => !Number.isNaN(n) && n >= 0);
    if (pts.length) onChange(pts);
  }

  return (
    <div className="champ-points-editor">
      <div className="champ-points-presets">
        {Object.entries(PRESET_LABELS).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`champ-preset-btn${JSON.stringify(value) === JSON.stringify(DEFAULT_POINTS_TABLES[key]) ? ' is-active' : ''}`}
            onClick={() => { onChange(DEFAULT_POINTS_TABLES[key]); setText(DEFAULT_POINTS_TABLES[key].join(', ')); }}
          >
            {label}
          </button>
        ))}
      </div>
      <label className="planner-field planner-field-compact" style={{ marginTop: '0.4rem' }}>
        <span>Custom (P1, P2, P3…)</span>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          placeholder="25, 18, 15, 12, 10…"
        />
      </label>
      <div className="champ-points-preview">
        {value.map((pts, i) => (
          <span key={i} className="champ-pts-chip">P{i + 1}={pts}</span>
        ))}
      </div>
    </div>
  );
}

function DriverRow({ driver, index, isEndurance, onUpdate, onRemove, onMoveUp, onMoveDown, total }) {
  return (
    <li className="champ-result-row">
      <span className="champ-pos">{index + 1}</span>
      <input
        type="text"
        dir="auto"
        className="champ-result-name-input"
        value={driver.name}
        onChange={(e) => onUpdate({ ...driver, name: e.target.value })}
        placeholder={isEndurance ? 'Team name' : 'Driver name'}
        autoComplete="off"
      />
      {!isEndurance && (
        <>
          <select
            className="champ-result-nation"
            value={driver.nationality || ''}
            onChange={(e) => onUpdate({ ...driver, nationality: e.target.value })}
            title="Nationality"
          >
            <option value="">—</option>
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>{countryFlag(c.code)} {c.name}</option>
            ))}
          </select>
          <input
            type="text"
            dir="ltr"
            className="champ-result-kart"
            value={driver.kartNumber || ''}
            onChange={(e) => onUpdate({ ...driver, kartNumber: e.target.value })}
            placeholder="#"
            title="Kart number"
          />
        </>
      )}
      {isEndurance && (
        <input
          type="text"
          dir="auto"
          className="champ-result-drivers-input"
          value={(driver.drivers || []).join(', ')}
          onChange={(e) => onUpdate({ ...driver, drivers: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
          placeholder="Driver 1, Driver 2…"
          title="Drivers who participated"
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

function RoundEditor({ round, championship, heatHistory, onSave, onCancel }) {
  const [label, setLabel] = useState(round.label || '');
  const [date, setDate] = useState(round.date || '');
  const [results, setResults] = useState(() =>
    (round.results || []).map((r) => ({ ...r, nationality: r.nationality || '', kartNumber: r.kartNumber || '' }))
  );
  const [csvText, setCsvText] = useState('');
  const [csvMode, setCsvMode] = useState(false);
  const [addName, setAddName] = useState('');
  const isEndurance = championship.type === 'endurance';

  function addResult() {
    if (!addName.trim()) return;
    setResults((prev) => [...prev, {
      name: addName.trim(),
      position: prev.length + 1,
      nationality: '',
      kartNumber: '',
      ...(isEndurance ? { drivers: [] } : {}),
    }]);
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
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next.map((r, idx) => ({ ...r, position: idx + 1 }));
    });
  }

  function applyCSV() {
    const parsed = parseRoundResultsCsv(csvText);
    if (parsed.length) {
      setResults(parsed.map((r) => ({ ...r, nationality: '', kartNumber: '', ...(isEndurance ? { drivers: [] } : {}) })));
      setCsvMode(false);
      setCsvText('');
    }
  }

  function importFromHeat(entry) {
    const res = resultsFromHeatHistory(entry, championship.type);
    setResults(res.map((r) => ({ ...r, nationality: '', kartNumber: '', ...(isEndurance ? { drivers: r.drivers || [] } : {}) })));
  }

  return (
    <div className="champ-round-editor">
      <div className="champ-round-editor-header">
        <h3>
          {round.label ? `Editing: ${round.label}` : 'New Round'}
        </h3>
        <button type="button" className="admin-modal-close champ-inline-close" onClick={onCancel}>×</button>
      </div>

      <div className="champ-round-editor-fields">
        <label className="planner-field planner-field-compact">
          <span>Round label</span>
          <input type="text" dir="auto" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Round 1 – Location" autoFocus />
        </label>
        <label className="planner-field planner-field-compact">
          <span>Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>

      {heatHistory?.length > 0 && (
        <div className="champ-heat-import">
          <span className="champ-section-label">Import from heat history</span>
          <div className="champ-heat-list">
            {heatHistory.slice().reverse().slice(0, 15).map((h, i) => (
              <button
                key={i}
                type="button"
                className="champ-heat-chip"
                onClick={() => importFromHeat(h)}
                title={`${h.results?.length || 0} entries`}
              >
                #{h.heat_number}{h.heat_type ? ` · ${h.heat_type}` : ''}{h.results?.length ? ` (${h.results.length})` : ''}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="champ-results-section">
        <div className="champ-results-toolbar">
          <span className="champ-section-label">Results — {results.length} {isEndurance ? 'teams' : 'drivers'}</span>
          <button
            type="button"
            className={`champ-action-btn${csvMode ? ' is-active' : ''}`}
            onClick={() => setCsvMode((v) => !v)}
          >
            CSV paste
          </button>
        </div>

        {csvMode && (
          <div className="champ-csv-paste">
            <textarea
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder={'1,Driver A\n2,Driver B\n3,Driver C'}
              rows={6}
            />
            <button type="button" className="btn-muted" onClick={applyCSV}>Apply</button>
          </div>
        )}

        <ol className="champ-results-list">
          {results.map((r, i) => (
            <DriverRow
              key={i}
              index={i}
              driver={r}
              isEndurance={isEndurance}
              total={results.length}
              onUpdate={(updated) => updateResult(i, updated)}
              onRemove={() => removeResult(i)}
              onMoveUp={() => moveResult(i, -1)}
              onMoveDown={() => moveResult(i, 1)}
            />
          ))}
          {results.length === 0 && (
            <li className="champ-empty" style={{ listStyle: 'none' }}>No results yet — add drivers below or import from a heat</li>
          )}
        </ol>

        <div className="champ-add-result">
          <input
            type="text"
            dir="auto"
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addResult(); } }}
            placeholder={isEndurance ? '+ Team name…' : '+ Driver name…'}
          />
          <button type="button" className="btn-muted" onClick={addResult} disabled={!addName.trim()}>Add</button>
        </div>
      </div>

      <div className="champ-round-editor-footer">
        <button type="button" className="btn-muted" onClick={onCancel}>Cancel</button>
        <button
          type="button"
          className="btn-primary"
          onClick={() => onSave({ ...round, label: label || `Round ${Date.now()}`, date: date || null, results })}
        >
          Save round
        </button>
      </div>
    </div>
  );
}

function StandingsTable({ championship }) {
  const standings = computeStandings(championship);
  const { rounds = [], type } = championship;
  const isEndurance = type === 'endurance';

  if (!rounds.length) {
    return <p className="champ-empty">No rounds yet. Add a round to see standings.</p>;
  }

  return (
    <div className="champ-standings">
      <div className="champ-standings-toolbar">
        <button
          type="button"
          className="champ-action-btn"
          onClick={() => downloadTextFile(`${championship.name || 'championship'}-standings.csv`, exportStandingsCsv(championship))}
        >
          ⬇ Export CSV
        </button>
      </div>
      <div className="champ-standings-table-wrap">
        <table className="champ-standings-table">
          <thead>
            <tr>
              <th>Pos</th>
              <th>{isEndurance ? 'Team' : 'Driver'}</th>
              <th>Pts</th>
              <th title="Wins">W</th>
              {rounds.map((r, i) => (
                <th key={i} className="champ-round-th" title={r.date || ''}>
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
            {!standings.length && (
              <tr><td colSpan={4 + rounds.length} className="champ-empty">No results entered yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ChampionshipPage() {
  const { t } = useLanguage();
  const { trackName } = useParams();
  const trackSlug = trackName || null;

  const [championships, setChampionships] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState(null);
  const [view, setView] = useState('list'); // 'list' | 'create' | 'detail'
  const [activeTab, setActiveTab] = useState('rounds'); // 'rounds' | 'standings' | 'settings'
  const [editingRound, setEditingRound] = useState(null); // round index or null
  const [heatHistory, setHeatHistory] = useState([]);

  // Create form
  const [name, setName] = useState('');
  const [type, setType] = useState('sprint');
  const [pointsTable, setPointsTable] = useState([...DEFAULT_POINTS_TABLES.karting]);

  // Settings form (mirrors selected when open)
  const [settingsName, setSettingsName] = useState('');
  const [settingsType, setSettingsType] = useState('sprint');
  const [settingsPoints, setSettingsPoints] = useState([...DEFAULT_POINTS_TABLES.karting]);

  useEffect(() => {
    loadChampionships();
    loadHeatHistory();
  }, []);

  async function loadChampionships() {
    setLoading(true);
    try {
      const res = await apiFetch('/api/championships');
      if (res.ok) {
        const data = await res.json();
        const list = (data.championships || []).map(normalizeChampionship).filter(Boolean);
        setChampionships(list);
      }
    } catch { /* offline/demo */ } finally {
      setLoading(false);
    }
  }

  async function loadHeatHistory() {
    try {
      const res = await apiFetch('/api/results/list?limit=50');
      if (res.ok) {
        const data = await res.json();
        setHeatHistory(data.heats || []);
      }
    } catch { /* ignore */ }
  }

  async function persist(list) {
    setSaving(true);
    try {
      await apiFetch('/api/championships', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ championships: list }),
      });
    } catch { /* ignore */ } finally {
      setSaving(false);
    }
    setChampionships(list);
  }

  function handleCreate() {
    if (!name.trim()) return;
    const c = createChampionship({ name: name.trim(), type, pointsTable });
    const next = [...championships, c];
    persist(next);
    openDetail(c);
    setName('');
  }

  function openDetail(c) {
    setSelected(c);
    setSettingsName(c.name);
    setSettingsType(c.type);
    setSettingsPoints([...c.pointsTable]);
    setActiveTab('rounds');
    setEditingRound(null);
    setView('detail');
  }

  function updateSelected(patch) {
    const updated = { ...selected, ...patch, updatedAt: Date.now() };
    setSelected(updated);
    const next = championships.map((c) => c.id === updated.id ? updated : c);
    persist(next);
  }

  function deleteChampionship(id) {
    const next = championships.filter((c) => c.id !== id);
    persist(next);
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
    updateSelected({ name: settingsName.trim(), type: settingsType, pointsTable: settingsPoints });
  }

  const adminLink = trackSlug ? `/admin/${trackSlug}` : '/admin';

  return (
    <div className="champ-page">
      <header className="champ-page-header">
        <div className="champ-page-header-brand">
          <HakafastLogo to="/" className="admin-header-logo" />
          <h1>🏆 {t('admin_championship')}</h1>
        </div>
        <nav className="champ-page-nav">
          {view !== 'list' && (
            <button type="button" className="champ-nav-btn" onClick={() => { setView('list'); setSelected(null); setEditingRound(null); }}>
              ← All championships
            </button>
          )}
          <Link to={adminLink} className="champ-nav-btn">
            ← {t('nav_admin')}
          </Link>
        </nav>
      </header>

      <main className="champ-page-body">

        {/* ── LIST ── */}
        {view === 'list' && (
          <div className="champ-page-list">
            <div className="champ-page-list-header">
              <h2>Championships</h2>
              <button type="button" className="btn-primary" onClick={() => setView('create')}>+ New</button>
            </div>

            {loading && <p className="champ-empty">Loading…</p>}

            {!loading && championships.length === 0 && (
              <div className="champ-onboarding">
                <div className="champ-onboarding-icon">🏆</div>
                <p>Track driver or team points across multiple race events.</p>
                <p>Create a championship, add rounds with results, and watch standings update automatically.</p>
                <button type="button" className="btn-primary" style={{ marginTop: '1rem' }} onClick={() => setView('create')}>
                  Create your first championship
                </button>
              </div>
            )}

            {championships.map((c) => {
              const standings = computeStandings(c);
              const leader = standings[0];
              return (
                <div key={c.id} className="champ-list-card" onClick={() => openDetail(c)}>
                  <div className="champ-list-card-body">
                    <span className="champ-list-name">{c.name}</span>
                    <span className={`champ-type-badge champ-type-${c.type}`}>{c.type}</span>
                    <span className="champ-list-meta">{c.rounds?.length || 0} rounds</span>
                    {leader && <span className="champ-list-leader">P1: {leader.name} — {leader.points} pts</span>}
                  </div>
                  <button
                    type="button"
                    className="champ-action-btn champ-action-delete"
                    onClick={(e) => { e.stopPropagation(); deleteChampionship(c.id); }}
                    title="Delete championship"
                  >✕</button>
                </div>
              );
            })}
          </div>
        )}

        {/* ── CREATE ── */}
        {view === 'create' && (
          <div className="champ-page-create">
            <div className="champ-page-section-header">
              <h2>New Championship</h2>
              <button type="button" className="champ-nav-btn" onClick={() => setView('list')}>← Back</button>
            </div>

            <label className="planner-field planner-field-compact">
              <span>Championship name</span>
              <input
                type="text"
                dir="auto"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) handleCreate(); }}
                placeholder="2025 Sprint League"
                autoFocus
              />
            </label>

            <div className="champ-section-label" style={{ marginTop: '1rem' }}>Race type</div>
            <div className="champ-type-tabs">
              <button
                type="button"
                className={`pro-event-type-tab${type === 'sprint' ? ' active' : ''}`}
                onClick={() => setType('sprint')}
              >
                Sprint — individual drivers
              </button>
              <button
                type="button"
                className={`pro-event-type-tab${type === 'endurance' ? ' active' : ''}`}
                onClick={() => setType('endurance')}
              >
                Endurance — teams
              </button>
            </div>

            <div className="champ-section-label" style={{ marginTop: '1rem' }}>Points table</div>
            <PointsTableEditor value={pointsTable} onChange={setPointsTable} />

            <div className="champ-create-footer" style={{ marginTop: '1.5rem' }}>
              <button type="button" className="btn-muted" onClick={() => setView('list')}>Cancel</button>
              <button type="button" className="btn-primary" onClick={handleCreate} disabled={!name.trim()}>
                Create championship
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
                <span className={`champ-type-badge champ-type-${selected.type}`}>{selected.type}</span>
              </div>
              {saving && <span className="champ-saving-badge">Saving…</span>}
            </div>

            <div className="champ-edit-tabs">
              <button className={`champ-edit-tab${activeTab === 'rounds' ? ' active' : ''}`} onClick={() => setActiveTab('rounds')}>
                Rounds ({selected.rounds?.length || 0})
              </button>
              <button className={`champ-edit-tab${activeTab === 'standings' ? ' active' : ''}`} onClick={() => setActiveTab('standings')}>
                Standings
              </button>
              <button className={`champ-edit-tab${activeTab === 'settings' ? ' active' : ''}`} onClick={() => setActiveTab('settings')}>
                Settings
              </button>
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
                  />
                ) : (
                  <>
                    {(!selected.rounds || selected.rounds.length === 0) && (
                      <p className="champ-empty">No rounds yet. Add a round to start tracking results and points.</p>
                    )}
                    {(selected.rounds || []).map((r, i) => {
                      const pts = computeStandings(selected);
                      return (
                        <div key={r.id} className="champ-round-row">
                          <div className="champ-round-info">
                            <span className="champ-round-num">R{i + 1}</span>
                            <div className="champ-round-meta">
                              <span className="champ-round-label">{r.label || `Round ${i + 1}`}</span>
                              {r.date && <span className="champ-round-date">{r.date}</span>}
                              <span className="champ-round-count">
                                {r.results?.length || 0} {selected.type === 'endurance' ? 'teams' : 'drivers'}
                                {r.results?.[0] && ` · P1: ${r.results[0].name}`}
                              </span>
                            </div>
                          </div>
                          <div className="champ-round-actions">
                            <button type="button" className="champ-action-btn" onClick={() => setEditingRound(i)}>✏ Edit</button>
                            <button type="button" className="champ-action-btn champ-action-delete" onClick={() => deleteRound(i)}>✕</button>
                          </div>
                        </div>
                      );
                    })}
                    <button type="button" className="btn-primary champ-add-round-btn" onClick={addRound}>
                      + Add round
                    </button>
                  </>
                )}
              </div>
            )}

            {/* STANDINGS */}
            {activeTab === 'standings' && (
              <StandingsTable championship={selected} />
            )}

            {/* SETTINGS */}
            {activeTab === 'settings' && (
              <div className="champ-settings-panel">
                <label className="planner-field planner-field-compact">
                  <span>Championship name</span>
                  <input type="text" dir="auto" value={settingsName} onChange={(e) => setSettingsName(e.target.value)} />
                </label>

                <div className="champ-section-label" style={{ marginTop: '1rem' }}>Race type</div>
                <div className="champ-type-tabs">
                  <button
                    type="button"
                    className={`pro-event-type-tab${settingsType === 'sprint' ? ' active' : ''}`}
                    onClick={() => setSettingsType('sprint')}
                  >
                    Sprint — individual drivers
                  </button>
                  <button
                    type="button"
                    className={`pro-event-type-tab${settingsType === 'endurance' ? ' active' : ''}`}
                    onClick={() => setSettingsType('endurance')}
                  >
                    Endurance — teams
                  </button>
                </div>

                <div className="champ-section-label" style={{ marginTop: '1rem' }}>Points table</div>
                <PointsTableEditor value={settingsPoints} onChange={setSettingsPoints} />

                <div className="champ-settings-footer" style={{ marginTop: '1.5rem' }}>
                  <button
                    type="button"
                    className="champ-action-btn champ-action-delete"
                    onClick={() => { if (window.confirm(`Delete "${selected.name}"?`)) deleteChampionship(selected.id); }}
                  >
                    Delete championship
                  </button>
                  <button type="button" className="btn-primary" onClick={saveSettings}>
                    Save settings
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
