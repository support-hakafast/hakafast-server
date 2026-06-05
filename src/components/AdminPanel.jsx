import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import '../assets/AdminPanel.css';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import LanguageSwitcher from './LanguageSwitcher.jsx';
import HakafastLogo from './HakafastLogo.jsx';
import DraggablePanel from './DraggablePanel.jsx';
import {
  computeInitialLayout,
  resolveCollisions,
  sanitizeStoredLayout,
  PANEL_SIZES,
} from '../utils/panelLayout.js';
import { isStrongPassword } from '../utils/password.js';
import {
  parseKartNumbers,
  parseDriverNames,
  isBulkDriverInput,
  downloadCsv,
  printPdf,
} from '../utils/adminHelpers.js';

const PANEL_KEYS = ['heat', 'warehouse', 'pits', 'drivers', 'editLevel'];

const DEFAULT_LINES = {
  1: { name: 'ליין 1', active: true, karts: [] },
  2: { name: 'ליין 2', active: true, karts: [] },
};

function normalizeLinesData(data) {
  if (!data) return { ...DEFAULT_LINES };
  if (Array.isArray(data)) {
    const obj = {};
    data.forEach((lane) => {
      obj[lane.id] = {
        name: lane.name,
        active: lane.active,
        karts: lane.karts || [],
      };
    });
    return Object.keys(obj).length ? obj : { ...DEFAULT_LINES };
  }
  return data;
}

function KartCard({ num, kart, onToggle, draggable }) {
  return (
    <div
      className={`kart-card${!kart.active ? ' disabled' : ''}`}
      draggable={draggable && kart.active}
      onDragStart={(e) => {
        if (!kart.active) {
          e.preventDefault();
          return;
        }
        e.dataTransfer.setData('text', String(num));
      }}
    >
      🏎️ {num}
      <button
        type="button"
        className="toggle-btn"
        onClick={(e) => onToggle(num, e)}
      >
        {kart.active ? 'X' : '+'}
      </button>
    </div>
  );
}

const AdminPanel = () => {
  const { trackName } = useParams();
  const { t } = useLanguage();

  const trackSlug = trackName || 'kart-demo';
  const liveTimingUrl = useMemo(
    () => `${window.location.origin}/live-timing/${trackSlug}`,
    [trackSlug],
  );

  const [panelPositions, setPanelPositions] = useState(() => computeInitialLayout());
  const [activePanel, setActivePanel] = useState(null);
  const [exportCsv, setExportCsv] = useState(true);
  const [exportPdf, setExportPdf] = useState(false);

  const confirmTwice = (msg1, msg2) => window.confirm(msg1) && window.confirm(msg2);

  const handlePanelPosition = useCallback((panelKey, pos, finalize) => {
    setPanelPositions((prev) => {
      let next = { ...prev, [panelKey]: pos };
      if (finalize) {
        next = resolveCollisions(panelKey, next, window.innerWidth, window.innerHeight);
        PANEL_KEYS.forEach((key) => {
          try {
            localStorage.setItem(`hf_panel_${trackSlug}-${key}`, JSON.stringify(next[key]));
          } catch {
            /* ignore */
          }
        });
      }
      return next;
    });
  }, [trackSlug]);

  const [allKarts, setAllKarts] = useState({});
  const [linesData, setLinesData] = useState({ ...DEFAULT_LINES });
  const [driverQueue, setDriverQueue] = useState([]);
  const [kartInput, setKartInput] = useState('');

  const [heatType, setHeatType] = useState('time');
  const [heatDuration, setHeatDuration] = useState(10);
  const [enduranceHours, setEnduranceHours] = useState(1);
  const [enduranceMinutes, setEnduranceMinutes] = useState(0);
  const [targetLaps, setTargetLaps] = useState('');

  const [drName, setDrName] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [chkPhone, setChkPhone] = useState(false);
  const [chkEmail, setChkEmail] = useState(false);
  const [drPhone, setDrPhone] = useState('');
  const [drEmail, setDrEmail] = useState('');
  const [drLevel, setDrLevel] = useState('Amateur');

  const [editLookup, setEditLookup] = useState('');
  const [editLevel, setEditLevel] = useState('Amateur');
  const [editPassword, setEditPassword] = useState('');
  const [masterLapThreshold, setMasterLapThreshold] = useState('45.500');
  const [proLapThreshold, setProLapThreshold] = useState('42.000');
  const [settingsPassword, setSettingsPassword] = useState('');

  const [dragOverLane, setDragOverLane] = useState(null);
  const [dragOverPool, setDragOverPool] = useState(false);

  const syncPitsWithServer = useCallback(async (lines) => {
    await fetch('/api/admin/update-pits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newLines: lines }),
    });
  }, []);

  useEffect(() => {
    fetch('/api/admin/pits')
      .then((r) => r.json())
      .then((data) => setLinesData(normalizeLinesData(data)))
      .catch(() => {});

    fetch('/api/heat-settings')
      .then((r) => r.json())
      .then((s) => {
        if (s?.type) setHeatType(s.type);
        if (s?.duration) setHeatDuration(s.duration);
        if (s?.targetLaps) setTargetLaps(String(s.targetLaps));
      })
      .catch(() => {});

    fetch('/api/admin/level-settings')
      .then((r) => r.json())
      .then((s) => {
        if (s?.masterLapThreshold) setMasterLapThreshold(s.masterLapThreshold);
        if (s?.proLapThreshold) setProLapThreshold(s.proLapThreshold);
      })
      .catch(() => {});

    const stored = {};
    PANEL_KEYS.forEach((key) => {
      try {
        const raw = localStorage.getItem(`hf_panel_${trackSlug}-${key}`);
        if (raw) stored[key] = JSON.parse(raw);
      } catch {
        /* ignore */
      }
    });
    setPanelPositions(sanitizeStoredLayout(stored, window.innerWidth, window.innerHeight));
  }, [trackSlug]);

  const levelLabel = (level) => {
    const key = `level_${(level || 'Amateur').toLowerCase()}`;
    return t(key);
  };

  const addKartEntity = (num) => {
    setAllKarts((prev) => {
      if (prev[num]) return prev;
      return { ...prev, [num]: { number: num, active: true, lane: null } };
    });
  };

  const addKartsFromInput = () => {
    const val = kartInput.trim();
    if (!val) return;
    parseKartNumbers(val).forEach((num) => addKartEntity(num));
    setKartInput('');
  };

  const toggleKartActive = (num, event) => {
    event.stopPropagation();
    const kart = allKarts[num];
    if (!kart) return;

    const nextActive = !kart.active;
    let updatedLines = linesData;

    if (!nextActive && kart.lane != null && linesData[kart.lane]) {
      updatedLines = {
        ...linesData,
        [kart.lane]: {
          ...linesData[kart.lane],
          karts: linesData[kart.lane].karts.filter((x) => Number(x) !== Number(num)),
        },
      };
      setLinesData(updatedLines);
      syncPitsWithServer(updatedLines);
    }

    setAllKarts((prev) => ({
      ...prev,
      [num]: {
        ...kart,
        active: nextActive,
        lane: nextActive ? kart.lane : null,
      },
    }));
  };

  const dropKart = (num, laneNum) => {
    const kart = allKarts[num];
    if (!kart) return;

    const updatedLines = { ...linesData };
    if (kart.lane != null && updatedLines[kart.lane]) {
      updatedLines[kart.lane] = {
        ...updatedLines[kart.lane],
        karts: updatedLines[kart.lane].karts.filter((x) => Number(x) !== Number(num)),
      };
    }
    if (laneNum != null && updatedLines[laneNum]) {
      const karts = updatedLines[laneNum].karts;
      if (!karts.map(Number).includes(Number(num))) {
        updatedLines[laneNum] = { ...updatedLines[laneNum], karts: [...karts, Number(num)] };
      }
    }

    setAllKarts((prev) => ({
      ...prev,
      [num]: { ...kart, lane: laneNum },
    }));
    setLinesData(updatedLines);
    syncPitsWithServer(updatedLines);
  };

  const handleDropToLane = (e, laneNum) => {
    e.preventDefault();
    setDragOverLane(null);
    const num = parseInt(e.dataTransfer.getData('text'), 10);
    if (!Number.isNaN(num)) dropKart(num, laneNum);
  };

  const handleDropToPool = (e) => {
    e.preventDefault();
    setDragOverPool(false);
    const num = parseInt(e.dataTransfer.getData('text'), 10);
    if (!Number.isNaN(num)) dropKart(num, null);
  };

  const addNewLane = () => {
    setLinesData((lines) => {
      const ids = Object.keys(lines).map(Number);
      const newId = ids.length ? Math.max(...ids) + 1 : 1;
      const updated = {
        ...lines,
        [newId]: {
          name: `${t('admin_lane_default')} ${newId}`,
          active: true,
          karts: [],
        },
      };
      syncPitsWithServer(updated);
      return updated;
    });
  };

  const toggleLaneEnabled = (laneId) => {
    setLinesData((lines) => {
      const updated = {
        ...lines,
        [laneId]: { ...lines[laneId], active: !lines[laneId].active },
      };
      syncPitsWithServer(updated);
      return updated;
    });
  };

  const handleToggleLane = (laneId) => {
    const lane = linesData[laneId];
    if (!lane) return;
    if (lane.active) {
      if (!confirmTwice(t('admin_confirm_disable_lane'), t('admin_confirm_disable_lane_final'))) return;
    }
    toggleLaneEnabled(laneId);
  };

  const changeLaneName = (laneId, newName) => {
    setLinesData((lines) => {
      const updated = {
        ...lines,
        [laneId]: {
          ...lines[laneId],
          name: newName.trim() || `${t('admin_lane_default')} ${laneId}`,
        },
      };
      syncPitsWithServer(updated);
      return updated;
    });
  };

  const removeLane = (laneId) => {
    if (!linesData[laneId]) return;

    const kartsToScatter = [...linesData[laneId].karts];
    const otherLanes = Object.keys(linesData).filter(
      (id) => id !== String(laneId) && linesData[id].active,
    );
    const updated = { ...linesData };
    const kartUpdates = {};

    kartsToScatter.forEach((num) => {
      if (otherLanes.length > 0) {
        const randomLane = otherLanes[Math.floor(Math.random() * otherLanes.length)];
        updated[randomLane] = {
          ...updated[randomLane],
          karts: [...updated[randomLane].karts, num],
        };
        kartUpdates[num] = Number(randomLane);
      } else {
        kartUpdates[num] = null;
      }
    });

    delete updated[laneId];

    setAllKarts((prev) => {
      const next = { ...prev };
      Object.entries(kartUpdates).forEach(([num, lane]) => {
        if (next[num]) next[num] = { ...next[num], lane };
      });
      return next;
    });
    setLinesData(updated);
    syncPitsWithServer(updated);
  };

  const handleRemoveLane = (laneId) => {
    if (!confirmTwice(t('admin_confirm_remove_lane'), t('admin_confirm_remove_lane_final'))) return;
    removeLane(laneId);
  };

  const driverNames = useMemo(() => parseDriverNames(drName), [drName]);
  const isBulkDrivers = isBulkDriverInput(drName);
  const canAddDriver = driverNames.length > 0;

  const addDriverToQueue = () => {
    if (!canAddDriver) {
      alert(t('admin_alert_name_required'));
      return;
    }
    if (isBulkDrivers) {
      setDriverQueue((q) => [
        ...q,
        ...driverNames.map((name) => ({ name, phone: null, email: null, level: null, saved: false })),
      ]);
      setDrName('');
      return;
    }
    const name = driverNames[0];
    let phone = null;
    let email = null;
    let level = null;
    const saved = showAdvanced;
    if (showAdvanced) {
      phone = drPhone.trim() || null;
      email = drEmail.trim() || null;
      level = drLevel;
      if (chkPhone && !phone) {
        alert(t('admin_alert_phone_required'));
        return;
      }
      if (chkEmail && !email) {
        alert(t('admin_alert_email_required'));
        return;
      }
    }
    setDriverQueue((q) => [...q, { name, phone, email, level, saved }]);
    setDrName('');
    if (showAdvanced) {
      setDrPhone('');
      setDrEmail('');
      setChkPhone(false);
      setChkEmail(false);
      setShowAdvanced(false);
    }
  };

  const saveLevelSettings = async () => {
    if (settingsPassword && !isStrongPassword(settingsPassword)) {
      alert(t('admin_password_weak'));
      return;
    }
    try {
      const res = await fetch('/api/admin/level-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          masterLapThreshold,
          proLapThreshold,
          editPassword: settingsPassword || undefined,
        }),
      });
      const result = await res.json();
      if (!result.success && result.error === 'weak_password') {
        alert(t('admin_password_weak'));
        return;
      }
      if (settingsPassword) setSettingsPassword('');
      alert(t('admin_level_settings_saved'));
    } catch {
      alert(t('admin_alert_server_error'));
    }
  };

  const updateDriverLevelInDB = async () => {
    const lookup = editLookup.trim();
    if (!lookup) return;
    if (!editPassword.trim()) {
      alert(t('admin_edit_password_required'));
      return;
    }
    try {
      const response = await fetch('/api/admin/update-driver-level', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lookup, level: editLevel, password: editPassword }),
      });
      const result = await response.json();
      if (result.success) {
        alert(t('admin_alert_driver_updated'));
        setEditLookup('');
        setEditPassword('');
      } else if (result.error === 'bad_password') {
        alert(t('admin_edit_password_wrong'));
      } else {
        alert(t('admin_alert_driver_not_found'));
      }
    } catch {
      alert(t('admin_alert_server_error'));
    }
  };

  const finishHeat = async () => {
    if (!exportCsv && !exportPdf) {
      alert(t('admin_export_select_one'));
      return;
    }
    try {
      await fetch('/api/admin/finish-heat', { method: 'POST' });
      const res = await fetch('/api/admin/export-data');
      const rows = await res.json();
      if (!Array.isArray(rows) || rows.length === 0) {
        alert(t('admin_export_no_data'));
        return;
      }
      if (exportCsv) downloadCsv(rows);
      if (exportPdf) printPdf(rows, t('admin_export_title'));
      alert(t('admin_finish_done'));
    } catch {
      alert(t('admin_alert_server_error'));
    }
  };

  const executeAutoAssignment = async () => {
    if (driverQueue.length === 0) {
      alert(t('admin_alert_no_drivers'));
      return;
    }
    let duration = heatDuration;
    if (heatType === 'endurance') {
      duration = (parseInt(enduranceHours, 10) || 0) * 60 + (parseInt(enduranceMinutes, 10) || 0);
    }
    await fetch('/api/admin/heat-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: heatType,
        duration,
        targetLaps: parseInt(targetLaps, 10) || 0,
      }),
    });
    await fetch('/api/admin/clear-heat', { method: 'POST' });

    const laneKeys = Object.keys(linesData).filter((id) => linesData[id].active);
    if (laneKeys.length === 0) {
      alert(t('admin_alert_no_lanes'));
      return;
    }

    const workingLines = JSON.parse(JSON.stringify(linesData));
    const assigned = [];
    let currentLineIdx = 0;

    for (let i = 0; i < driverQueue.length; i += 1) {
      let foundKart = null;
      let loops = 0;
      while (loops < laneKeys.length) {
        const currentLaneKey = laneKeys[currentLineIdx];
        if (workingLines[currentLaneKey]?.karts?.length > 0) {
          foundKart = workingLines[currentLaneKey].karts.shift();
          assigned.push({
            kart: foundKart,
            lane: currentLaneKey,
            driver: driverQueue[i],
          });
          currentLineIdx = (currentLineIdx + 1) % laneKeys.length;
          break;
        }
        currentLineIdx = (currentLineIdx + 1) % laneKeys.length;
        loops += 1;
      }
      if (!foundKart) {
        alert(t('admin_alert_not_enough_karts'));
        return;
      }
    }

    for (const assign of assigned) {
      await fetch('/assign-driver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          track_id: 1,
          kart_number: assign.kart,
          driver_name: assign.driver.name,
          phone: assign.driver.phone,
          email: assign.driver.email,
          driver_level: assign.driver.level || 'Amateur',
        }),
      });
      workingLines[assign.lane].karts.push(assign.kart);
    }

    alert(t('admin_alert_assign_done'));
    setDriverQueue([]);
    setLinesData(workingLines);
    syncPitsWithServer(workingLines);
  };

  const poolKarts = Object.keys(allKarts).filter(
    (num) => allKarts[num].lane === null,
  );

  return (
    <div className="admin-dashboard">
      <header className="admin-header">
        <HakafastLogo to="/" className="admin-header-logo" />
        <h1>{t('admin_main_title')}</h1>
        <LanguageSwitcher />
      </header>

      <div className="url-banner">
        🔗 {t('admin_public_url')}:{' '}
        <a href={liveTimingUrl} target="_blank" rel="noreferrer">
          {liveTimingUrl}
        </a>
      </div>

      <div className="admin-canvas">
        <DraggablePanel
          panelId="heat"
          title={t('admin_heat_settings')}
          position={panelPositions.heat}
          width={PANEL_SIZES.heat.width}
          onPositionChange={handlePanelPosition}
          zIndex={activePanel === 'heat' ? 200 : 100}
          onFocus={setActivePanel}
        >
          <select value={heatType} onChange={(e) => setHeatType(e.target.value)}>
            <option value="time">{t('heat_time')}</option>
            <option value="endurance">{t('heat_endurance')}</option>
            <option value="sprint">{t('heat_sprint')}</option>
          </select>
          {heatType === 'time' && (
            <div className="field-block">
              <input
                type="number"
                value={heatDuration}
                onChange={(e) => setHeatDuration(e.target.value)}
                placeholder={t('admin_duration_placeholder')}
              />
            </div>
          )}
          {heatType === 'endurance' && (
            <div className="field-block endurance-row">
              <input
                type="number"
                min="0"
                value={enduranceHours}
                onChange={(e) => setEnduranceHours(e.target.value)}
                placeholder={t('admin_hours_placeholder')}
              />
              <input
                type="number"
                min="0"
                max="59"
                value={enduranceMinutes}
                onChange={(e) => setEnduranceMinutes(e.target.value)}
                placeholder={t('admin_minutes_placeholder')}
              />
            </div>
          )}
          {heatType === 'sprint' && (
            <div className="field-block">
              <input
                type="number"
                value={targetLaps}
                onChange={(e) => setTargetLaps(e.target.value)}
                placeholder={t('admin_laps_placeholder')}
              />
            </div>
          )}
          <div className="finish-section">
            <h3>{t('admin_finish_section')}</h3>
            <div className="export-options">
              <label>
                <input type="checkbox" checked={exportCsv} onChange={(e) => setExportCsv(e.target.checked)} />
                {t('admin_export_csv')}
              </label>
              <label>
                <input type="checkbox" checked={exportPdf} onChange={(e) => setExportPdf(e.target.checked)} />
                {t('admin_export_pdf')}
              </label>
            </div>
            <button type="button" className="btn-finish-inline" onClick={finishHeat}>
              {t('admin_btn_finish_heat')}
            </button>
          </div>
        </DraggablePanel>

        <DraggablePanel
          panelId="warehouse"
          title={t('admin_warehouse')}
          position={panelPositions.warehouse}
          width={PANEL_SIZES.warehouse.width}
          onPositionChange={handlePanelPosition}
          zIndex={activePanel === 'warehouse' ? 200 : 100}
          onFocus={setActivePanel}
        >
          <div className="input-group">
            <input
              type="text"
              value={kartInput}
              onChange={(e) => setKartInput(e.target.value)}
              placeholder={t('admin_kart_input_placeholder')}
            />
            <button type="button" onClick={addKartsFromInput}>
              {t('admin_add_inventory')}
            </button>
          </div>
          <div
            className={`kart-pool${dragOverPool ? ' drag-over' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverPool(true);
            }}
            onDragLeave={() => setDragOverPool(false)}
            onDrop={handleDropToPool}
          >
            {poolKarts.map((num) => (
              <KartCard
                key={num}
                num={num}
                kart={allKarts[num]}
                onToggle={toggleKartActive}
                draggable
              />
            ))}
          </div>
        </DraggablePanel>

        <DraggablePanel
          panelId="pits"
          title={t('admin_pits_title')}
          position={panelPositions.pits}
          width={PANEL_SIZES.pits.width}
          className="panel-pits"
          onPositionChange={handlePanelPosition}
          zIndex={activePanel === 'pits' ? 200 : 100}
          onFocus={setActivePanel}
        >
          <button type="button" className="btn-purple btn-full" onClick={addNewLane}>
            {t('admin_add_lane')}
          </button>
          <div className="pit-lanes-board">
            {Object.keys(linesData).map((laneId) => {
              const lane = linesData[laneId];
              return (
                <div
                  key={laneId}
                  className={`lane${!lane.active ? ' disabled-lane' : ''}${dragOverLane === laneId ? ' drag-over' : ''}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOverLane(laneId);
                  }}
                  onDragLeave={() => setDragOverLane(null)}
                  onDrop={(e) => handleDropToLane(e, laneId)}
                >
                  <input
                    type="text"
                    className="lane-header-input"
                    value={lane.name}
                    onChange={(e) => changeLaneName(laneId, e.target.value)}
                  />
                  <div className="lane-controls">
                    <button type="button" className="btn-muted" onClick={() => handleToggleLane(laneId)}>
                      {lane.active ? t('admin_lane_disable') : t('admin_lane_enable')}
                    </button>
                    <button type="button" className="btn-danger" onClick={() => handleRemoveLane(laneId)}>
                      {t('admin_lane_remove')}
                    </button>
                  </div>
                  {lane.karts.map((num) =>
                    allKarts[num] ? (
                      <KartCard
                        key={`${laneId}-${num}`}
                        num={num}
                        kart={allKarts[num]}
                        onToggle={toggleKartActive}
                        draggable
                      />
                    ) : null,
                  )}
                </div>
              );
            })}
          </div>
        </DraggablePanel>

        <DraggablePanel
          panelId="drivers"
          title={t('admin_register_title')}
          position={panelPositions.drivers}
          width={PANEL_SIZES.drivers.width}
          className="panel-drivers"
          onPositionChange={handlePanelPosition}
          zIndex={activePanel === 'drivers' ? 200 : 100}
          onFocus={setActivePanel}
        >
          <div className="section-box">
            <label>{t('admin_req_label')}</label>
            <input
              type="text"
              value={drName}
              onChange={(e) => setDrName(e.target.value)}
              placeholder={t('admin_driver_placeholder_bulk')}
            />
            {isBulkDrivers && (
              <p className="bulk-hint">{t('admin_bulk_names_hint')} ({driverNames.length})</p>
            )}
          </div>
          <button
            type="button"
            className={`btn-register-saved${showAdvanced ? ' is-open' : ''}`}
            onClick={() => setShowAdvanced((v) => !v)}
            disabled={isBulkDrivers}
          >
            {showAdvanced ? t('admin_toggle_reg_open') : t('admin_toggle_reg_closed')}
          </button>
          {showAdvanced && !isBulkDrivers && (
            <div className="advanced-zone">
              <div className="checkbox-zone">
                <label>
                  <input type="checkbox" checked={chkPhone} onChange={(e) => setChkPhone(e.target.checked)} />
                  {t('admin_chk_phone')}
                </label>
                <label>
                  <input type="checkbox" checked={chkEmail} onChange={(e) => setChkEmail(e.target.checked)} />
                  {t('admin_chk_email')}
                </label>
              </div>
              {chkPhone && (
                <input
                  type="text"
                  value={drPhone}
                  onChange={(e) => setDrPhone(e.target.value)}
                  placeholder={t('admin_phone_placeholder')}
                />
              )}
              {chkEmail && (
                <input
                  type="text"
                  value={drEmail}
                  onChange={(e) => setDrEmail(e.target.value)}
                  placeholder={t('admin_email_placeholder')}
                />
              )}
              <select value={drLevel} onChange={(e) => setDrLevel(e.target.value)}>
                <option value="Amateur">{t('level_amateur')}</option>
                <option value="Master">{t('level_master')}</option>
                <option value="Pro">{t('level_pro')}</option>
              </select>
            </div>
          )}
          <button
            type="button"
            className="btn-full btn-add-queue"
            onClick={addDriverToQueue}
            disabled={!canAddDriver}
          >
            {t('admin_btn_add_queue')}
          </button>
          <h3>{t('admin_queue_title')}</h3>
          <ul className="queue-list queue-list-tall">
            {driverQueue.map((d, i) => (
              <li key={`${d.name}-${i}`} className={`queue-item${d.saved ? ' queue-item-saved' : ''}`}>
                <span>
                  {d.saved && <span className="saved-badge">★</span>}
                  {d.name}
                  {d.level ? ` (${levelLabel(d.level)})` : ''}
                </span>
                <button
                  type="button"
                  className="btn-remove"
                  onClick={() => setDriverQueue((q) => q.filter((_, idx) => idx !== i))}
                >
                  X
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="btn-execute" onClick={executeAutoAssignment}>
            {t('admin_btn_execute')} 🚀
          </button>
        </DraggablePanel>

        <DraggablePanel
          panelId="editLevel"
          title={t('admin_edit_db_title')}
          position={panelPositions.editLevel}
          width={PANEL_SIZES.editLevel.width}
          onPositionChange={handlePanelPosition}
          zIndex={activePanel === 'editLevel' ? 200 : 100}
          onFocus={setActivePanel}
        >
          <p className="level-hint">{t('admin_lap_auto_upgrade_hint')}</p>
          <label className="field-label">{t('admin_lap_master_threshold')}</label>
          <input
            type="text"
            value={masterLapThreshold}
            onChange={(e) => setMasterLapThreshold(e.target.value)}
            placeholder="45.500"
          />
          <label className="field-label">{t('admin_lap_pro_threshold')}</label>
          <input
            type="text"
            value={proLapThreshold}
            onChange={(e) => setProLapThreshold(e.target.value)}
            placeholder="42.000"
          />
          <label className="field-label">{t('admin_edit_password_set_label')}</label>
          <input
            type="password"
            value={settingsPassword}
            onChange={(e) => setSettingsPassword(e.target.value)}
            placeholder={t('admin_edit_password_set_placeholder')}
          />
          <p className="password-hint">{t('admin_password_rules')}</p>
          <button type="button" className="btn-muted btn-full" onClick={saveLevelSettings}>
            {t('admin_save_level_settings')}
          </button>
          <hr className="panel-divider" />
          <input
            type="text"
            value={editLookup}
            onChange={(e) => setEditLookup(e.target.value)}
            placeholder={t('admin_edit_lookup_placeholder')}
          />
          <select value={editLevel} onChange={(e) => setEditLevel(e.target.value)}>
            <option value="Amateur">{t('level_amateur')}</option>
            <option value="Master">{t('level_master')}</option>
            <option value="Pro">{t('level_pro')}</option>
          </select>
          <input
            type="password"
            value={editPassword}
            onChange={(e) => setEditPassword(e.target.value)}
            placeholder={t('admin_edit_password_placeholder')}
          />
          <button type="button" className="btn-muted btn-full" onClick={updateDriverLevelInDB}>
            {t('admin_btn_update_db')}
          </button>
        </DraggablePanel>
      </div>
    </div>
  );
};

export default AdminPanel;
