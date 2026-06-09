import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import '../assets/AdminPanel.css';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import { useDialog } from '../i18n/DialogContext.jsx';
import LanguageSwitcher from './LanguageSwitcher.jsx';
import HakafastLogo from './HakafastLogo.jsx';
import AdminSetupModal from './AdminSetupModal.jsx';
import AdvancedSettingsModal from './AdvancedSettingsModal.jsx';
import EnduranceToolsModal from './EnduranceToolsModal.jsx';
import '../assets/SalesPages.css';
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
  getHeatClockClassName,
  buildExportFilename,
  pickKartsForAssignment,
  groupQueueByTeam,
  getExitKartNumber,
  getWaitingKartNumbers,
  sanitizePitLines,
} from '../utils/adminHelpers.js';
import {
  DEFAULT_TIMING_COLUMNS,
  ENDURANCE_DEFAULT_COLUMNS,
  OPTIONAL_TIMING_COLUMNS,
  TIMING_COLUMN_GROUPS,
  DEFAULT_TIMING_COLUMN_ORDER,
  normalizeTimingColumns,
  normalizeTimingColumnOrder,
  getReorderableTimingColumns,
  moveColumnOrder,
} from '../utils/liveTimingColumns.js';
import { calculateDayPlan } from '../utils/trackProfileClient.js';
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
  const { showAlert, showConfirmTwice } = useDialog();
  const trackSlug = trackName || 'kart-demo';

  const [showSetup, setShowSetup] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
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
  const [formationLaps, setFormationLaps] = useState(0);
  const [startMode, setStartMode] = useState('grid');
  const [exportCsv, setExportCsv] = useState(true);
  const [exportPdf, setExportPdf] = useState(false);
  const [timingColumns, setTimingColumns] = useState({ ...DEFAULT_TIMING_COLUMNS });
  const [timingColumnOrder, setTimingColumnOrder] = useState([...DEFAULT_TIMING_COLUMN_ORDER]);
  const [enduranceRules, setEnduranceRules] = useState('');
  const [trackDisplayName, setTrackDisplayName] = useState('');
  const [openingTime, setOpeningTime] = useState('10:00');
  const [closingTime, setClosingTime] = useState('22:00');
  const [sessionDurationPlan, setSessionDurationPlan] = useState(10);
  const [competitiveBlockMin, setCompetitiveBlockMin] = useState(45);
  const [turnoverMin, setTurnoverMin] = useState(5);
  const [pricePerSession, setPricePerSession] = useState(0);
  const [competitiveHeatsPlanned, setCompetitiveHeatsPlanned] = useState(0);
  const [enduranceTeams, setEnduranceTeams] = useState([]);

  const [drName, setDrName] = useState('');
  const [drTeam, setDrTeam] = useState('');
  const [showAdvancedReg, setShowAdvancedReg] = useState(false);
  const [chkPhone, setChkPhone] = useState(false);
  const [chkEmail, setChkEmail] = useState(false);
  const [drPhone, setDrPhone] = useState('');
  const [drEmail, setDrEmail] = useState('');
  const [drLevel, setDrLevel] = useState('Amateur');

  const [masterLapThreshold, setMasterLapThreshold] = useState('45.500');
  const [proLapThreshold, setProLapThreshold] = useState('42.000');
  const [pitExitPosition, setPitExitPosition] = useState('bottom');

  const [dragOverLane, setDragOverLane] = useState(null);
  const [dragOverPool, setDragOverPool] = useState(false);
  const [transponderFlashLane, setTransponderFlashLane] = useState(null);
  const [heatClock, setHeatClock] = useState({ running: false, remainingSec: 600, durationMin: 10, hasDrivers: false });
  const [onTrack, setOnTrack] = useState([]);
  const [heatDriverCount, setHeatDriverCount] = useState(0);
  const [autoFinishHandled, setAutoFinishHandled] = useState(false);
  const [assignedHeatKarts, setAssignedHeatKarts] = useState(new Set());
  const [heatNumber, setHeatNumber] = useState(null);
  const [penaltyKart, setPenaltyKart] = useState('');
  const [penaltySec, setPenaltySec] = useState('60');
  const [driverChangeKart, setDriverChangeKart] = useState('');
  const [driverChangeName, setDriverChangeName] = useState('');
  const [showEnduranceModal, setShowEnduranceModal] = useState(false);
  const [teamStarters, setTeamStarters] = useState({});
  const [nextHeatReadiness, setNextHeatReadiness] = useState(null);
  const autoFinishHandledRef = useRef(false);
  const pitsLocalEditUntilRef = useRef(0);


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
      const lines = sanitizePitLines(normalizeLinesData(d));
      setLinesData(lines);
      setAllKarts((prev) => reconcileKartsFromLines(prev, lines, onTrack.map((k) => k.kart_number)));
    }).catch(() => {});
    apiFetch('/api/admin/track-profile', {}, trackSlug).then((r) => r.json()).then((data) => {
      if (!data?.profile) return;
      const p = data.profile;
      if (p.trackDisplayName) setTrackDisplayName(p.trackDisplayName);
      if (p.openingTime) setOpeningTime(p.openingTime);
      if (p.closingTime) setClosingTime(p.closingTime);
      if (p.sessionDurationMin != null) setSessionDurationPlan(Number(p.sessionDurationMin) || 10);
      if (p.competitiveBlockMin != null) setCompetitiveBlockMin(Number(p.competitiveBlockMin) || 45);
      if (p.turnoverMin != null) setTurnoverMin(Number(p.turnoverMin) || 0);
      if (p.pricePerSession != null) setPricePerSession(Number(p.pricePerSession) || 0);
    }).catch(() => {});
    apiFetch('/api/heat-settings', {}, trackSlug).then((r) => r.json()).then((s) => {
      if (s?.type) setHeatType(s.type);
      if (s?.duration) setHeatDuration(s.duration);
      if (s?.targetLaps) setTargetLaps(String(s.targetLaps));
      if (s?.formationLaps != null) setFormationLaps(Number(s.formationLaps) || 0);
      if (s?.startMode) setStartMode(s.startMode);
      if (typeof s?.exportCsv === 'boolean') setExportCsv(s.exportCsv);
      if (typeof s?.exportPdf === 'boolean') setExportPdf(s.exportPdf);
      if (s?.timingColumns) setTimingColumns(normalizeTimingColumns(s.timingColumns));
      if (s?.timingColumnOrder) setTimingColumnOrder(normalizeTimingColumnOrder(s.timingColumnOrder));
      if (typeof s?.enduranceRules === 'string') setEnduranceRules(s.enduranceRules);
      if (s?.heatClock) setHeatClock(s.heatClock);
      if (s?.onTrack) {
        setOnTrack(s.onTrack);
        setAllKarts((prev) => reconcileKartsFromLines(prev, linesData, s.onTrack.map((k) => k.kart_number)));
      }
    }).catch(() => {});
    apiFetch('/api/admin/level-settings', {}, trackSlug).then((r) => r.json()).then((s) => {
      if (s?.masterLapThreshold) setMasterLapThreshold(s.masterLapThreshold);
      if (s?.proLapThreshold) setProLapThreshold(s.proLapThreshold);
      if (s?.pitExitPosition) setPitExitPosition(s.pitExitPosition);
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
          formationLaps: parseInt(formationLaps, 10) || 0,
          startMode: heatType === 'endurance' ? startMode : 'grid',
          exportCsv,
          exportPdf,
          timingColumns,
          timingColumnOrder,
          enduranceRules: heatType === 'endurance' ? enduranceRules : '',
        }),
      }, trackSlug).catch(() => {});
    }, 600);
    return () => clearTimeout(timer);
  }, [heatType, heatDuration, enduranceHours, enduranceMinutes, targetLaps, formationLaps, startMode, exportCsv, exportPdf, timingColumns, timingColumnOrder, enduranceRules, trackSlug]);

  useEffect(() => {
    const timer = setTimeout(() => {
      apiFetch('/api/admin/track-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trackDisplayName,
          openingTime,
          closingTime,
          sessionDurationMin: Number(sessionDurationPlan) || 10,
          competitiveBlockMin: Number(competitiveBlockMin) || 45,
          turnoverMin: Number(turnoverMin) || 0,
          pricePerSession: Number(pricePerSession) || 0,
        }),
      }, trackSlug).catch(() => {});
    }, 700);
    return () => clearTimeout(timer);
  }, [
    trackDisplayName,
    openingTime,
    closingTime,
    sessionDurationPlan,
    competitiveBlockMin,
    turnoverMin,
    pricePerSession,
    trackSlug,
  ]);

  const dayPlan = useMemo(
    () => calculateDayPlan({
      openingTime,
      closingTime,
      sessionDurationMin: sessionDurationPlan,
      competitiveBlockMin,
      turnoverMin,
      pricePerSession,
    }, { competitiveHeats: competitiveHeatsPlanned }),
    [
      openingTime,
      closingTime,
      sessionDurationPlan,
      competitiveBlockMin,
      turnoverMin,
      pricePerSession,
      competitiveHeatsPlanned,
    ],
  );

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

  const reorderableColumns = useMemo(
    () => getReorderableTimingColumns(timingColumns, timingColumnOrder, heatType === 'endurance'),
    [timingColumns, timingColumnOrder, heatType],
  );

  const selectedEnduranceTeam = useMemo(
    () => enduranceTeams.find((team) => String(team.kart_number) === String(driverChangeKart)),
    [enduranceTeams, driverChangeKart],
  );

  const enduranceQueueTeams = useMemo(() => {
    if (heatType !== 'endurance') return [];
    return groupQueueByTeam(driverQueue);
  }, [driverQueue, heatType]);

  const openLiveDeskWindow = useCallback(() => {
    const url = `${window.location.origin}/live-desk/${trackSlug}?heatType=${encodeURIComponent(heatType)}`;
    window.open(url, 'hakafast-live-desk', 'width=960,height=720,menubar=no,toolbar=no,location=no,status=no');
  }, [trackSlug, heatType]);

  const moveTimingColumn = (columnId, direction) => {
    setTimingColumnOrder((prev) => moveColumnOrder(prev, columnId, direction));
  };
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
      showAlert(t('admin_karts_invalid_input'));
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
    if (msgs.length) showAlert(msgs.join('\n'));
    else showAlert(t('admin_karts_none_added'));
    setKartInput('');
  };

  const toggleKartActive = (num, event) => {
    event.stopPropagation();
    const kart = allKarts[num];
    if (!kart) return;
    const nextActive = !kart.active;
    const laneKey = kart.lane != null ? String(kart.lane) : null;
    const lane = laneKey ? linesData[laneKey] : null;
    if (!nextActive && lane && lane.active) {
      const updatedLines = {
        ...linesData,
        [laneKey]: { ...lane, karts: lane.karts.filter((x) => Number(x) !== Number(num)) },
      };
      setLinesData(updatedLines);
      syncPitsWithServer(updatedLines);
    }
    setAllKarts((prev) => ({ ...prev, [num]: { ...kart, active: nextActive, lane: nextActive ? kart.lane : null } }));
  };

  const parseDragPayload = (e) => {
    const raw = e.dataTransfer.getData('text');
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.num != null) return parsed;
    } catch {
      /* plain number */
    }
    const num = parseInt(raw, 10);
    return Number.isNaN(num) ? null : { num, laneId: null, laneIndex: -1 };
  };

  const removeKartFromLaneAt = (lines, laneId, laneIndex, num) => {
    const lane = lines[laneId];
    if (!lane?.karts) return lines;
    const next = { ...lines };
    const karts = [...lane.karts];
    if (laneIndex >= 0 && laneIndex < karts.length && Number(karts[laneIndex]) === Number(num)) {
      karts.splice(laneIndex, 1);
    } else {
      const idx = karts.findIndex((x) => Number(x) === Number(num));
      if (idx >= 0) karts.splice(idx, 1);
    }
    next[laneId] = { ...lane, karts };
    return next;
  };

  const dropKart = async (num, laneNum, fromLaneId = null, fromLaneIndex = -1, insertAt = 'append') => {
    const key = String(num);
    const kart = allKarts[key] || allKarts[num];
    let updatedLines = { ...linesData };
    const laneKey = laneNum != null ? String(laneNum) : null;

    if (fromLaneId != null && fromLaneIndex >= 0) {
      updatedLines = removeKartFromLaneAt(updatedLines, String(fromLaneId), fromLaneIndex, num);
    } else if (kart?.lane != null && updatedLines[String(kart.lane)]) {
      updatedLines = removeKartFromLaneAt(updatedLines, String(kart.lane), -1, num);
    }

    if (laneKey && updatedLines[laneKey]) {
      const targetLane = updatedLines[laneKey];
      if (kart && !kart.active && targetLane.active) {
        /* inactive kart cannot enter active lane — fall through to pool/warehouse */
      } else {
        const n = Number(num);
        const onTrackNow = onTrack.some((ot) => Number(ot.kart_number) === n);
        const alreadyInLane = targetLane.karts.some((k) => Number(k) === n);
        const inOtherLane = Object.entries(updatedLines).some(([id, lane]) => (
          id !== laneKey && (lane.karts || []).some((k) => Number(k) === n)
        ));
        if (!onTrackNow && !alreadyInLane && !inOtherLane) {
          const karts = [...targetLane.karts];
          if (insertAt === 'front') {
            karts.unshift(n);
          } else {
            karts.push(n);
          }
          updatedLines[laneKey] = { ...targetLane, karts };
        }
      }
    }

    updatedLines = sanitizePitLines(updatedLines);

    setAllKarts((prev) => {
      const existing = prev[key] || prev[num];
      const base = existing || { number: num, active: true, lane: null, onTrack: false };
      const inTargetLane = laneKey && (updatedLines[laneKey]?.karts || []).some((k) => Number(k) === Number(num));
      const nextLane = inTargetLane ? Number(laneKey) : null;
      const inDisabledLane = laneKey && !updatedLines[laneKey]?.active;
      return {
        ...prev,
        [key]: {
          ...base,
          number: num,
          lane: nextLane,
          onTrack: false,
          active: inDisabledLane ? false : base.active,
        },
      };
    });
    setLinesData(updatedLines);
    pitsLocalEditUntilRef.current = Date.now() + 2000;
    await syncPitsWithServer(updatedLines);
  };

  const handleDropToLane = (e, laneNum, insertAt = 'append') => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverLane(null);
    const payload = parseDragPayload(e);
    if (payload) dropKart(payload.num, laneNum, payload.laneId, payload.laneIndex, insertAt);
  };

  const handleDropToPool = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverPool(false);
    const payload = parseDragPayload(e);
    if (payload) dropKart(payload.num, null, payload.laneId, payload.laneIndex);
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

  const handleToggleLane = async (laneId) => {
    const lane = linesData[laneId];
    if (lane?.active && !(await showConfirmTwice(t('admin_confirm_disable_lane'), t('admin_confirm_disable_lane_final')))) return;
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

  const handleRemoveLane = async (laneId) => {
    if (!(await showConfirmTwice(t('admin_confirm_remove_lane'), t('admin_confirm_remove_lane_final')))) return;
    removeLane(laneId);
  };

  const addDriverToQueue = () => {
    if (!canAddDriver) { showAlert(t('admin_alert_name_required')); return; }
    const team = heatType === 'endurance' ? (drTeam.trim() || null) : null;
    if (isBulkDrivers) {
      setDriverQueue((q) => [...q, ...driverNames.map((name) => ({
        name, team, phone: null, email: null, level: null, saved: false,
      }))]);
      setDrName('');
      return;
    }
    const name = driverNames[0];
    if (showAdvancedReg) {
      if (chkPhone && !drPhone.trim()) { showAlert(t('admin_alert_phone_required')); return; }
      if (chkEmail && !drEmail.trim()) { showAlert(t('admin_alert_email_required')); return; }
    }
    setDriverQueue((q) => [...q, {
      name,
      team,
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
      showAlert(t('admin_password_weak'));
      return;
    }
    try {
      const res = await apiFetch('/api/admin/level-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          masterLapThreshold,
          proLapThreshold,
          pitExitPosition,
          editPassword: settingsPassword || undefined,
        }),
      }, trackSlug);
      const result = await res.json();
      if (!result.success && result.error === 'weak_password') { showAlert(t('admin_password_weak')); return; }
      if (settingsPassword) setHasPassword(true);
      showAlert(t('admin_level_settings_saved'));
    } catch { showAlert(t('admin_alert_server_error')); }
  };

  const updateDriverLevelInDB = async (lookup, level, password) => {
    if (!lookup?.trim()) return;
    if (hasPassword && !password?.trim()) { showAlert(t('admin_edit_password_required')); return; }
    try {
      const response = await apiFetch('/api/admin/update-driver-level', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lookup: lookup.trim(), level, password: password || '' }),
      }, trackSlug);
      const result = await response.json();
      if (result.success) showAlert(t('admin_alert_driver_updated'));
      else if (result.error === 'bad_password') showAlert(t('admin_edit_password_wrong'));
      else showAlert(t('admin_alert_driver_not_found'));
    } catch { showAlert(t('admin_alert_server_error')); }
  };

  const runFinishHeat = useCallback(async (isAuto = false, startedAtOverride = null, settingsOverride = null) => {
    let doCsv = exportCsv;
    let doPdf = exportPdf;
    let finishHeatType = heatType;
    let finishStartedAt = startedAtOverride ?? heatClock.startedAt;

    if (settingsOverride) {
      if (typeof settingsOverride.exportCsv === 'boolean') doCsv = settingsOverride.exportCsv;
      if (typeof settingsOverride.exportPdf === 'boolean') doPdf = settingsOverride.exportPdf;
      if (settingsOverride.type) finishHeatType = settingsOverride.type;
      if (settingsOverride.startedAt != null) finishStartedAt = settingsOverride.startedAt;
    }

    const ackAutoExport = async () => {
      await apiFetch('/api/admin/auto-export-ack', { method: 'POST' }, trackSlug);
      autoFinishHandledRef.current = true;
      setAutoFinishHandled(true);
    };

    if (!doCsv && !doPdf) {
      if (isAuto) {
        try {
          await ackAutoExport();
        } catch { /* ignore */ }
      } else {
        showAlert(t('admin_export_select_one'));
      }
      return;
    }

    try {
      if (!isAuto) {
        await apiFetch('/api/admin/finish-heat', { method: 'POST' }, trackSlug);
      }
      const res = await apiFetch('/api/admin/export-data', {}, trackSlug);
      const rows = await res.json();
      if (!Array.isArray(rows) || rows.length === 0) {
        if (isAuto) await ackAutoExport();
        else showAlert(t('admin_export_no_data'));
        return;
      }
      const baseName = buildExportFilename(finishHeatType, finishStartedAt, 'csv').replace('.csv', '');
      const exportLabels = {
        pos: t('pos'),
        kart: t('kart'),
        driver: t('driver'),
        level: t('live_col_level'),
        last: t('last_lap'),
        best: t('best_lap'),
        laps: t('laps'),
        allLaps: t('admin_export_all_laps'),
      };
      const exportRows = rows.map((r) => ({
        ...r,
        driver_level: r.driver_level ? t(`level_${String(r.driver_level).toLowerCase()}`) : '',
      }));
      if (doCsv) downloadCsv(exportRows, `${baseName}.csv`, exportLabels);
      if (doPdf) printPdf(exportRows, `${baseName} — ${t('admin_export_title')}`, exportLabels);
      if (isAuto) {
        await ackAutoExport();
        showAlert(t('admin_finish_auto_done'));
      } else {
        showAlert(t('admin_finish_done'));
        setHeatDriverCount(0);
        setAssignedHeatKarts(new Set());
        setOnTrack([]);
        setHeatClock((c) => ({ ...c, running: false, startedAt: null }));
      }
    } catch {
      if (!isAuto) showAlert(t('admin_alert_server_error'));
    }
  }, [exportCsv, exportPdf, heatType, heatClock.startedAt, trackSlug, t]);

  const finishHeat = async () => {
    try {
      const res = await apiFetch('/api/heat-settings', {}, trackSlug);
      const hs = await res.json();
      runFinishHeat(false, heatClock.startedAt, {
        exportCsv: typeof hs.exportCsv === 'boolean' ? hs.exportCsv : exportCsv,
        exportPdf: typeof hs.exportPdf === 'boolean' ? hs.exportPdf : exportPdf,
        type: hs.type || heatType,
        startedAt: heatClock.startedAt,
      });
    } catch {
      runFinishHeat(false);
    }
  };

  useEffect(() => {
    const refreshSession = () => {
      apiFetch('/api/admin/session-state', {}, trackSlug)
        .then((r) => r.json())
        .then((s) => {
          if (s.heatClock) setHeatClock(s.heatClock);
          if (typeof s.heatDriverCount === 'number') setHeatDriverCount(s.heatDriverCount);
          if (s.heatKartNumbers || s.nextHeatKartNumbers) {
            const karts = new Set([
              ...(s.heatKartNumbers || []),
              ...(s.nextHeatKartNumbers || []),
            ]);
            setAssignedHeatKarts(karts);
          }
          if (s.onTrack) setOnTrack(s.onTrack);
          if (s.pitExitPosition) setPitExitPosition(s.pitExitPosition);
          if (s.pitLines && Date.now() > pitsLocalEditUntilRef.current) {
            const lines = normalizeLinesData(s.pitLines);
            setLinesData(lines);
            setAllKarts((prev) => reconcileKartsFromLines(prev, lines, (s.onTrack || []).map((k) => k.kart_number)));
          }
          if (typeof s.heatNumber === 'number') setHeatNumber(s.heatNumber);
          if (Array.isArray(s.enduranceTeams)) setEnduranceTeams(s.enduranceTeams);
          setNextHeatReadiness(s.nextHeatReadiness || null);
          if (!s.autoFinishRequested) {
            autoFinishHandledRef.current = false;
            setAutoFinishHandled(false);
          } else if (!autoFinishHandledRef.current) {
            const hs = s.heatSettings || {};
            runFinishHeat(true, s.autoFinishStartedAt ?? s.heatClock?.startedAt, {
              exportCsv: hs.exportCsv,
              exportPdf: hs.exportPdf,
              type: hs.type,
              startedAt: s.autoFinishStartedAt ?? s.heatClock?.startedAt,
            });
          }
        })
        .catch(() => {});
    };
    refreshSession();
    const timer = setInterval(refreshSession, 1000);
    return () => clearInterval(timer);
  }, [trackSlug, runFinishHeat]);

  const executeAutoAssignment = async () => {
    if (driverQueue.length === 0) { showAlert(t('admin_alert_no_drivers')); return; }
    let duration = heatDuration;
    if (heatType === 'endurance') duration = (parseInt(enduranceHours, 10) || 0) * 60 + (parseInt(enduranceMinutes, 10) || 0);
    const laneKeys = Object.keys(linesData).filter((id) => linesData[id].active);
    if (laneKeys.length === 0) { showAlert(t('admin_alert_no_lanes')); return; }
    const workingLines = JSON.parse(JSON.stringify(linesData));
    const isEndurance = heatType === 'endurance';
    const teams = isEndurance ? groupQueueByTeam(driverQueue) : null;
    const assignCount = isEndurance ? teams.length : driverQueue.length;
    const sessionActive = onTrack.length > 0
      ? !heatClock.cooldownPhase && !heatClock.draining
      : Boolean(heatClock.startedAt && heatClock.running && !heatClock.cooldownPhase);
    const { assigned: kartSlots, complete } = pickKartsForAssignment(workingLines, laneKeys, assignCount, {
      onTrackKarts: sessionActive ? onTrack.map((k) => k.kart_number) : [],
    });
    if (!complete) { showAlert(t('admin_alert_not_enough_karts')); return; }

    const assignments = isEndurance
      ? teams.map((team, i) => {
        const starterName = teamStarters[team.teamName] || team.drivers[0]?.name;
        const starterDriver = team.drivers.find((d) => d.name === starterName) || team.drivers[0];
        return {
          kart: kartSlots[i].kart,
          lane: kartSlots[i].lane,
          teamName: team.teamName,
          teamDrivers: team.drivers.map((d) => d.name),
          driver: starterDriver,
          activeDriver: starterName,
        };
      })
      : kartSlots.map((slot, i) => ({
        kart: slot.kart,
        lane: slot.lane,
        teamName: null,
        teamDrivers: null,
        driver: driverQueue[i],
      }));

    const payload = assignments.map((assign, i) => {
      const driverLabel = isEndurance
        ? assign.teamDrivers.join(' · ')
        : assign.driver.name;
      return {
        kart_number: assign.kart,
        driver_name: driverLabel,
        team_name: assign.teamName,
        team_drivers: assign.teamDrivers,
        phone: assign.driver.phone,
        email: assign.driver.email,
        registered: Boolean(assign.driver.saved),
        driver_level: assign.driver.saved ? (assign.driver.level || 'Amateur') : undefined,
        assignment_order: i + 1,
        active_driver: isEndurance ? assign.activeDriver : undefined,
      };
    });

    try {
      const res = await apiFetch('/api/admin/assign-heat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assignments: payload,
          heatSettings: {
            type: heatType,
            duration,
            targetLaps: parseInt(targetLaps, 10) || 0,
            formationLaps: parseInt(formationLaps, 10) || 0,
            startMode: isEndurance ? startMode : 'grid',
            exportCsv,
            exportPdf,
            timingColumns: isEndurance
              ? { ...ENDURANCE_DEFAULT_COLUMNS, ...timingColumns }
              : timingColumns,
          },
          pitLines: workingLines,
        }),
      }, trackSlug);
      const data = await res.json();
      if (!data.success) {
        if (data.error === 'not_enough_karts') showAlert(t('admin_alert_not_enough_karts'));
        else showAlert(t('admin_alert_server_error'));
        return;
      }

      const heatKarts = new Set(assignments.map((a) => Number(a.kart)));
      setAssignedHeatKarts(heatKarts);
      if (typeof data.heatNumber === 'number') setHeatNumber(data.heatNumber);
      if (data.prepared) {
        setHeatDriverCount(heatDriverCount);
        showAlert(t('admin_alert_assign_prepared'));
      } else {
        setHeatDriverCount(assignments.length);
        showAlert(t('admin_alert_assign_done'));
      }
      setDriverQueue([]);
      setLinesData(workingLines);
      syncPitsWithServer(workingLines);
    } catch {
      showAlert(t('admin_alert_server_error'));
    }
  };

  const handleSetupComplete = ({ kartNumbers, hasPassword: pwSet }) => {
    setShowSetup(false);
    if (pwSet) setHasPassword(true);
    if (kartNumbers?.trim()) {
      parseKartNumbers(kartNumbers).forEach((n) => addKartEntity(n));
    }
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

  const deployAllGridKarts = async () => {
    try {
      const res = await apiFetch('/api/admin/kart-grid-deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      }, trackSlug);
      const data = await res.json();
      if (!data.success) {
        if (data.error === 'not_le_mans_start') showAlert(t('admin_le_mans_mode_required'));
        else showAlert(t('admin_alert_server_error'));
        return;
      }
      applySessionPayload(data);
    } catch {
      showAlert(t('admin_alert_server_error'));
    }
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
        if (data.error === 'not_on_track') showAlert(t('admin_return_error_track'));
        else if (data.error === 'keep_for_next_heat') showAlert(t('admin_return_error_next_heat'));
        else showAlert(t('admin_alert_server_error'));
        return;
      }
      applySessionPayload(data);
    } catch {
      showAlert(t('admin_alert_server_error'));
    }
  };

  const resetWorkspace = async () => {
    if (!usesIsolatedWorkspace(trackSlug)) return;
    if (!(await showConfirmTwice(t('admin_reset_confirm'), t('admin_reset_confirm_final')))) return;
    const oldId = getWorkspaceId(trackSlug);
    try {
      await apiFetch('/api/workspace/reset', { method: 'POST' }, trackSlug);
      await clearLocalSnapshot(trackSlug, oldId);
      resetWorkspaceId(trackSlug);
      window.location.reload();
    } catch {
      showAlert(t('admin_alert_server_error'));
    }
  };

  const simulateTransponderPitExit = async (laneId, kartNum) => {
    if (!assignedHeatKarts.has(Number(kartNum))) return;
    try {
      const res = await apiFetch('/api/transponder/pit-exit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transponder_id: String(kartNum) }),
      }, trackSlug);
      const data = await res.json();
      if (!data.success) {
        if (data.error === 'use_grid_deploy') showAlert(t('admin_le_mans_use_grid'));
        return;
      }
      setTransponderFlashLane(laneId);
      window.setTimeout(() => setTransponderFlashLane((prev) => (prev === laneId ? null : prev)), 700);
      applySessionPayload(data);
    } catch {
      /* ignore simulation errors */
    }
  };

  const simulateTransponderLap = async (kartNum) => {
    try {
      const res = await apiFetch('/api/transponder/lap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transponder_id: String(kartNum) }),
      }, trackSlug);
      const data = await res.json();
      if (!data.success) return;
      if (data.pitLines || data.onTrack) applySessionPayload(data);
    } catch {
      /* ignore simulation errors */
    }
  };

  const renderExitZone = (laneId, exitKart) => {
    const transponderReady = exitKart && assignedHeatKarts.has(Number(exitKart));
    return (
      <div
        className="lane-exit-zone lane-transponder-zone"
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onDrop={(e) => handleDropToLane(e, laneId, 'front')}
      >
        <div className="transponder-beacon-row">
          <button
            type="button"
            className={`transponder-beacon-btn${transponderFlashLane === laneId ? ' is-detected' : ''}`}
            onClick={() => exitKart && simulateTransponderPitExit(laneId, exitKart)}
            disabled={!transponderReady}
            title={transponderReady ? t('admin_transponder_simulate') : t('admin_transponder_idle')}
            aria-label={t('admin_transponder_simulate')}
          >
            <span className="transponder-beacon" aria-hidden />
          </button>
          {transponderReady && (
            <span className="transponder-hint">{t('admin_transponder_simulate')}</span>
          )}
        </div>
        <div className="lane-exit-track" />
        {exitKart && allKarts[exitKart] ? (
          <KartCard
            key={`${laneId}-exit-${exitKart}-0`}
            num={exitKart}
            kart={allKarts[exitKart]}
            draggable
            variant="exiting"
            laneId={laneId}
            laneIndex={0}
            transponderActive={transponderReady}
          />
        ) : (
          <div className="lane-exit-slot" aria-hidden />
        )}
      </div>
    );
  };

  const renderWaitingZone = (laneId, waitingKarts, exitAtBottom) => {
    const displayKarts = exitAtBottom ? [...waitingKarts].reverse() : waitingKarts;
    return (
      <div
        className="lane-waiting-zone"
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onDrop={(e) => handleDropToLane(e, laneId, 'append')}
      >
        {displayKarts.map((num, idx) => {
          const laneIndex = exitAtBottom ? waitingKarts.length - idx : idx + 1;
          const kart = allKarts[num] || allKarts[String(num)];
          if (!kart) return null;
          return (
            <KartCard
              key={`${laneId}-w-${laneIndex}-${num}`}
              num={num}
              kart={kart}
              draggable
              variant="waiting"
              laneId={laneId}
              laneIndex={laneIndex}
            />
          );
        })}
      </div>
    );
  };

  const poolKarts = Object.keys(allKarts).filter((num) => {
    const k = allKarts[num];
    return k && k.lane == null && !k.onTrack;
  });
  const addEndurancePenalty = async () => {
    const kart = parseInt(penaltyKart, 10);
    const seconds = parseInt(penaltySec, 10);
    if (!kart || !seconds) return;
    try {
      const res = await apiFetch('/api/admin/endurance/penalty', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kart_number: kart, seconds }),
      }, trackSlug);
      const data = await res.json();
      if (!data.success) showAlert(t('admin_alert_server_error'));
    } catch {
      showAlert(t('admin_alert_server_error'));
    }
  };

  const changeEnduranceDriver = async () => {
    const kart = parseInt(driverChangeKart, 10);
    if (!kart || !driverChangeName.trim()) return;
    try {
      const res = await apiFetch('/api/admin/endurance/driver-change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kart_number: kart, driver_name: driverChangeName.trim() }),
      }, trackSlug);
      const data = await res.json();
      if (data.success) {
        if (data.pending) {
          showAlert(t('admin_driver_change_pending'), { variant: 'success' });
        } else {
          showAlert(t('admin_driver_change_done'), { variant: 'success' });
        }
      } else if (data.error === 'driver_change_in_pits_only') {
        showAlert(t('admin_driver_change_pits_only'));
      } else {
        showAlert(t('admin_endurance_driver_error'));
      }
    } catch {
      showAlert(t('admin_alert_server_error'));
    }
  };

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
          pitExitPosition={pitExitPosition}
          setPitExitPosition={setPitExitPosition}
          onSaveSettings={saveLevelSettings}
          onUpdateDriverLevel={updateDriverLevelInDB}
          showResetWorkspace={usesIsolatedWorkspace(trackSlug)}
          onResetWorkspace={resetWorkspace}
          exportCsv={exportCsv}
          setExportCsv={setExportCsv}
          exportPdf={exportPdf}
          setExportPdf={setExportPdf}
          onFinishHeat={finishHeat}
        />
      )}
      {showEnduranceModal && (
        <EnduranceToolsModal
          onClose={() => setShowEnduranceModal(false)}
          t={t}
          enduranceTeams={enduranceTeams}
          penaltyKart={penaltyKart}
          setPenaltyKart={setPenaltyKart}
          penaltySec={penaltySec}
          setPenaltySec={setPenaltySec}
          onAddPenalty={addEndurancePenalty}
          driverChangeKart={driverChangeKart}
          setDriverChangeKart={setDriverChangeKart}
          driverChangeName={driverChangeName}
          setDriverChangeName={setDriverChangeName}
          selectedEnduranceTeam={selectedEnduranceTeam}
          onDriverChange={changeEnduranceDriver}
          enduranceRules={enduranceRules}
          setEnduranceRules={setEnduranceRules}
        />
      )}

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

      {nextHeatReadiness?.total > 0 && (
        <p className="admin-next-heat-banner" role="status">
          {t('admin_next_heat_ready', {
            ready: nextHeatReadiness.readyToLaunch,
            waiting: nextHeatReadiness.waitingOnTrack,
            queue: nextHeatReadiness.inPitsQueue,
          })}
        </p>
      )}

      <div className="admin-workspace">
        <section className="admin-pits-column">
          <div className="inventory-pits-panel">
            <div className="warehouse-zone">
              <h2>{t('admin_warehouse')}</h2>
              <div className="input-group">
                <input
                  type="text"
                  value={kartInput}
                  onChange={(e) => setKartInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addKartsFromInput(); } }}
                  placeholder={t('admin_kart_input_placeholder')}
                />
                <button type="button" onClick={addKartsFromInput}>{t('admin_add_inventory')}</button>
              </div>
              <div
                className={`kart-pool${dragOverPool ? ' drag-over' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setDragOverPool(true); }}
                onDragLeave={() => setDragOverPool(false)}
                onDrop={handleDropToPool}
              >
                {poolKarts.map((num) => (
                  <KartCard key={num} num={num} kart={allKarts[num]} onToggle={toggleKartActive} draggable variant="pool" showToggle />
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
                  const exitKart = getExitKartNumber(lane);
                  const waitingKarts = getWaitingKartNumbers(lane);
                  const exitAtBottom = pitExitPosition !== 'top';
                  return (
                    <div
                      key={laneId}
                      className={`lane lane-flow-${exitAtBottom ? 'bottom' : 'top'}${!lane.active ? ' disabled-lane' : ''}${dragOverLane === laneId ? ' drag-over' : ''}`}
                      onDragOver={(e) => { e.preventDefault(); setDragOverLane(laneId); }}
                      onDragLeave={() => setDragOverLane(null)}
                      onDrop={(e) => handleDropToLane(e, laneId, 'append')}
                    >
                      <input type="text" className="lane-header-input" value={lane.name} onChange={(e) => changeLaneName(laneId, e.target.value)} />
                      <div className="lane-controls">
                        <button type="button" className="btn-muted" onClick={() => handleToggleLane(laneId)}>
                          {lane.active ? t('admin_lane_disable') : t('admin_lane_enable')}
                        </button>
                        <button type="button" className="btn-danger" onClick={() => handleRemoveLane(laneId)}>{t('admin_lane_remove')}</button>
                      </div>
                      {exitAtBottom ? (
                        <>
                          {renderWaitingZone(laneId, waitingKarts, true)}
                          {renderExitZone(laneId, exitKart)}
                        </>
                      ) : (
                        <>
                          {renderExitZone(laneId, exitKart)}
                          {renderWaitingZone(laneId, waitingKarts, false)}
                        </>
                      )}
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
                    [...onTrack]
                      .sort((a, b) => (a.launchedAt || 0) - (b.launchedAt || 0))
                      .map((ot) => (
                        <button
                          key={ot.kart_number}
                          type="button"
                          className="on-track-num"
                          title={t('admin_on_track_simulate_lap')}
                          onClick={() => simulateTransponderLap(ot.kart_number)}
                          onDoubleClick={() => returnKartFromTrack(ot.kart_number, ot.laneId || ot.originLaneId)}
                        >
                          {ot.kart_number}
                        </button>
                      ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="admin-drivers-column">
          <div className="driver-column driver-column-main">
            <h2>{t('admin_register_title')}</h2>
            <div className="section-box">
              <label>{t('admin_req_label')}</label>
              <input
                type="text"
                value={drName}
                onChange={(e) => setDrName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && canAddDriver) { e.preventDefault(); addDriverToQueue(); } }}
                placeholder={t('admin_driver_placeholder_bulk')}
              />
              {isBulkDrivers && <p className="bulk-hint">{t('admin_bulk_names_hint')} ({driverNames.length})</p>}
              {heatType === 'endurance' && (
                <input
                  type="text"
                  value={drTeam}
                  onChange={(e) => setDrTeam(e.target.value)}
                  placeholder={t('admin_team_placeholder')}
                />
              )}
            </div>
            <button type="button" className="btn-full btn-add-queue" onClick={addDriverToQueue} disabled={!canAddDriver}>{t('admin_btn_add_queue')}</button>
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
            <p className="level-hint">{t('admin_level_from_laps_hint')}</p>
            <h3 className="queue-heading">{t('admin_queue_title')}</h3>
            {heatType === 'endurance' && enduranceQueueTeams.length > 0 && (
              <div className="endurance-starter-panel">
                <span className="field-label">{t('admin_starter_drivers')}</span>
                <p className="timing-columns-intro">{t('admin_starter_drivers_hint')}</p>
                {enduranceQueueTeams.map((team) => (
                  <div key={team.teamName} className="endurance-starter-team">
                    <strong>{team.teamName}</strong>
                    {team.drivers.map((d) => (
                      <label key={`${team.teamName}-${d.name}`} className="endurance-starter-option">
                        <input
                          type="radio"
                          name={`starter-${team.teamName}`}
                          checked={(teamStarters[team.teamName] || team.drivers[0]?.name) === d.name}
                          onChange={() => setTeamStarters((prev) => ({ ...prev, [team.teamName]: d.name }))}
                        />
                        {d.name}
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            )}
            <ul className="queue-list queue-list-tall">
              {driverQueue.length === 0 ? (
                <li className="queue-empty">{t('admin_queue_empty')}</li>
              ) : driverQueue.map((d, i) => (
                <li key={`${d.name}-${i}`} className={`queue-item${d.saved ? ' queue-item-saved' : ''}`}>
                  <span className="queue-pos">{i + 1}</span>
                  <span className="queue-name">
                    {d.saved && <span className="saved-badge">★</span>}
                    {d.team && <span className="queue-team">{d.team} — </span>}
                    {d.name}{d.level ? ` (${levelLabel(d.level)})` : ''}
                  </span>
                  <button type="button" className="btn-remove" onClick={() => setDriverQueue((q) => q.filter((_, idx) => idx !== i))}>X</button>
                </li>
              ))}
            </ul>
            <button type="button" className="btn-execute" onClick={executeAutoAssignment}>{t('admin_btn_execute')} 🚀</button>
          </div>
        </section>

        <aside className="admin-sidebar">
          <button type="button" className="btn-preview" onClick={openLiveDeskWindow}>
            {t('admin_open_live_desk')}
          </button>
          {heatType === 'endurance' && (
            <button type="button" className="btn-muted btn-endurance-tools" onClick={() => setShowEnduranceModal(true)}>
              {t('admin_open_endurance_tools')}
            </button>
          )}

          <div className="heat-clock-bar">
            <span className="field-label">{t('admin_heat_timer')}</span>
            <span className={`heat-clock-value${getHeatClockClassName(heatClock)}`}>
              {formatHeatClock(heatClock, t('admin_heat_not_started'), '00:00', {
                lastLap: t('live_race_last_lap'),
                checkered: '🏁',
                formation: t('live_race_formation'),
              })}
            </span>
            {heatNumber ? (
              <span className="admin-heat-number">{t('live_heat_number', { n: heatNumber })}</span>
            ) : null}
          </div>

          <div className="track-planner-panel">
            <span className="field-label">{t('admin_track_planner')}</span>
            <p className="timing-columns-intro">{t('admin_track_planner_hint')}</p>
            <label className="planner-field">
              <span>{t('admin_track_display_name')}</span>
              <input type="text" value={trackDisplayName} onChange={(e) => setTrackDisplayName(e.target.value)} />
            </label>
            <div className="planner-row">
              <label className="planner-field">
                <span>{t('admin_opening_time')}</span>
                <input type="time" value={openingTime} onChange={(e) => setOpeningTime(e.target.value)} />
              </label>
              <label className="planner-field">
                <span>{t('admin_closing_time')}</span>
                <input type="time" value={closingTime} onChange={(e) => setClosingTime(e.target.value)} />
              </label>
            </div>
            <div className="planner-row">
              <label className="planner-field">
                <span>{t('admin_session_duration_plan')}</span>
                <input type="number" min="1" value={sessionDurationPlan} onChange={(e) => setSessionDurationPlan(e.target.value)} />
              </label>
              <label className="planner-field">
                <span>{t('admin_turnover_min')}</span>
                <input type="number" min="0" value={turnoverMin} onChange={(e) => setTurnoverMin(e.target.value)} />
              </label>
            </div>
            <div className="planner-row">
              <label className="planner-field">
                <span>{t('admin_competitive_block_min')}</span>
                <input type="number" min="1" value={competitiveBlockMin} onChange={(e) => setCompetitiveBlockMin(e.target.value)} />
              </label>
              <label className="planner-field">
                <span>{t('admin_price_per_session')}</span>
                <input type="number" min="0" value={pricePerSession} onChange={(e) => setPricePerSession(e.target.value)} />
              </label>
            </div>
            <label className="planner-field">
              <span>{t('admin_competitive_heats_planned')}</span>
              <input
                type="number"
                min="0"
                max="20"
                value={competitiveHeatsPlanned}
                onChange={(e) => setCompetitiveHeatsPlanned(e.target.value)}
              />
            </label>
            <div className="planner-stats">
              <div><strong>{dayPlan.maxSessionHeats}</strong> {t('admin_plan_max_heats')}</div>
              <div><strong>{dayPlan.maxSessionHeatsAfterCompetitive}</strong> {t('admin_plan_after_competitive')}</div>
              <div><strong>{dayPlan.estimatedRevenueAfterCompetitive}</strong> {t('admin_plan_revenue')}</div>
            </div>
            <button
              type="button"
              className="btn-muted planner-apply-btn"
              onClick={() => setHeatDuration(String(sessionDurationPlan))}
            >
              {t('admin_apply_session_duration')}
            </button>
          </div>

          <div className="heat-type-bar">
            <label className="field-label">{t('admin_heat_settings')}</label>
            <select value={heatType} onChange={(e) => setHeatType(e.target.value)}>
              <option value="time">{t('heat_time')}</option>
              <option value="endurance">{t('heat_endurance')}</option>
              <option value="sprint">{t('heat_sprint')}</option>
            </select>
            <p className="heat-mode-hint">
              {heatType === 'time' ? t('admin_heat_mode_session') : t('admin_heat_mode_competitive')}
            </p>
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
            {(heatType === 'sprint' || heatType === 'endurance') && (
              <label className="formation-laps-field">
                <span className="field-label">{t('admin_formation_laps')}</span>
                <input
                  type="number"
                  min="0"
                  max="5"
                  value={formationLaps}
                  onChange={(e) => setFormationLaps(e.target.value)}
                  placeholder="0"
                />
              </label>
            )}
            {heatType === 'endurance' && (
              <label className="start-mode-field">
                <span className="field-label">{t('admin_start_mode')}</span>
                <select value={startMode} onChange={(e) => setStartMode(e.target.value)}>
                  <option value="grid">{t('admin_start_grid')}</option>
                  <option value="le_mans">{t('admin_start_le_mans')}</option>
                </select>
              </label>
            )}
          </div>

          {heatType === 'endurance' && startMode === 'le_mans' && (
            <div className="le-mans-panel">
              <span className="field-label">{t('admin_le_mans_deploy')}</span>
              <button type="button" className="btn-muted" onClick={deployAllGridKarts}>
                {t('admin_le_mans_deploy_all')}
              </button>
              <p className="endurance-hint">{t('admin_le_mans_hint')}</p>
            </div>
          )}

          <div className="timing-columns-bar">
            <span className="field-label">{t('admin_timing_columns')}</span>
            <p className="timing-columns-intro">{t('admin_timing_columns_hint')}</p>
            {TIMING_COLUMN_GROUPS.map((group) => (
              <div key={group.id} className={`timing-column-group timing-column-group-${group.id}`}>
                <div className="timing-group-head">
                  <span className="timing-group-label">{t(group.labelKey)}</span>
                  <span className="timing-group-hint">{t(group.descriptionKey)}</span>
                </div>
                <div className="timing-columns-chips">
                  {OPTIONAL_TIMING_COLUMNS.filter((col) => col.group === group.id && !col.alwaysOn).map((col) => (
                    <button
                      key={col.id}
                      type="button"
                      className={`timing-chip timing-chip-${group.id}${timingColumns[col.id] ? ' active' : ''}`}
                      onClick={() => setTimingColumns((prev) => ({ ...prev, [col.id]: !prev[col.id] }))}
                    >
                      {t(col.labelKey)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {reorderableColumns.length > 0 && (
              <div className="timing-column-order">
                <span className="field-label">{t('admin_timing_column_order')}</span>
                <p className="timing-columns-intro">{t('admin_timing_column_order_fixed')}</p>
                <ul className="timing-order-list">
                  {reorderableColumns.map((col, idx) => (
                    <li key={col.id} className="timing-order-row">
                      <span>{t(col.labelKey)}</span>
                      <span className="timing-order-actions">
                        <button
                          type="button"
                          className="timing-order-btn"
                          disabled={idx === 0}
                          onClick={() => moveTimingColumn(col.id, -1)}
                          aria-label={t('admin_move_column_up')}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="timing-order-btn"
                          disabled={idx === reorderableColumns.length - 1}
                          onClick={() => moveTimingColumn(col.id, 1)}
                          aria-label={t('admin_move_column_down')}
                        >
                          ↓
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <button type="button" className="btn-advanced-link" onClick={() => setShowAdvanced(true)}>{t('admin_advanced_settings')}</button>
        </aside>
      </div>
    </div>
  );
};

export default AdminPanel;
