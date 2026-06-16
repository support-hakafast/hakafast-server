import React, { useState, useEffect, useCallback } from 'react';
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

function downloadTextFile(filename, content, mimeType = 'text/csv;charset=utf-8') {
  const blob = new Blob(['﻿' + content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const PRESET_LABELS = {
  classic: 'Classic (30-25-21-18-15-12-9-6-3-1)',
  karting: 'Karting (15-12-10-8-6-4-3-2-1)',
  f1: 'F1 (25-18-15-12-10-8-6-4-2-1)',
  top5: 'Top 5 (10-7-5-3-1)',
  simple: 'Podium only (3-2-1)',
};

function PointsTableEditor({ value, onChange }) {
  const [text, setText] = useState(value.join(', '));

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
      <div className="champ-points-custom">
        <label className="planner-field planner-field-compact">
          <span>Custom points (P1, P2, P3, …)</span>
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={(e) => commit(e.target.value)}
            placeholder="25, 18, 15, 12, 10, 8, 6, 4, 2, 1"
          />
        </label>
        <div className="champ-points-preview">
          {value.map((pts, i) => (
            <span key={i} className="champ-pts-chip">P{i + 1}={pts}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function RoundRow({ round, roundIndex, championship, onEdit, onDelete, onImportFromHeat, t }) {
  const resultCount = round.results?.length || 0;
  return (
    <div className="champ-round-row">
      <div className="champ-round-info">
        <span className="champ-round-num">R{roundIndex + 1}</span>
        <div className="champ-round-meta">
          <span className="champ-round-label">{round.label || `Round ${roundIndex + 1}`}</span>
          {round.date && <span className="champ-round-date">{round.date}</span>}
          <span className="champ-round-count">{resultCount} {championship.type === 'endurance' ? 'teams' : 'drivers'}</span>
        </div>
      </div>
      <div className="champ-round-actions">
        <button type="button" className="champ-action-btn" onClick={() => onEdit(roundIndex)}>✏ Edit</button>
        <button type="button" className="champ-action-btn" onClick={() => onImportFromHeat(roundIndex)}>⬇ From heat</button>
        <button type="button" className="champ-action-btn champ-action-delete" onClick={() => onDelete(roundIndex)}>✕</button>
      </div>
    </div>
  );
}

function RoundEditor({ round, championship, heatHistory, onSave, onCancel, t }) {
  const [label, setLabel] = useState(round.label || '');
  const [date, setDate] = useState(round.date || '');
  const [results, setResults] = useState(round.results || []);
  const [csvText, setCsvText] = useState('');
  const [csvMode, setCsvMode] = useState(false);
  const [editingRow, setEditingRow] = useState(null); // index being edited
  const [addName, setAddName] = useState('');

  const isEndurance = championship.type === 'endurance';

  function addResult() {
    if (!addName.trim()) return;
    setResults((prev) => [...prev, { name: addName.trim(), position: prev.length + 1, ...(isEndurance ? { drivers: [] } : {}) }]);
    setAddName('');
  }

  function removeResult(i) {
    setResults((prev) => {
      const next = prev.filter((_, idx) => idx !== i);
      return next.map((r, idx) => ({ ...r, position: idx + 1 }));
    });
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
      setResults(parsed);
      setCsvMode(false);
      setCsvText('');
    }
  }

  function importFromHeat(entry) {
    const res = resultsFromHeatHistory(entry, championship.type);
    setResults(res);
  }

  return (
    <div className="champ-round-editor">
      <div className="champ-round-editor-header">
        <h3>Edit Round</h3>
        <button type="button" className="admin-modal-close" onClick={onCancel}>×</button>
      </div>

      <div className="champ-round-editor-fields">
        <label className="planner-field planner-field-compact">
          <span>Round label</span>
          <input type="text" dir="auto" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Round 1 – Location" />
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
            {heatHistory.slice().reverse().slice(0, 10).map((h, i) => (
              <button
                key={i}
                type="button"
                className="champ-heat-chip"
                onClick={() => importFromHeat(h)}
                title={`Heat #${h.heat_number} · ${h.results?.length || 0} entries`}
              >
                #{h.heat_number} {h.heat_type && `· ${h.heat_type}`}
                {h.results?.length ? ` (${h.results.length})` : ''}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="champ-results-section">
        <div className="champ-results-toolbar">
          <span className="champ-section-label">Results</span>
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
              placeholder={'Pos,Name\n1,Driver A\n2,Driver B\n3,Driver C'}
              rows={6}
            />
            <button type="button" className="btn-muted" onClick={applyCSV}>Apply</button>
          </div>
        )}

        <ol className="champ-results-list">
          {results.map((r, i) => (
            <li key={i} className="champ-result-row">
              <span className="champ-pos">{r.position}</span>
              <span className="champ-result-name">{r.name}</span>
              {isEndurance && r.drivers?.length > 0 && (
                <span className="champ-result-drivers">{r.drivers.join(', ')}</span>
              )}
              <div className="champ-result-controls">
                <button type="button" className="champ-mv-btn" onClick={() => moveResult(i, -1)} disabled={i === 0}>↑</button>
                <button type="button" className="champ-mv-btn" onClick={() => moveResult(i, 1)} disabled={i === results.length - 1}>↓</button>
                <button type="button" className="champ-mv-btn champ-action-delete" onClick={() => removeResult(i)}>✕</button>
              </div>
            </li>
          ))}
        </ol>

        <div className="champ-add-result">
          <input
            type="text"
            dir="auto"
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addResult(); } }}
            placeholder={isEndurance ? 'Team name…' : 'Driver name…'}
          />
          <button type="button" className="btn-muted" onClick={addResult} disabled={!addName.trim()}>
            + Add
          </button>
        </div>
      </div>

      <div className="champ-round-editor-footer">
        <button type="button" className="btn-muted" onClick={onCancel}>Cancel</button>
        <button
          type="button"
          className="btn-primary"
          onClick={() => onSave({ ...round, label, date: date || null, results })}
        >
          Save round
        </button>
      </div>
    </div>
  );
}

function StandingsView({ championship, t }) {
  const standings = computeStandings(championship);
  const { rounds = [], type } = championship;
  const isEndurance = type === 'endurance';

  if (!rounds.length) {
    return <p className="champ-empty">No rounds yet. Add a round to start tracking points.</p>;
  }

  function handleExport() {
    const csv = exportStandingsCsv(championship);
    downloadTextFile(`${championship.name || 'championship'}-standings.csv`, csv);
  }

  return (
    <div className="champ-standings">
      <div className="champ-standings-toolbar">
        <button type="button" className="champ-action-btn" onClick={handleExport}>⬇ Export CSV</button>
      </div>
      <div className="champ-standings-table-wrap">
        <table className="champ-standings-table">
          <thead>
            <tr>
              <th>Pos</th>
              <th>{isEndurance ? 'Team' : 'Driver'}</th>
              <th>Pts</th>
              <th>W</th>
              {rounds.map((r, i) => (
                <th key={i} title={r.date || ''} className="champ-round-th">
                  {r.label ? r.label.split(/[–-]/)[0].trim() : `R${i + 1}`}
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

export default function ChampionshipModal({ onClose, t, trackSlug, darkMode = false }) {
  const [championships, setChampionships] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState('list'); // 'list' | 'create' | 'edit' | 'standings'
  const [selected, setSelected] = useState(null); // championship object being edited
  const [editingRound, setEditingRound] = useState(null); // round index being edited, or 'new'
  const [heatHistory, setHeatHistory] = useState([]);
  const [activeTab, setActiveTab] = useState('rounds'); // 'rounds' | 'standings' | 'settings'

  // Form state for create / edit
  const [name, setName] = useState('');
  const [type, setType] = useState('sprint');
  const [pointsTable, setPointsTable] = useState([...DEFAULT_POINTS_TABLES.karting]);

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
        setChampionships((data.championships || []).map(normalizeChampionship).filter(Boolean));
      }
    } catch {
      // demo or offline — start empty
    } finally {
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

  async function saveChampionships(list) {
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

  function openCreate() {
    setName('');
    setType('sprint');
    setPointsTable([...DEFAULT_POINTS_TABLES.karting]);
    setView('create');
  }

  function handleCreate() {
    if (!name.trim()) return;
    const c = createChampionship({ name, type, pointsTable });
    const next = [...championships, c];
    saveChampionships(next);
    setSelected(c);
    setActiveTab('rounds');
    setView('edit');
  }

  function openEdit(c) {
    setSelected({ ...c });
    setName(c.name);
    setType(c.type);
    setPointsTable([...c.pointsTable]);
    setActiveTab('rounds');
    setView('edit');
    setEditingRound(null);
  }

  function deleteChampionship(id) {
    const next = championships.filter((c) => c.id !== id);
    saveChampionships(next);
    if (view === 'edit' && selected?.id === id) {
      setView('list');
      setSelected(null);
    }
  }

  function updateSelected(patch) {
    const updated = { ...selected, ...patch, updatedAt: Date.now() };
    setSelected(updated);
    const next = championships.map((c) => c.id === updated.id ? updated : c);
    saveChampionships(next);
  }

  function saveSettings() {
    updateSelected({ name, type, pointsTable });
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

  function importRoundFromHeat(ri) {
    setEditingRound(ri);
  }

  const isDark = darkMode;

  return (
    <div className="admin-modal-overlay" role="dialog" aria-modal="true" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`admin-modal admin-modal-wide champ-modal${isDark ? ' admin-modal-dark' : ' admin-modal-light'}`}>
        <header className="admin-modal-header">
          <div>
            <h2 className="admin-modal-title">
              {view === 'list' && '🏆 Championships'}
              {view === 'create' && 'New Championship'}
              {view === 'edit' && (selected?.name || 'Championship')}
            </h2>
          </div>
          <div className="champ-header-actions">
            {view === 'edit' && (
              <button type="button" className="btn-muted champ-back-btn" onClick={() => { setView('list'); setSelected(null); setEditingRound(null); }}>
                ← All
              </button>
            )}
            {view === 'create' && (
              <button type="button" className="btn-muted champ-back-btn" onClick={() => setView('list')}>
                ← Back
              </button>
            )}
            <button type="button" className="admin-modal-close" onClick={onClose}>×</button>
          </div>
        </header>

        <div className="champ-modal-body">

          {/* LIST VIEW */}
          {view === 'list' && (
            <div className="champ-list-view">
              {loading && <p className="champ-empty">Loading…</p>}
              {!loading && championships.length === 0 && (
                <div className="champ-onboarding">
                  <div className="champ-onboarding-icon">🏆</div>
                  <p>Track points across multiple race events. Create a championship to get started.</p>
                </div>
              )}
              {championships.map((c) => {
                const standings = computeStandings(c);
                const leader = standings[0];
                return (
                  <div key={c.id} className="champ-list-card" onClick={() => openEdit(c)}>
                    <div className="champ-list-card-body">
                      <span className="champ-list-name">{c.name}</span>
                      <span className={`champ-type-badge champ-type-${c.type}`}>{c.type}</span>
                      <span className="champ-list-meta">{c.rounds?.length || 0} rounds</span>
                      {leader && <span className="champ-list-leader">P1: {leader.name} ({leader.points} pts)</span>}
                    </div>
                    <button
                      type="button"
                      className="champ-action-btn champ-action-delete"
                      onClick={(e) => { e.stopPropagation(); deleteChampionship(c.id); }}
                    >✕</button>
                  </div>
                );
              })}
              <button type="button" className="btn-primary champ-create-btn" onClick={openCreate}>
                + New Championship
              </button>
            </div>
          )}

          {/* CREATE VIEW */}
          {view === 'create' && (
            <div className="champ-create-view">
              <label className="planner-field planner-field-compact">
                <span>Championship name</span>
                <input type="text" dir="auto" value={name} onChange={(e) => setName(e.target.value)} placeholder="2025 Sprint League" autoFocus />
              </label>

              <div className="champ-type-tabs">
                <button
                  type="button"
                  className={`pro-event-type-tab${type === 'sprint' ? ' active' : ''}`}
                  onClick={() => setType('sprint')}
                >
                  Sprint (individual)
                </button>
                <button
                  type="button"
                  className={`pro-event-type-tab${type === 'endurance' ? ' active' : ''}`}
                  onClick={() => setType('endurance')}
                >
                  Endurance (teams)
                </button>
              </div>

              <div className="champ-section-label">Points table</div>
              <PointsTableEditor value={pointsTable} onChange={setPointsTable} />

              <div className="champ-create-footer">
                <button type="button" className="btn-muted" onClick={() => setView('list')}>Cancel</button>
                <button type="button" className="btn-primary" onClick={handleCreate} disabled={!name.trim()}>
                  Create championship
                </button>
              </div>
            </div>
          )}

          {/* EDIT VIEW */}
          {view === 'edit' && selected && (
            <div className="champ-edit-view">
              <div className="champ-edit-tabs">
                <button type="button" className={`champ-edit-tab${activeTab === 'rounds' ? ' active' : ''}`} onClick={() => setActiveTab('rounds')}>
                  Rounds
                </button>
                <button type="button" className={`champ-edit-tab${activeTab === 'standings' ? ' active' : ''}`} onClick={() => setActiveTab('standings')}>
                  Standings
                </button>
                <button type="button" className={`champ-edit-tab${activeTab === 'settings' ? ' active' : ''}`} onClick={() => setActiveTab('settings')}>
                  Settings
                </button>
              </div>

              {/* ROUNDS TAB */}
              {activeTab === 'rounds' && (
                <div className="champ-rounds-panel">
                  {editingRound !== null ? (
                    <RoundEditor
                      round={selected.rounds[editingRound]}
                      championship={selected}
                      heatHistory={heatHistory}
                      onSave={(updated) => saveRound(editingRound, updated)}
                      onCancel={() => setEditingRound(null)}
                      t={t}
                    />
                  ) : (
                    <>
                      {(!selected.rounds || selected.rounds.length === 0) && (
                        <p className="champ-empty">No rounds yet. Add a round to start tracking results.</p>
                      )}
                      {(selected.rounds || []).map((r, i) => (
                        <RoundRow
                          key={r.id}
                          round={r}
                          roundIndex={i}
                          championship={selected}
                          onEdit={(ri) => setEditingRound(ri)}
                          onDelete={deleteRound}
                          onImportFromHeat={importRoundFromHeat}
                          t={t}
                        />
                      ))}
                      <button type="button" className="btn-primary champ-add-round-btn" onClick={addRound}>
                        + Add round
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* STANDINGS TAB */}
              {activeTab === 'standings' && (
                <StandingsView championship={selected} t={t} />
              )}

              {/* SETTINGS TAB */}
              {activeTab === 'settings' && (
                <div className="champ-settings-panel">
                  <label className="planner-field planner-field-compact">
                    <span>Championship name</span>
                    <input type="text" dir="auto" value={name} onChange={(e) => setName(e.target.value)} />
                  </label>

                  <div className="champ-type-tabs">
                    <button
                      type="button"
                      className={`pro-event-type-tab${type === 'sprint' ? ' active' : ''}`}
                      onClick={() => setType('sprint')}
                    >
                      Sprint (individual)
                    </button>
                    <button
                      type="button"
                      className={`pro-event-type-tab${type === 'endurance' ? ' active' : ''}`}
                      onClick={() => setType('endurance')}
                    >
                      Endurance (teams)
                    </button>
                  </div>

                  <div className="champ-section-label">Points table</div>
                  <PointsTableEditor value={pointsTable} onChange={setPointsTable} />

                  <div className="champ-settings-footer">
                    <button type="button" className="btn-primary" onClick={saveSettings} disabled={saving}>
                      {saving ? 'Saving…' : 'Save settings'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
