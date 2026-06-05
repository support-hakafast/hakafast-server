import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import '../assets/AdminPanel.css';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import LanguageSwitcher from './LanguageSwitcher.jsx';
import HakafastLogo from './HakafastLogo.jsx';
import AdminSetupModal from './AdminSetupModal.jsx';
import AdvancedSettingsModal from './AdvancedSettingsModal.jsx';
import LivePreviewFloat from './LivePreviewFloat.jsx';
import KartCard from './KartCard.jsx';
import { isStrongPassword } from '../utils/password.js';
import {
  parseKartNumbers,
  parseDriverNames,
  isBulkDriverInput,
  downloadCsv,
  printPdf,
  reconcileKartsFromLines,
  formatHeatClock,
  buildExportFilename,
} from '../utils/adminHelpers.js';
import { apiFetch } from '../utils/apiClient.js';
import {
  usesIsolatedWorkspace,
  getWorkspaceId,
  getWorkspaceLabel,
  resetWorkspaceId,
} from '../utils/workspace.js';
import { saveLocalSnapshot, loadLocalSnapshot, clearLocalSnapshot } from '../utils/workspaceStorage.js';

const DEFAULT_LINES = {
  1: { name: 'טור 1', active: true, karts: [] },
  2: { name: 'טור 2', active: true, karts: [] },
};

const HEAT_DURATIONS = [10, 15, 20, 30];

function normalizeLinesData(data) {
  if (!data) return { ...DEFAULT_LINES };
  if (Array.isArray(data)) {
    const obj = {};
    data.forEach((lane) => {
      obj[lane.id] = { name: lane.name, active: lane.active, karts: lane.karts || [] };
    });
    return Object.keys(obj).length ? obj : { ...DEFAULT_LINES };
  }
  return data;
}

const AdminPanel = () => {
  const { trackName } = useParams();
  const { t } = useLanguage();
  const trackSlug = trackName || 'kart-demo';

  const [showSetup, setShowSetup] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [hasPassword, setHasPassword] = useState(false);

  const [allKarts, setAllKarts] = useState({});
  const [linesData, setLinesData] = useState({ ...DEFAULT_LINES });
  const [driverQueue, setDriverQueue] = useState([]);
  const [kartInput, setKartInput] = useState('');

  const [heatType, setHeatType] = useState('time');
  const [heatDuration, setHeatDuration] = useState(10);
  const [enduranceHours, setEnduranceHours] = useState(1);
  const [enduranceMinutes, setEnduranceMinutes] = useState(0);
  const [targetLaps, setTargetLaps] = useState('');
  const [exportCsv, setExportCsv] = useState(true);
  const [exportPdf, setExportPdf] = useState(false);

  const [drName, setDrName] = useState('');
  const [showAdvancedReg, setShowAdvancedReg] = useState(false);
  const [chkPhone, setChkPhone] = useState(false);
  const [chkEmail, setChkEmail] = useState(false);
  const [drPhone, setDrPhone] = useState('');
  const [drEmail, setDrEmail] = useState('');
  const [drLevel, setDrLevel] = useState('Amateur');

  const [masterLapThreshold, setMasterLapThreshold] = useState('45.500');
  const [proLapThreshold, setProLapThreshold] = useState('42.000');

  const [dragOverLane, setDragOverLane] = useState(null);
  const [dragOverPool, setDragOverPool] = useState(false);
  const [heatClock, setHeatClock] = useState({ running: false, remainingSec: 600, durationMin: 10, hasDrivers: false });
  const [onTrack, setOnTrack] = useState([]);
  const [heatDriverCount, setHeatDriverCount] = useState(0);
  const [autoFinishHandled, setAutoFinishHandled] = useState(false);
  const [assignedHeatKarts, setAssignedHeatKarts] = useState(new Set());
  const autoFinishHandledRef = useRef(false);

  const confirmTwice = (msg1, msg2) => window.confirm(msg1) && window.confirm(msg2);

  const syncPitsWithServer = useCallback(async (lines) => {
    await apiFetch('/api/admin/update-pits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newLines: lines }),
    }, trackSlug);
  }, [trackSlug]);

  const syncQueue = useCallback((queue) => {
    apiFetch(`/api/admin/sync-queue/${trackSlug}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ queue }),
    }, trackSlug).catch(() => {});
  }, [trackSlug]);

  useEffect(() => {
    apiFetch(`/api/admin/track-setup/${trackSlug}`, {}, trackSlug)
      .then((r) => r.json())
      .then((s) => {
        if (!s.onboarded) {
          setShowSetup(true);
          return;
        }
        if (s.kartNumbers) {
          const nums = parseKartNumbers(s.kartNumbers);
          if (nums.length > 0) {
            setAllKarts((prev) => {
              const next = { ...prev };
              nums.forEach((n) => {
                if (!next[n]) next[n] = { number: n, active: true, lane: null };
              });
              return next;
            });
          }
        }
      })
      .catch(() => {});

    apiFetch('/api/admin/pits', {}, trackSlug).then((r) => r.json()).then((d) => {
      const lines = normalizeLinesData(d);
      setLinesData(lines);
      setAllKarts((prev) => reconcileKartsFromLines(prev, lines, onTrack.map((k) => k.kart_number)));
    }).catch(() => {});
    apiFetch('/api/heat-settings', {}, trackSlug).then((r) => r.json()).then((s) => {
      if (s?.type) setHeatType(s.type);
      if (s?.duration) setHeatDuration(s.duration);
      if (s?.targetLaps) setTargetLaps(String(s.targetLaps));
      if (typeof s?.exportCsv === 'boolean') setExportCsv(s.exportCsv);
      if (typeof s?.exportPdf === 'boolean') setExportPdf(s.exportPdf);
      if (s?.heatClock) setHeatClock(s.heatClock);
      if (s?.onTrack) {
        setOnTrack(s.onTrack);
        setAllKarts((prev) => reconcileKartsFromLines(prev, linesData, s.onTrack.map((k) => k.kart_number)));
      }
    }).catch(() => {});
    apiFetch('/api/admin/level-settings', {}, trackSlug).then((r) => r.json()).then((s) => {
      if (s?.masterLapThreshold) setMasterLapThreshold(s.masterLapThreshold);
      if (s?.proLapThreshold) setProLapThreshold(s.proLapThreshold);
      setHasPassword(Boolean(s?.hasPassword));
    }).catch(() => {});

    if (usesIsolatedWorkspace(trackSlug)) {
      const wsId = getWorkspaceId(trackSlug);
      loadLocalSnapshot(trackSlug, wsId).then((local) => {
        if (local?.allKarts) setAllKarts(local.allKarts);
      });
      apiFetch('/api/workspace/backup', {}, trackSlug)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.success && data?.snapshot?.clientSnapshot?.allKarts) {
            setAllKarts((prev) => ({ ...data.snapshot.clientSnapshot.allKarts, ...prev }));
          }
        })
        .catch(() => {});
    }
  }, [trackSlug]);

  useEffect(() => { syncQueue(driverQueue); }, [driverQueue, syncQueue]);

  useEffect(() => {
    const timer = setTimeout(() => {
      let duration = heatDuration;
      if (heatType === 'endurance') {
        duration = (parseInt(enduranceHours, 10) || 0) * 60 + (parseInt(enduranceMinutes, 10) || 0);
      }
      apiFetch('/api/admin/heat-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: heatType,
          duration,
          targetLaps: parseInt(targetLaps, 10) || 0,
          exportCsv,
          exportPdf,
        }),
      }, trackSlug).catch(() => {});
    }, 600);
    return () => clearTimeout(timer);
  }, [heatType, heatDuration, enduranceHours, enduranceMinutes, targetLaps, exportCsv, exportPdf, trackSlug]);

  useEffect(() => {
    if (!usesIsolatedWorkspace(trackSlug)) return undefined;
    const wsId = getWorkspaceId(trackSlug);
    const timer = setTimeout(() => {
      saveLocalSnapshot(trackSlug, wsId, { allKarts });
      apiFetch('/api/workspace/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientSnapshot: { allKarts } }),
      }, trackSlug).catch(() => {});
    }, 1200);
    return () => clearTimeout(timer);
  }, [allKarts, trackSlug]);

  const levelLabel = (level) => t(`level_${(level || 'Amateur').toLowerCase()}`);
  const driverNames = useMemo(() => parseDriverNames(drName), [drName]);
  const isBulkDrivers = isBulkDriverInput(drName);
  const canAddDriver = driverNames.length > 0;

  const addKartEntity = (num) => {
    setAllKarts((prev) => {
      const existing = prev[num];
      if (existing?.onTrack) return prev;
      if (existing?.lane != null) return prev;
      if (existing) return { ...prev, [num]: { ...existing, active: true, lane: null, onTrack: false } };
      return { ...prev, [num]: { number: num, active: true, lane: null, onTrack: false } };
    });
  };

  const addKartsFromInput = () => {
    const val = kartInput.trim();
    if (!val) return;
    const nums = parseKartNumbers(val);
    if (!nums.length) {
      alert(t('admin_karts_invalid_input'));
      return;
    }

    let added = 0;
    let reactivated = 0;
    let inPits = 0;
    let onTrackCount = 0;
    let alreadyInPool = 0;
    const next = { ...allKarts };

    nums.forEach((num) => {
      const key = String(num);
      const k = next[key];
      if (k?.onTrack) { onTrackCount += 1; return; }
      if (k?.lane != null) { inPits += 1; return; }
      if (k?.active && k.lane == null) { alreadyInPool += 1; return; }
      if (k && !k.active) {
        next[key] = { ...k, number: num, active: true, lane: null, onTrack: false };
        reactivated += 1;
      } else {
        next[key] = { number: num, active: true, lane: null, onTrack: false };
        added += 1;
      }
    });

    setAllKarts(next);

    const msgs = [];
    if (added > 0) msgs.push(t('admin_karts_added', { count: added }));
    if (reactivated > 0) msgs.push(t('admin_karts_reactivated', { count: reactivated }));
    if (inPits > 0) msgs.push(t('admin_karts_in_pits', { count: inPits }));
    if (onTrackCount > 0) msgs.push(t('admin_karts_on_track', { count: onTrackCount }));
    if (alreadyInPool > 0) msgs.push(t('admin_karts_already_pool', { count: alreadyInPool }));
    if (msgs.length) alert(msgs.join('\n'));
    else alert(t('admin_karts_none_added'));
    setKartInput('');
  };

  const toggleKartActive = (num, event) => {
    event.stopPropagation();
    const kart = allKarts[num];
    if (!kart) return;
    const nextActive = !kart.active;
    if (!nextActive && kart.lane != null && linesData[kart.lane]) {
      const updatedLines = {
        ...linesData,
        [kart.lane]: { ...linesData[kart.lane], karts: linesData[kart.lane].karts.filter((x) => Number(x) !== Number(num)) },
      };
      setLinesData(updatedLines);
      syncPitsWithServer(updatedLines);
    }
    setAllKarts((prev) => ({ ...prev, [num]: { ...kart, active: nextActive, lane: nextActive ? kart.lane : null } }));
  };

  const dropKart = (num, laneNum) => {
    const kart = allKarts[num];
    if (!kart) return;
    const updatedLines = { ...linesData };
    if (kart.lane != null && updatedLines[kart.lane]) {
      updatedLines[kart.lane] = { ...updatedLines[kart.lane], karts: updatedLines[kart.lane].karts.filter((x) => Number(x) !== Number(num)) };
    }
    if (laneNum != null && updatedLines[laneNum]) {
      const karts = updatedLines[laneNum].karts;
      if (!karts.map(Number).includes(Number(num))) {
        updatedLines[laneNum] = { ...updatedLines[laneNum], karts: [...karts, Number(num)] };
      }
    }
    setAllKarts((prev) => ({ ...prev, [num]: { ...kart, lane: laneNum } }));
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
      const updated = { ...lines, [newId]: { name: `${t('admin_lane_default')} ${newId}`, active: true, karts: [] } };
      syncPitsWithServer(updated);
      return updated;
    });
  };

  const toggleLaneEnabled = (laneId) => {
    setLinesData((lines) => {
      const updated = { ...lines, [laneId]: { ...lines[laneId], active: !lines[laneId].active } };
      syncPitsWithServer(updated);
      return updated;
    });
  };

  const handleToggleLane = (laneId) => {
    const lane = linesData[laneId];
    if (lane?.active && !confirmTwice(t('admin_confirm_disable_lane'), t('admin_confirm_disable_lane_final'))) return;
    toggleLaneEnabled(laneId);
  };

  const changeLaneName = (laneId, newName) => {
    setLinesData((lines) => {
      const updated = { ...lines, [laneId]: { ...lines[laneId], name: newName.trim() || `${t('admin_lane_default')} ${laneId}` } };
      syncPitsWithServer(updated);
      return updated;
    });
  };

  const removeLane = (laneId) => {
    if (!linesData[laneId]) return;
    const kartsToScatter = [...linesData[laneId].karts];
    const otherLanes = Object.keys(linesData).filter((id) => id !== String(laneId) && linesData[id].active);
    const updated = { ...linesData };
    const kartUpdates = {};
    kartsToScatter.forEach((num) => {
      if (otherLanes.length > 0) {
        const randomLane = otherLanes[Math.floor(Math.random() * otherLanes.length)];
        updated[randomLane] = { ...updated[randomLane], karts: [...updated[randomLane].karts, num] };
        kartUpdates[num] = Number(randomLane);
      } else kartUpdates[num] = null;
    });
    delete updated[laneId];
    setAllKarts((prev) => {
      const next = { ...prev };
      Object.entries(kartUpdates).forEach(([num, lane]) => { if (next[num]) next[num] = { ...next[num], lane }; });
      return next;
    });
    setLinesData(updated);
    syncPitsWithServer(updated);
  };

  const handleRemoveLane = (laneId) => {
    if (!confirmTwice(t('admin_confirm_remove_lane'), t('admin_confirm_remove_lane_final'))) return;
    removeLane(laneId);
  };

  const addDriverToQueue = () => {
    if (!canAddDriver) { alert(t('admin_alert_name_required')); return; }
    if (isBulkDrivers) {
      setDriverQueue((q) => [...q, ...driverNames.map((name) => ({ name, phone: null, email: null, level: null, saved: false }))]);
      setDrName('');
      return;
    }
    const name = driverNames[0];
    if (showAdvancedReg) {
      if (chkPhone && !drPhone.trim()) { alert(t('admin_alert_phone_required')); return; }
      if (chkEmail && !drEmail.trim()) { alert(t('admin_alert_email_required')); return; }
    }
    setDriverQueue((q) => [...q, {
      name,
      phone: showAdvancedReg ? drPhone.trim() || null : null,
      email: showAdvancedReg ? drEmail.trim() || null : null,
      level: showAdvancedReg ? drLevel : null,
      saved: showAdvancedReg,
    }]);
    setDrName('');
    if (showAdvancedReg) {
      setDrPhone(''); setDrEmail(''); setChkPhone(false); setChkEmail(false); setShowAdvancedReg(false);
    }
  };

  const saveLevelSettings = async (settingsPassword) => {
    if (settingsPassword && !isStrongPassword(settingsPassword)) {
      alert(t('admin_password_weak'));
      return;
    }
    try {
      const res = await apiFetch('/api/admin/level-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ masterLapThreshold, proLapThreshold, editPassword: settingsPassword || undefined }),
      }, trackSlug);
      const result = await res.json();
      if (!result.success && result.error === 'weak_password') { alert(t('admin_password_weak')); return; }
      if (settingsPassword) setHasPassword(true);
      alert(t('admin_level_settings_saved'));
    } catch { alert(t('admin_alert_server_error')); }
  };

  const updateDriverLevelInDB = async (lookup, level, password) => {
    if (!lookup?.trim()) return;
    if (hasPassword && !password?.trim()) { alert(t('admin_edit_password_required')); return; }
    try {
      const response = await apiFetch('/api/admin/update-driver-level', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lookup: lookup.trim(), level, password: password || '' }),
      }, trackSlug);
      const result = await response.json();
      if (result.success) alert(t('admin_alert_driver_updated'));
      else if (result.error === 'bad_password') alert(t('admin_edit_password_wrong'));
      else alert(t('admin_alert_driver_not_found'));
    } catch { alert(t('admin_alert_server_error')); }
  };

  const runFinishHeat = useCallback(async (isAuto = false, startedAtOverride = null) => {
    if (!exportCsv && !exportPdf) {
      if (!isAuto) alert(t('admin_export_select_one'));
      return;
    }
    try {
      await apiFetch('/api/admin/finish-heat', { method: 'POST' }, trackSlug);
      const res = await apiFetch('/api/admin/export-data', {}, trackSlug);
      const rows = await res.json();
      if (!Array.isArray(rows) || rows.length === 0) {
        if (!isAuto) alert(t('admin_export_no_data'));
        return;
      }
      const startedAt = startedAtOverride ?? heatClock.startedAt;
      const baseName = buildExportFilename(heatType, startedAt, 'csv').replace('.csv', '');
      if (exportCsv) downloadCsv(rows, `${baseName}.csv`);
      if (exportPdf) printPdf(rows, `${baseName} — ${t('admin_export_title')}`);
      if (!isAuto) alert(t('admin_finish_done'));
      else alert(t('admin_finish_auto_done'));
      setHeatDriverCount(0);
      setAssignedHeatKarts(new Set());
      setOnTrack([]);
      setHeatClock((c) => ({ ...c, running: false, startedAt: null }));
      autoFinishHandledRef.current = true;
      setAutoFinishHandled(true);
    } catch {
      if (!isAuto) alert(t('admin_alert_server_error'));
    }
  }, [exportCsv, exportPdf, heatType, heatClock.startedAt, trackSlug, t]);

  const finishHeat = () => runFinishHeat(false);

  useEffect(() => {
    const refreshSession = () => {
      apiFetch('/api/admin/session-state', {}, trackSlug)
        .then((r) => r.json())
        .then((s) => {
          if (s.heatClock) setHeatClock(s.heatClock);
          if (typeof s.heatDriverCount === 'number') setHeatDriverCount(s.heatDriverCount);
          if (s.heatKartNumbers) setAssignedHeatKarts(new Set(s.heatKartNumbers));
          if (s.onTrack) setOnTrack(s.onTrack);
          if (s.pitLines) {
            const lines = normalizeLinesData(s.pitLines);
            setLinesData(lines);
            setAllKarts((prev) => reconcileKartsFromLines(prev, lines, (s.onTrack || []).map((k) => k.kart_number)));
          }
          if (s.autoFinishRequested && !autoFinishHandledRef.current) {
            runFinishHeat(true, s.heatClock?.startedAt);
          }
        })
        .catch(() => {});
    };
    refreshSession();
    const timer = setInterval(refreshSession, 1000);
    return () => clearInterval(timer);
  }, [trackSlug, runFinishHeat]);

  const executeAutoAssignment = async () => {
    if (driverQueue.length === 0) { alert(t('admin_alert_no_drivers')); return; }
    let duration = heatDuration;
    if (heatType === 'endurance') duration = (parseInt(enduranceHours, 10) || 0) * 60 + (parseInt(enduranceMinutes, 10) || 0);
    await apiFetch('/api/admin/heat-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: heatType,
        duration,
        targetLaps: parseInt(targetLaps, 10) || 0,
        exportCsv,
        exportPdf,
      }),
    }, trackSlug);
    await apiFetch('/api/admin/clear-heat', { method: 'POST' }, trackSlug);
    autoFinishHandledRef.current = false;
    setAutoFinishHandled(false);
    const laneKeys = Object.keys(linesData).filter((id) => linesData[id].active);
    if (laneKeys.length === 0) { alert(t('admin_alert_no_lanes')); return; }
    const workingLines = JSON.parse(JSON.stringify(linesData));
    const assigned = [];
    let currentLineIdx = 0;
    for (let i = 0; i < driverQueue.length; i += 1) {
      let foundKart = null;
      let loops = 0;
      while (loops < laneKeys.length) {
        const key = laneKeys[currentLineIdx];
        if (workingLines[key]?.karts?.length > 0) {
          foundKart = workingLines[key].karts[0];
          assigned.push({ kart: foundKart, lane: key, driver: driverQueue[i] });
          currentLineIdx = (currentLineIdx + 1) % laneKeys.length;
          break;
        }
        currentLineIdx = (currentLineIdx + 1) % laneKeys.length;
        loops += 1;
      }
      if (!foundKart) { alert(t('admin_alert_not_enough_karts')); return; }
    }
    for (const assign of assigned) {
      await apiFetch('/assign-driver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          track_id: 1,
          kart_number: assign.kart,
          driver_name: assign.driver.name,
          phone: assign.driver.phone,
          email: assign.driver.email,
          registered: Boolean(assign.driver.saved),
          driver_level: assign.driver.saved ? (assign.driver.level || 'Amateur') : undefined,
        }),
      }, trackSlug);
    }
    const heatKarts = new Set(assigned.map((a) => Number(a.kart)));
    setAssignedHeatKarts(heatKarts);
    setHeatDriverCount(assigned.length);
    alert(t('admin_alert_assign_done'));
    setDriverQueue([]);
    setLinesData(workingLines);
    syncPitsWithServer(workingLines);
  };

  const handleSetupComplete = ({ kartNumbers, hasPassword: pwSet }) => {
    setShowSetup(false);
    if (pwSet) setHasPassword(true);
    parseKartNumbers(kartNumbers).forEach((n) => addKartEntity(n));
  };

  const applySessionPayload = (data) => {
    if (data.pitLines) {
      const lines = normalizeLinesData(data.pitLines);
      setLinesData(lines);
      setAllKarts((prev) => reconcileKartsFromLines(prev, lines, (data.onTrack || []).map((k) => k.kart_number)));
    }
    if (data.onTrack) setOnTrack(data.onTrack);
    if (data.heatClock) setHeatClock(data.heatClock);
  };

  const returnKartFromTrack = async (kartNum, laneId) => {
    try {
      const res = await apiFetch('/api/admin/kart-return', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kart_number: kartNum, laneId }),
      }, trackSlug);
      const data = await res.json();
      if (!data.success) {
        if (data.error === 'not_on_track') alert(t('admin_return_error_track'));
        else alert(t('admin_alert_server_error'));
        return;
      }
      applySessionPayload(data);
    } catch {
      alert(t('admin_alert_server_error'));
    }
  };

  const resetWorkspace = async () => {
    if (!usesIsolatedWorkspace(trackSlug)) return;
    if (!confirmTwice(t('admin_reset_confirm'), t('admin_reset_confirm_final'))) return;
    const oldId = getWorkspaceId(trackSlug);
    try {
      await apiFetch('/api/workspace/reset', { method: 'POST' }, trackSlug);
      await clearLocalSnapshot(trackSlug, oldId);
      resetWorkspaceId(trackSlug);
      window.location.reload();
    } catch {
      alert(t('admin_alert_server_error'));
    }
  };

  const poolKarts = Object.keys(allKarts).filter((num) => {
    const k = allKarts[num];
    return k && k.lane == null && !k.onTrack;
  });
  const isolated = usesIsolatedWorkspace(trackSlug);

  return (
    <div className="admin-dashboard admin-no-scroll">
      {showSetup && <AdminSetupModal trackSlug={trackSlug} onComplete={handleSetupComplete} />}
      {showAdvanced && (
        <AdvancedSettingsModal
          trackSlug={trackSlug}
          hasPassword={hasPassword}
          onClose={() => setShowAdvanced(false)}
          masterLapThreshold={masterLapThreshold}
          setMasterLapThreshold={setMasterLapThreshold}
          proLapThreshold={proLapThreshold}
          setProLapThreshold={setProLapThreshold}
          onSaveSettings={saveLevelSettings}
          onUpdateDriverLevel={updateDriverLevelInDB}
          showResetWorkspace={usesIsolatedWorkspace(trackSlug)}
          onResetWorkspace={resetWorkspace}
        />
      )}
      {showPreview && <LivePreviewFloat onClose={() => setShowPreview(false)} heatType={heatType} trackSlug={trackSlug} />}

      <header className="admin-header">
        <HakafastLogo to="/" className="admin-header-logo" />
        <h1>{t('admin_main_title')}</h1>
        {isolated && (
          <span className="demo-workspace-badge" title={getWorkspaceLabel(trackSlug)}>
            {t('demo_workspace_badge', { id: getWorkspaceLabel(trackSlug) })}
          </span>
        )}
        <LanguageSwitcher />
      </header>

      <div className="admin-workspace">
        <section className="admin-pits-column">
          <div className="inventory-pits-panel">
            <div className="warehouse-zone">
              <h2>{t('admin_warehouse')}</h2>
              <div className="input-group">
                <input type="text" value={kartInput} onChange={(e) => setKartInput(e.target.value)} placeholder={t('admin_kart_input_placeholder')} />
                <button type="button" onClick={addKartsFromInput}>{t('admin_add_inventory')}</button>
              </div>
              <div
                className={`kart-pool${dragOverPool ? ' drag-over' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setDragOverPool(true); }}
                onDragLeave={() => setDragOverPool(false)}
                onDrop={handleDropToPool}
              >
                {poolKarts.map((num) => (
                  <KartCard key={num} num={num} kart={allKarts[num]} onToggle={toggleKartActive} draggable variant="pool" />
                ))}
              </div>
            </div>
            <div className="pits-zone">
              <div className="panel-head-row">
                <h2>{t('admin_pits_title')}</h2>
                <button type="button" className="btn-purple" onClick={addNewLane}>{t('admin_add_lane')}</button>
              </div>
              <div className="pit-lanes-board">
                {Object.keys(linesData).map((laneId) => {
                  const lane = linesData[laneId];
                  const exitKart = lane.karts[0];
                  const waitingKarts = lane.karts.slice(1);
                  return (
                    <div
                      key={laneId}
                      className={`lane${!lane.active ? ' disabled-lane' : ''}${dragOverLane === laneId ? ' drag-over' : ''}`}
                      onDragOver={(e) => { e.preventDefault(); setDragOverLane(laneId); }}
                      onDragLeave={() => setDragOverLane(null)}
                      onDrop={(e) => handleDropToLane(e, laneId)}
                    >
                      <input type="text" className="lane-header-input" value={lane.name} onChange={(e) => changeLaneName(laneId, e.target.value)} />
                      <div className="lane-controls">
                        <button type="button" className="btn-muted" onClick={() => handleToggleLane(laneId)}>
                          {lane.active ? t('admin_lane_disable') : t('admin_lane_enable')}
                        </button>
                        <button type="button" className="btn-danger" onClick={() => handleRemoveLane(laneId)}>{t('admin_lane_remove')}</button>
                      </div>
                      <div className="lane-waiting-zone">
                        <span className="lane-zone-label">{t('admin_lane_waiting')}</span>
                        {waitingKarts.length === 0 ? (
                          <p className="lane-empty-hint">{t('admin_lane_waiting_empty')}</p>
                        ) : (
                          [...waitingKarts].reverse().map((num) => allKarts[num] ? (
                            <KartCard
                              key={`${laneId}-w-${num}`}
                              num={num}
                              kart={allKarts[num]}
                              onToggle={toggleKartActive}
                              draggable
                              variant="waiting"
                            />
                          ) : null)
                        )}
                      </div>
                      <div className="lane-exit-zone lane-transponder-zone">
                        <span className="lane-zone-label">{t('admin_transponder_zone')}</span>
                        <div className="transponder-beacon-row">
                          <span className="transponder-beacon" aria-hidden />
                          <span className="transponder-hint">{t('admin_transponder_hint')}</span>
                        </div>
                        <div className="lane-exit-track" />
                        {exitKart && allKarts[exitKart] ? (
                          <KartCard
                            key={`${laneId}-exit-${exitKart}`}
                            num={exitKart}
                            kart={allKarts[exitKart]}
                            onToggle={toggleKartActive}
                            draggable={false}
                            variant="exiting"
                            transponderActive={assignedHeatKarts.has(Number(exitKart))}
                          />
                        ) : (
                          <p className="lane-empty-hint">{t('admin_lane_exit_empty')}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="on-track-strip">
                <div className="on-track-strip-header">
                  <span className="on-track-strip-title">{t('admin_on_track')}</span>
                  <span className="on-track-strip-badge">{onTrack.length}</span>
                </div>
                <div className="on-track-strip-track">
                  <div className="on-track-strip-line" aria-hidden />
                  {onTrack.length === 0 ? (
                    <p className="on-track-strip-empty">{t('admin_on_track_empty')}</p>
                  ) : (
                    onTrack.map((ot) => (
                      <div key={ot.kart_number} className="on-track-kart-card">
                        <KartCard
                          num={ot.kart_number}
                          kart={allKarts[ot.kart_number] || { number: ot.kart_number, active: true }}
                          onToggle={() => {}}
                          draggable={false}
                          variant="ontrack"
                        />
                        <div className="on-track-kart-meta">
                          <strong>{ot.driver_name}</strong>
                          <button
                            type="button"
                            className="btn-on-track-return"
                            onClick={() => returnKartFromTrack(ot.kart_number, ot.laneId)}
                          >
                            {t('admin_kart_return')}
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="finish-section finish-section-center">
            <h3>{t('admin_finish_section')}</h3>
            <div className="export-options">
              <label><input type="checkbox" checked={exportCsv} onChange={(e) => setExportCsv(e.target.checked)} />{t('admin_export_csv')}</label>
              <label><input type="checkbox" checked={exportPdf} onChange={(e) => setExportPdf(e.target.checked)} />{t('admin_export_pdf')}</label>
            </div>
            <button type="button" className="btn-finish-turquoise" onClick={finishHeat}>{t('admin_btn_finish_heat')}</button>
          </div>
        </section>

        <section className="admin-drivers-column">
          <div className="driver-column driver-column-main">
            <h2>{t('admin_register_title')}</h2>
            <div className="section-box">
              <label>{t('admin_req_label')}</label>
              <input type="text" value={drName} onChange={(e) => setDrName(e.target.value)} placeholder={t('admin_driver_placeholder_bulk')} />
              {isBulkDrivers && <p className="bulk-hint">{t('admin_bulk_names_hint')} ({driverNames.length})</p>}
            </div>
            <button type="button" className={`btn-register-saved${showAdvancedReg ? ' is-open' : ''}`} onClick={() => setShowAdvancedReg((v) => !v)} disabled={isBulkDrivers}>
              {showAdvancedReg ? t('admin_toggle_reg_open') : t('admin_toggle_reg_closed')}
            </button>
            {showAdvancedReg && !isBulkDrivers && (
              <div className="advanced-zone">
                <div className="checkbox-zone">
                  <label><input type="checkbox" checked={chkPhone} onChange={(e) => setChkPhone(e.target.checked)} />{t('admin_chk_phone')}</label>
                  <label><input type="checkbox" checked={chkEmail} onChange={(e) => setChkEmail(e.target.checked)} />{t('admin_chk_email')}</label>
                </div>
                {chkPhone && <input type="text" value={drPhone} onChange={(e) => setDrPhone(e.target.value)} placeholder={t('admin_phone_placeholder')} />}
                {chkEmail && <input type="text" value={drEmail} onChange={(e) => setDrEmail(e.target.value)} placeholder={t('admin_email_placeholder')} />}
                <select value={drLevel} onChange={(e) => setDrLevel(e.target.value)}>
                  <option value="Amateur">{t('level_amateur')}</option>
                  <option value="Master">{t('level_master')}</option>
                  <option value="Pro">{t('level_pro')}</option>
                </select>
              </div>
            )}
            <button type="button" className="btn-full btn-add-queue" onClick={addDriverToQueue} disabled={!canAddDriver}>{t('admin_btn_add_queue')}</button>
            <p className="level-hint">{t('admin_level_from_laps_hint')}</p>
            <h3 className="queue-heading">{t('admin_queue_title')}</h3>
            <ul className="queue-list queue-list-tall">
              {driverQueue.length === 0 ? (
                <li className="queue-empty">{t('admin_queue_empty')}</li>
              ) : driverQueue.map((d, i) => (
                <li key={`${d.name}-${i}`} className={`queue-item${d.saved ? ' queue-item-saved' : ''}`}>
                  <span className="queue-pos">{i + 1}</span>
                  <span className="queue-name">{d.saved && <span className="saved-badge">★</span>}{d.name}{d.level ? ` (${levelLabel(d.level)})` : ''}</span>
                  <button type="button" className="btn-remove" onClick={() => setDriverQueue((q) => q.filter((_, idx) => idx !== i))}>X</button>
                </li>
              ))}
            </ul>
            <button type="button" className="btn-execute" onClick={executeAutoAssignment}>{t('admin_btn_execute')} 🚀</button>
          </div>
        </section>

        <aside className="admin-sidebar">
          <button type="button" className="btn-preview" onClick={() => setShowPreview((v) => !v)}>
            {showPreview ? t('admin_preview_close') : t('admin_preview')}
          </button>

          <div className="heat-clock-bar">
            <span className="field-label">{t('admin_heat_timer')}</span>
            <span className={`heat-clock-value${heatClock.running ? ' is-running' : ''}`}>
              {formatHeatClock(heatClock, t('admin_heat_not_started'))}
            </span>
          </div>

          {onTrack.length > 0 && (
            <div className="on-track-panel">
              <span className="field-label">{t('admin_on_track')}</span>
              <ul className="on-track-list">
                {onTrack.map((ot) => (
                  <li key={ot.kart_number} className="on-track-item">
                    <span>#{ot.kart_number} {ot.driver_name}</span>
                    <button type="button" className="btn-on-track-return" onClick={() => returnKartFromTrack(ot.kart_number, ot.laneId)}>
                      {t('admin_kart_return')}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="heat-type-bar">
            <label className="field-label">{t('admin_heat_settings')}</label>
            <select value={heatType} onChange={(e) => setHeatType(e.target.value)}>
              <option value="time">{t('heat_time')}</option>
              <option value="endurance">{t('heat_endurance')}</option>
              <option value="sprint">{t('heat_sprint')}</option>
            </select>
            {heatType === 'time' && (
              <>
                <span className="duration-unit-label">{t('admin_duration_unit')}</span>
                <div className="duration-presets">
                  {HEAT_DURATIONS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={`duration-chip${Number(heatDuration) === m ? ' active' : ''}`}
                      onClick={() => setHeatDuration(m)}
                    >
                      {m}
                    </button>
                  ))}
                </div>
                <input type="number" min="1" value={heatDuration} onChange={(e) => setHeatDuration(e.target.value)} placeholder={t('admin_duration_placeholder')} />
              </>
            )}
            {heatType === 'endurance' && (
              <div className="endurance-row">
                <label className="endurance-field">
                  <span className="endurance-field-label">{t('admin_hours_placeholder')}</span>
                  <input type="number" min="0" value={enduranceHours} onChange={(e) => setEnduranceHours(e.target.value)} />
                </label>
                <label className="endurance-field">
                  <span className="endurance-field-label">{t('admin_minutes_placeholder')}</span>
                  <input type="number" min="0" max="59" value={enduranceMinutes} onChange={(e) => setEnduranceMinutes(e.target.value)} />
                </label>
              </div>
            )}
            {heatType === 'sprint' && (
              <input type="number" value={targetLaps} onChange={(e) => setTargetLaps(e.target.value)} placeholder={t('admin_laps_placeholder')} />
            )}
          </div>

          <button type="button" className="btn-advanced-link" onClick={() => setShowAdvanced(true)}>{t('admin_advanced_settings')}</button>
        </aside>
      </div>
    </div>
  );
};

export default AdminPanel;
