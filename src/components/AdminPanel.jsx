import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import '../assets/AdminPanel.css';
import '../assets/AdminWalkthrough.css';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import { useDialog } from '../i18n/DialogContext.jsx';
import LanguageSwitcher from './LanguageSwitcher.jsx';
import HakafastLogo from './HakafastLogo.jsx';
import AdvancedSettingsModal from './AdvancedSettingsModal.jsx';
import EnduranceToolsModal from './EnduranceToolsModal.jsx';
import ProRaceEventModal from './ProRaceEventModal.jsx';
import ChampionshipModal from './ChampionshipModal.jsx';
import TrackPlannerModal from './TrackPlannerModal.jsx';
import TimingColumnsPicker from './TimingColumnsPicker.jsx';
import AdminWalkthrough, { isAdminTourDone } from './AdminWalkthrough.jsx';
import LivePreviewFloat from './LivePreviewFloat.jsx';
import TimingColumnOrderList from './TimingColumnOrderList.jsx';
import '../assets/SalesPages.css';
import KartCard from './KartCard.jsx';
import LaneKartSlot from './LaneKartSlot.jsx';
import { useTickingHeatClock } from '../hooks/useTickingHeatClock.js';
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
  reorderAssignedKartsToPitFront,
  reorderKartsInLaneArray,
  groupQueueByTeam,
  formatEnduranceQueueDriver,
  removeTeamFromQueue,
  getExitKartNumber,
  getWaitingKartNumbers,
  orderOnTrackKartsForPitEntry,
  resolveLaneInsertIndex,
  sanitizePitLines,
} from '../utils/adminHelpers.js';
import {
  DEFAULT_TIMING_COLUMNS,
  ENDURANCE_DEFAULT_COLUMNS,
  DEFAULT_TIMING_COLUMN_ORDER,
  normalizeTimingColumns,
  normalizeTimingColumnOrder,
  getReorderableTimingColumns,
  reorderColumnOrder,
} from '../utils/liveTimingColumns.js';
import { calculateDayPlan } from '../utils/trackProfileClient.js';
import {
  collectKartAssignments,
  DEFAULT_KART_TYPE_PRESETS,
  formatKartTypeLabel,
  getKartTypeById,
  normalizeKartTypes,
  resolveKartModelId as lookupKartModelId,
} from '../utils/kartTypes.js';
import KartTypesEditor from './KartTypesEditor.jsx';
import { apiFetch } from '../utils/apiClient.js';
import {
  usesIsolatedWorkspace,
  getWorkspaceId,
  getWorkspaceLabel,
  resetWorkspaceId,
} from '../utils/workspace.js';
import { saveLocalSnapshot, loadLocalSnapshot, clearLocalSnapshot } from '../utils/workspaceStorage.js';
import {
  appendStintRulesToEnduranceRules,
  buildSessionsFromGroups,
  buildTeamStartersFromGroups,
  buildAdvancementGroups,
  sprintRoundLabelKey,
  normalizeGroupDrivers,
  groupsToDriverQueue,
  normalizePlannedRaceEvent,
  parseDriversLine,
  serializeGroupsText,
} from '../utils/raceEventHelpers.js';

const DEFAULT_LINES = {
  1: { name: 'טור 1', active: true, karts: [] },
  2: { name: 'טור 2', active: true, karts: [] },
};

const HEAT_DURATIONS = [10, 15, 20, 30];
const ADMIN_THEME_KEY = 'hf_admin_theme';

function readAdminTheme() {
  try {
    return localStorage.getItem(ADMIN_THEME_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function normalizeLinesData(data) {
  if (!data) return { ...DEFAULT_LINES };
  if (Array.isArray(data)) {
    const obj = {};
    data.forEach((lane) => {
      obj[lane.id] = {
        name: lane.name,
        active: lane.active,
        karts: lane.karts || [],
        maxKarts: lane.maxKarts ?? null,
        color: lane.color ?? null,
      };
    });
    return Object.keys(obj).length ? obj : { ...DEFAULT_LINES };
  }
  return data;
}

function countAllPitKarts(lines) {
  return Object.values(lines || {}).reduce(
    (sum, lane) => sum + (lane?.karts?.length || 0),
    0,
  );
}

const AdminPanel = () => {
  const { trackName } = useParams();
  const { t } = useLanguage();
  const { showAlert, showConfirmTwice } = useDialog();
  const trackSlug = trackName || 'kart-demo';

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
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
  const [avgDriversPerSession, setAvgDriversPerSession] = useState(8);
  const [pricePerSession, setPricePerSession] = useState(0);
  const [competitiveHeatsPlanned, setCompetitiveHeatsPlanned] = useState(0);
  const [multipleKartTypes, setMultipleKartTypes] = useState(false);
  const [kartTypes, setKartTypes] = useState([]);
  const [selectedKartTypeId, setSelectedKartTypeId] = useState('');
  const [kartNumbersByType, setKartNumbersByType] = useState({});
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
  const displayHeatClock = useTickingHeatClock(heatClock);
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
  const [showProEventModal, setShowProEventModal] = useState(false);
  const [proEventModalType, setProEventModalType] = useState('endurance');
  const [proEventSaving, setProEventSaving] = useState(false);
  const [plannedRaceEvent, setPlannedRaceEvent] = useState(null);
  const [showTrackPlannerModal, setShowTrackPlannerModal] = useState(false);
  const [showChampionshipModal, setShowChampionshipModal] = useState(false);
  const [plannerSaving, setPlannerSaving] = useState(false);
  const [showWalkthrough, setShowWalkthrough] = useState(false);
  const [showLivePreview, setShowLivePreview] = useState(false);
  const [adminTheme, setAdminTheme] = useState(readAdminTheme);
  const [teamStarters, setTeamStarters] = useState({});
  const [nextHeatReadiness, setNextHeatReadiness] = useState(null);
  const autoFinishHandledRef = useRef(false);
  const pitsLocalEditUntilRef = useRef(0);
  const linesDataRef = useRef(linesData);
  linesDataRef.current = linesData;


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
          setNeedsOnboarding(true);
          setShowWalkthrough(true);
          return;
        }
        if (!isAdminTourDone(trackSlug)) {
          setShowWalkthrough(true);
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
      if (p.avgDriversPerSession != null) setAvgDriversPerSession(Math.max(1, Number(p.avgDriversPerSession) || 8));
      if (p.pricePerSession != null) setPricePerSession(Number(p.pricePerSession) || 0);
      if (typeof p.multipleKartTypes === 'boolean') setMultipleKartTypes(p.multipleKartTypes);
      if (Array.isArray(p.kartTypes)) {
        const types = normalizeKartTypes(p.kartTypes);
        setKartTypes(types);
        setSelectedKartTypeId((prev) => prev || types[0]?.id || '');
      }
      if (p.kartNumbersByType && typeof p.kartNumbersByType === 'object') {
        setKartNumbersByType(p.kartNumbersByType);
      }
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
      if (s?.plannedRaceEvent) setPlannedRaceEvent(normalizePlannedRaceEvent(s.plannedRaceEvent));
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
        if (local?.allKarts) {
          setAllKarts((prev) => reconcileKartsFromLines(
            { ...local.allKarts, ...prev },
            linesDataRef.current,
            (onTrack || []).map((k) => k.kart_number),
          ));
        }
      });
      apiFetch('/api/workspace/backup', {}, trackSlug)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.success && data?.snapshot?.clientSnapshot?.allKarts) {
            setAllKarts((prev) => reconcileKartsFromLines(
              { ...data.snapshot.clientSnapshot.allKarts, ...prev },
              linesDataRef.current,
              (onTrack || []).map((k) => k.kart_number),
            ));
          }
        })
        .catch(() => {});
    }
  }, [trackSlug]);

  useEffect(() => { syncQueue(driverQueue); }, [driverQueue, syncQueue]);

  useEffect(() => {
    if (!multipleKartTypes || !kartTypes.length) return;
    setAllKarts((prev) => {
      let changed = false;
      const next = { ...prev };
      Object.keys(next).forEach((key) => {
        const k = next[key];
        if (!k) return;
        const expectedId = lookupKartModelId(k, kartTypes, kartNumbersByType);
        if ((k.modelId || null) !== (expectedId || null)) {
          next[key] = { ...k, modelId: expectedId };
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [multipleKartTypes, kartTypes, kartNumbersByType]);

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
          plannedRaceEvent,
        }),
      }, trackSlug).catch(() => {});
    }, 600);
    return () => clearTimeout(timer);
  }, [heatType, heatDuration, enduranceHours, enduranceMinutes, targetLaps, formationLaps, startMode, exportCsv, exportPdf, timingColumns, timingColumnOrder, enduranceRules, plannedRaceEvent, trackSlug]);

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
          avgDriversPerSession: Math.max(1, Number(avgDriversPerSession) || 8),
          pricePerSession: Number(pricePerSession) || 0,
          multipleKartTypes,
          kartTypes: multipleKartTypes ? normalizeKartTypes(kartTypes) : [],
          kartNumbersByType: multipleKartTypes ? kartNumbersByType : {},
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
    avgDriversPerSession,
    pricePerSession,
    multipleKartTypes,
    kartTypes,
    kartNumbersByType,
    trackSlug,
  ]);

  const dayPlan = useMemo(
    () => calculateDayPlan({
      openingTime,
      closingTime,
      sessionDurationMin: sessionDurationPlan,
      competitiveBlockMin,
      turnoverMin,
      avgDriversPerSession,
      pricePerSession,
    }, { competitiveHeats: competitiveHeatsPlanned }),
    [
      openingTime,
      closingTime,
      sessionDurationPlan,
      competitiveBlockMin,
      turnoverMin,
      avgDriversPerSession,
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

  const handleTimingColumnReorder = useCallback((fromId, toId) => {
    setTimingColumnOrder((prev) => reorderColumnOrder(prev, fromId, toId));
  }, []);

  const selectedEnduranceTeam = useMemo(
    () => enduranceTeams.find((team) => String(team.kart_number) === String(driverChangeKart)),
    [enduranceTeams, driverChangeKart],
  );

  const enduranceQueueTeams = useMemo(() => {
    if (heatType !== 'endurance') return [];
    return groupQueueByTeam(driverQueue);
  }, [driverQueue, heatType]);

  const levelLabel = (level) => t(`level_${(level || 'Amateur').toLowerCase()}`);
  const driverNames = useMemo(() => parseDriverNames(drName), [drName]);
  const isBulkDrivers = isBulkDriverInput(drName);
  const canAddDriver = driverNames.length > 0;

  const coerceModelTypeId = useCallback((modelId) => {
    if (!multipleKartTypes || kartTypes.length === 0) return null;
    if (modelId && kartTypes.some((row) => row.id === modelId)) return modelId;
    const id = selectedKartTypeId || kartTypes[0]?.id;
    return kartTypes.some((row) => row.id === id) ? id : kartTypes[0]?.id || null;
  }, [multipleKartTypes, kartTypes, selectedKartTypeId]);

  const kartModelProps = useCallback((kart) => {
    if (!multipleKartTypes) return {};
    const modelId = kart?.modelId || lookupKartModelId(kart, kartTypes, kartNumbersByType);
    const type = getKartTypeById(kartTypes, modelId);
    return type ? { modelColor: type.color, modelName: formatKartTypeLabel(type) } : {};
  }, [multipleKartTypes, kartTypes, kartNumbersByType]);

  const addKartEntity = (num, modelId = null) => {
    const resolvedModelId = coerceModelTypeId(modelId);
    setAllKarts((prev) => {
      const existing = prev[num];
      if (existing?.onTrack) return prev;
      if (existing?.lane != null) return prev;
      if (existing) {
        return {
          ...prev,
          [num]: {
            ...existing,
            active: true,
            lane: null,
            onTrack: false,
            modelId: resolvedModelId || existing.modelId || null,
          },
        };
      }
      return {
        ...prev,
        [num]: { number: num, active: true, lane: null, onTrack: false, modelId: resolvedModelId },
      };
    });
  };

  const addKartAssignments = (assignments, options = {}) => {
    const silent = Boolean(options.silent);
    if (!assignments.length) {
      if (!silent) showAlert(t('admin_karts_invalid_input'));
      return;
    }

    let added = 0;
    let reactivated = 0;
    let inPits = 0;
    let onTrackCount = 0;
    let alreadyInPool = 0;
    let recategorized = 0;
    const next = { ...allKarts };

    assignments.forEach(({ num, modelId }) => {
      const key = String(num);
      const resolvedModelId = modelId && kartTypes.some((row) => row.id === modelId)
        ? modelId
        : coerceModelTypeId(modelId);
      const k = next[key];
      if (k?.onTrack) { onTrackCount += 1; return; }
      if (k?.lane != null) { inPits += 1; return; }
      if (k?.active && k.lane == null) {
        if (resolvedModelId && k.modelId !== resolvedModelId) {
          next[key] = { ...k, modelId: resolvedModelId };
          recategorized += 1;
        } else {
          alreadyInPool += 1;
        }
        return;
      }
      if (k && !k.active) {
        next[key] = {
          ...k,
          number: num,
          active: true,
          lane: null,
          onTrack: false,
          modelId: resolvedModelId || k.modelId || null,
        };
        reactivated += 1;
      } else {
        next[key] = {
          number: num,
          active: true,
          lane: null,
          onTrack: false,
          modelId: resolvedModelId,
        };
        added += 1;
      }
    });

    setAllKarts(next);

    const msgs = [];
    if (added > 0) msgs.push(t('admin_karts_added', { count: added }));
    if (recategorized > 0) msgs.push(t('admin_karts_recategorized', { count: recategorized }));
    if (reactivated > 0) msgs.push(t('admin_karts_reactivated', { count: reactivated }));
    if (inPits > 0) msgs.push(t('admin_karts_in_pits', { count: inPits }));
    if (onTrackCount > 0) msgs.push(t('admin_karts_on_track', { count: onTrackCount }));
    if (alreadyInPool > 0) msgs.push(t('admin_karts_already_pool', { count: alreadyInPool }));
    if (silent) return;
    if (msgs.length) showAlert(msgs.join('\n'));
    else showAlert(t('admin_karts_none_added'));
  };

  const addKartsFromInput = () => {
    const { assignments } = collectKartAssignments(false, kartTypes, {}, kartInput);
    addKartAssignments(assignments, { silent: showWalkthrough });
    setKartInput('');
  };

  const addKartsFromModels = (typeId) => {
    if (!typeId || typeId === 'all') return;
    const types = kartTypes.filter((row) => row.id === typeId);
    const scopedNumbers = {};
    types.forEach((row) => {
      scopedNumbers[row.id] = kartNumbersByType[row.id] || '';
    });
    const { assignments, conflicts } = collectKartAssignments(true, types, scopedNumbers, '');
    if (conflicts.length) {
      showAlert(t('admin_kart_number_conflict', { nums: conflicts.join(', ') }));
      return;
    }
    addKartAssignments(assignments, { silent: showWalkthrough });
    setKartNumbersByType((prev) => ({ ...prev, [typeId]: '' }));
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

    if (laneKey && linesData[laneKey]) {
      const targetLane = linesData[laneKey];
      const n = Number(num);
      const alreadyInLane = targetLane.karts.some((k) => Number(k) === n);
      const sameLane = fromLaneId != null && String(fromLaneId) === laneKey;
      if (targetLane.maxKarts != null && !alreadyInLane && !sameLane && targetLane.karts.length >= targetLane.maxKarts) {
        showAlert(t('admin_lane_full'));
        return;
      }
    }

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
        const sameLane = fromLaneId != null && String(fromLaneId) === laneKey && fromLaneIndex >= 0;
        if (!onTrackNow && !alreadyInLane && !inOtherLane) {
          const karts = [...targetLane.karts];
          let insertIndex = resolveLaneInsertIndex(karts, insertAt);
          if (typeof insertAt === 'number' && sameLane && fromLaneIndex < insertIndex) {
            insertIndex -= 1;
          }
          karts.splice(insertIndex, 0, n);
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

  const reorderKartInLane = async (laneId, fromIndex, toIndex) => {
    const lane = linesData[laneId];
    if (!lane?.karts?.length || fromIndex === toIndex) return;
    const karts = reorderKartsInLaneArray(lane.karts, fromIndex, toIndex);
    const updatedLines = { ...linesData, [laneId]: { ...lane, karts } };
    setLinesData(updatedLines);
    pitsLocalEditUntilRef.current = Date.now() + 2000;
    await syncPitsWithServer(updatedLines);
  };

  const handleDropOnLaneKart = (e, laneId, toIndex) => {
    e.preventDefault();
    e.stopPropagation();
    const payload = parseDragPayload(e);
    if (!payload) return;
    const fromLaneId = payload.laneId != null ? String(payload.laneId) : null;
    if (fromLaneId === String(laneId) && payload.laneIndex >= 0) {
      reorderKartInLane(laneId, payload.laneIndex, toIndex);
      return;
    }
    dropKart(payload.num, laneId, payload.laneId, payload.laneIndex, toIndex);
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
      const updated = { ...lines, [newId]: { name: `${t('admin_lane_default')} ${newId}`, active: true, karts: [], maxKarts: null, color: null } };
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

  const changeLaneMaxKarts = (laneId, value) => {
    setLinesData((lines) => {
      const n = parseInt(value, 10);
      const maxKarts = Number.isNaN(n) || n <= 0 ? null : n;
      const updated = { ...lines, [laneId]: { ...lines[laneId], maxKarts } };
      syncPitsWithServer(updated);
      return updated;
    });
  };

  const changeLaneColor = (laneId, color) => {
    setLinesData((lines) => {
      const updated = { ...lines, [laneId]: { ...lines[laneId], color: color || null } };
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

  const openProEventModal = (type = 'endurance') => {
    setProEventModalType(type === 'sprint' ? 'sprint' : 'endurance');
    setShowProEventModal(true);
  };

  const applyPlannedRaceEvent = async (eventPayload) => {
    const { prepOnly, ...eventFields } = eventPayload || {};
    const normalized = normalizePlannedRaceEvent(eventFields);
    if (!normalized?.groups?.length) {
      showAlert(t('admin_pro_event_empty_groups'));
      return;
    }
    setProEventSaving(true);
    try {
      const sessions = buildSessionsFromGroups(normalized.groups);
      const stored = {
        ...normalized,
        sessions,
        activeSessionIndex: 0,
      };
      setPlannedRaceEvent(stored);

      if (prepOnly) {
        showAlert(t('admin_pro_event_draft_saved'));
        setShowProEventModal(false);
        return;
      }

      const isEndurance = normalized.type === 'endurance';
      const activeSession = isEndurance
        ? { name: normalized.name || 'Endurance', drivers: normalized.groups.flatMap((g) => normalizeGroupDrivers(g.drivers).map((d) => d.name)) }
        : sessions[0];
      const queueGroups = isEndurance
        ? normalized.groups
        : [{ name: activeSession?.name || sessions[0]?.name || 'Heat 1', drivers: activeSession?.drivers || [] }];

      setHeatType(normalized.type);
      if (isEndurance) {
        setEnduranceHours(String(normalized.enduranceHours));
        setEnduranceMinutes(String(normalized.enduranceMinutes));
        setStartMode(normalized.startMode);
        setFormationLaps(normalized.formationLaps);
        setEnduranceRules(appendStintRulesToEnduranceRules(
          normalized.enduranceRules,
          normalized.stintMinutes,
          normalized.driverChangeSec,
        ));
        setTeamStarters(buildTeamStartersFromGroups(normalized.groups));
        setDriverQueue(groupsToDriverQueue(normalized.groups, 'endurance'));
      } else {
        setTargetLaps(String(normalized.targetLaps));
        setFormationLaps(normalized.formationLaps);
        setDriverQueue(groupsToDriverQueue(queueGroups, 'sprint'));
        setTeamStarters({});
      }

      setShowProEventModal(false);
      showAlert(isEndurance
        ? t('admin_pro_event_applied_endurance', { teams: normalized.groups.length })
        : t('admin_pro_event_applied_sprint', {
          heat: activeSession?.name || sessions[0]?.name,
          remaining: Math.max(0, sessions.length - 1),
        }));
    } finally {
      setProEventSaving(false);
    }
  };

  const loadNextSprintSession = () => {
    if (!plannedRaceEvent || plannedRaceEvent.type !== 'sprint') return;
    const sessions = plannedRaceEvent.sessions || buildSessionsFromGroups(plannedRaceEvent.groups);
    const currentIndex = plannedRaceEvent.activeSessionIndex || 0;
    const nextIndex = currentIndex + 1;
    if (nextIndex >= sessions.length) {
      showAlert(t('admin_pro_event_no_more_heats'));
      return;
    }
    const session = sessions[nextIndex];
    setPlannedRaceEvent((prev) => {
      if (!prev) return prev;
      const heatNumbers = [...(prev.heatNumbers || [])];
      if (heatNumber != null) heatNumbers[currentIndex] = heatNumber;
      return { ...prev, activeSessionIndex: nextIndex, heatNumbers };
    });
    setDriverQueue(groupsToDriverQueue([{ name: session.name, drivers: session.drivers }], 'sprint'));
    showAlert(t('admin_pro_event_loaded_heat', { name: session.name, n: nextIndex + 1 }));
  };

  const sprintHeatsRemaining = useMemo(() => {
    if (!plannedRaceEvent || plannedRaceEvent.type !== 'sprint') return 0;
    const sessions = plannedRaceEvent.sessions || buildSessionsFromGroups(plannedRaceEvent.groups);
    const idx = plannedRaceEvent.activeSessionIndex || 0;
    return Math.max(0, sessions.length - idx - 1);
  }, [plannedRaceEvent]);

  const generateNextSprintRound = async () => {
    if (!plannedRaceEvent || plannedRaceEvent.type !== 'sprint') return;
    const sessions = plannedRaceEvent.sessions || buildSessionsFromGroups(plannedRaceEvent.groups);
    const currentIndex = plannedRaceEvent.activeSessionIndex || 0;
    const heatNumbers = [...(plannedRaceEvent.heatNumbers || [])];
    if (heatNumber != null) heatNumbers[currentIndex] = heatNumber;

    if (heatNumbers.length < sessions.length || heatNumbers.some((n) => n == null)) {
      showAlert(t('admin_pro_event_generate_round_no_results'));
      return;
    }

    const resultsByHeat = {};
    for (const n of heatNumbers) {
      try {
        const res = await apiFetch(`/api/results/${n}`);
        const data = await res.json();
        if (data?.results?.length) resultsByHeat[n] = data.results;
      } catch { /* skip missing heat results */ }
    }

    const nextRound = (plannedRaceEvent.round || 1) + 1;
    const roundName = t(sprintRoundLabelKey(nextRound), { round: nextRound });
    const groups = buildAdvancementGroups(sessions, heatNumbers, resultsByHeat, plannedRaceEvent.advanceCount, roundName);
    if (!groups.length) {
      showAlert(t('admin_pro_event_generate_round_no_results'));
      return;
    }

    const newSessions = buildSessionsFromGroups(groups);
    setPlannedRaceEvent((prev) => (prev ? {
      ...prev,
      groups,
      groupsText: serializeGroupsText(groups),
      sessions: newSessions,
      activeSessionIndex: 0,
      round: nextRound,
      heatNumbers: [],
      roundHistory: [...(prev.roundHistory || []), heatNumbers],
    } : prev));
    setDriverQueue(groupsToDriverQueue([{ name: newSessions[0].name, drivers: newSessions[0].drivers }], 'sprint'));
    showAlert(t('admin_pro_event_round_generated', { round: roundName, drivers: groups[0].drivers.length }));
  };

  const addDriverToQueue = () => {
    if (!canAddDriver) { showAlert(t('admin_alert_name_required')); return; }
    const team = heatType === 'endurance' ? (drTeam.trim() || null) : null;
    if (isBulkDrivers) {
      if (heatType === 'endurance') {
        // Support "Avi(80)*, Baruch(70), Kobi(65)" - per-driver weight in kg
        // and a "*" marker for the team's starting driver.
        const parsed = parseDriversLine(drName);
        setDriverQueue((q) => [...q, ...parsed.map((d) => ({
          name: d.name, team, phone: null, email: null, level: null, saved: false,
          weightKg: d.weightKg,
        }))]);
        if (team) {
          const starter = parsed.find((d) => d.starter) || parsed[0];
          if (starter) setTeamStarters((prev) => ({ ...prev, [team]: starter.name }));
        }
        setDrName('');
        return;
      }
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

  const applySessionPayload = useCallback((data) => {
    const trackNums = (data.onTrack || []).map((k) => Number(k.kart_number ?? k.kart));
    if (data.pitLines) {
      const lines = sanitizePitLines(normalizeLinesData(data.pitLines));
      setLinesData(lines);
      setAllKarts((prev) => reconcileKartsFromLines(prev, lines, trackNums));
    }
    if (data.onTrack) setOnTrack(data.onTrack);
    if (data.heatClock) setHeatClock(data.heatClock);
  }, []);

  const runFinishHeat = useCallback(async (isAuto = false, startedAtOverride = null, settingsOverride = null) => {
    let doCsv = exportCsv;
    let doPdf = exportPdf;
    let finishHeatType = heatType;
    let finishStartedAt = startedAtOverride ?? heatClock.startedAt;

    if (settingsOverride) {
      if (typeof settingsOverride.exportCsv === 'boolean') doCsv = settingsOverride.exportCsv;
      else if (isAuto) doCsv = settingsOverride.exportCsv !== false;
      if (typeof settingsOverride.exportPdf === 'boolean') doPdf = settingsOverride.exportPdf;
      else if (isAuto) doPdf = Boolean(settingsOverride.exportPdf);
      if (settingsOverride.type) finishHeatType = settingsOverride.type;
      if (settingsOverride.startedAt != null) finishStartedAt = settingsOverride.startedAt;
    }

    const ackAutoExport = async () => {
      const ackRes = await apiFetch('/api/admin/auto-export-ack', { method: 'POST' }, trackSlug);
      const ackData = ackRes.ok ? await ackRes.json() : null;
      if (ackData?.pitLines) applySessionPayload(ackData);
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
        const finishRes = await apiFetch('/api/admin/finish-heat', { method: 'POST' }, trackSlug);
        if (finishRes.ok) {
          const finishData = await finishRes.json();
          if (finishData?.pitLines) applySessionPayload(finishData);
        }
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
        try {
          await ackAutoExport();
        } catch { /* drain is best-effort after manual export */ }
        showAlert(t('admin_finish_done'));
        setHeatDriverCount(0);
        setAssignedHeatKarts(new Set());
        setHeatClock((c) => ({ ...c, running: false, startedAt: null }));
      }
    } catch (err) {
      if (isAuto) {
        console.error('Auto export failed', err);
        showAlert(t('admin_alert_server_error'));
      } else {
        showAlert(t('admin_alert_server_error'));
      }
    }
  }, [exportCsv, exportPdf, heatType, heatClock.startedAt, trackSlug, t, applySessionPayload]);

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
          if (s.pitLines) {
            const lines = sanitizePitLines(normalizeLinesData(s.pitLines));
            const serverCount = countAllPitKarts(lines);
            const localCount = countAllPitKarts(linesDataRef.current);
            const pitsReturnedAfterSession = serverCount > 0
              && (s.onTrack || []).length === 0
              && localCount === 0;
            if (Date.now() > pitsLocalEditUntilRef.current || serverCount > localCount || pitsReturnedAfterSession) {
              setLinesData(lines);
              setAllKarts((prev) => reconcileKartsFromLines(
                prev,
                lines,
                (s.onTrack || []).map((k) => k.kart_number),
              ));
            }
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
              exportCsv: hs.exportCsv !== false,
              exportPdf: Boolean(hs.exportPdf),
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
    let baseLines = JSON.parse(JSON.stringify(linesData));
    let trackForAssign = onTrack;
    try {
      const sessionRes = await apiFetch('/api/admin/session-state', {}, trackSlug);
      if (sessionRes.ok) {
        const s = await sessionRes.json();
        if (s.pitLines) {
          baseLines = sanitizePitLines(normalizeLinesData(s.pitLines));
          trackForAssign = s.onTrack || [];
          setLinesData(baseLines);
          setOnTrack(trackForAssign);
          setAllKarts((prev) => reconcileKartsFromLines(
            prev,
            baseLines,
            trackForAssign.map((k) => k.kart_number),
          ));
        }
      }
    } catch { /* use local pit snapshot */ }
    const laneKeys = Object.keys(baseLines).filter((id) => baseLines[id].active);
    if (laneKeys.length === 0) { showAlert(t('admin_alert_no_lanes')); return; }
    const workingLines = JSON.parse(JSON.stringify(baseLines));
    const isEndurance = heatType === 'endurance';
    const teams = isEndurance ? groupQueueByTeam(driverQueue) : null;
    const assignCount = isEndurance ? teams.length : driverQueue.length;
    const overlapMode = onTrack.length > 0 && (heatClock.draining || heatClock.cooldownPhase);
    const sessionRunning = Boolean(
      heatClock.startedAt && heatClock.running && !heatClock.cooldownPhase && !heatClock.draining,
    );
    const canUseTrackPool = overlapMode || sessionRunning;
    const { assigned: kartSlots, complete } = pickKartsForAssignment(workingLines, laneKeys, assignCount, {
      onTrackKarts: canUseTrackPool ? trackForAssign : [],
      pendingOnTrackSlots: canUseTrackPool,
    });
    if (!complete) { showAlert(t('admin_alert_not_enough_karts')); return; }

    reorderAssignedKartsToPitFront(workingLines, kartSlots);

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
      const slot = kartSlots[i];
      const driverLabel = isEndurance
        ? assign.teamDrivers.join(' · ')
        : assign.driver.name;
      return {
        kart_number: slot.pendingFromTrack ? null : slot.kart,
        kart_pending: Boolean(slot.pendingFromTrack),
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

      const heatKarts = new Set(
        kartSlots.filter((s) => s.kart != null).map((s) => Number(s.kart)),
      );
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
      if (data.pitLines) {
        applySessionPayload(data);
      } else {
        setLinesData(workingLines);
        setAllKarts((prev) => reconcileKartsFromLines(
          prev,
          workingLines,
          (data.onTrack || []).map((k) => k.kart_number),
        ));
        syncPitsWithServer(workingLines);
      }
    } catch {
      showAlert(t('admin_alert_server_error'));
    }
  };

  const handleWalkthroughComplete = useCallback((payload = {}) => {
    setShowWalkthrough(false);
    setShowLivePreview(false);
    setShowTrackPlannerModal(false);
    setNeedsOnboarding(false);
    if (payload.hasPassword) setHasPassword(true);
  }, []);

  const handleWalkthroughStep = useCallback((stepId) => {
    if (stepId !== 'preview') setShowLivePreview(false);
    if (stepId !== 'planner') setShowTrackPlannerModal(false);
  }, []);

  const toggleAdminTheme = useCallback(() => {
    setAdminTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(ADMIN_THEME_KEY, next);
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const applyTrackPlanner = async () => {
    const duration = Math.max(1, Number(sessionDurationPlan) || 10);
    setPlannerSaving(true);
    try {
      setHeatDuration(duration);
      if (heatType !== 'time') setHeatType('time');
      const profileBody = {
        trackDisplayName,
        openingTime,
        closingTime,
        sessionDurationMin: duration,
          competitiveBlockMin: Number(competitiveBlockMin) || 45,
          turnoverMin: Number(turnoverMin) || 0,
          avgDriversPerSession: Math.max(1, Number(avgDriversPerSession) || 8),
          pricePerSession: Number(pricePerSession) || 0,
          multipleKartTypes,
          kartTypes: multipleKartTypes ? normalizeKartTypes(kartTypes) : [],
      };
      const heatBody = {
        type: 'time',
        duration,
        targetLaps: parseInt(targetLaps, 10) || 0,
        formationLaps: parseInt(formationLaps, 10) || 0,
        startMode,
        exportCsv,
        exportPdf,
        timingColumns,
        timingColumnOrder,
        enduranceRules: '',
      };
      const [profileRes, heatRes] = await Promise.all([
        apiFetch('/api/admin/track-profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(profileBody),
        }, trackSlug),
        apiFetch('/api/admin/heat-settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(heatBody),
        }, trackSlug),
      ]);
      if (!profileRes.ok || !heatRes.ok) {
        showAlert(t('admin_alert_server_error'));
        return;
      }
      setShowTrackPlannerModal(false);
      showAlert(t('admin_track_planner_saved', { duration }));
    } catch {
      showAlert(t('admin_alert_server_error'));
    } finally {
      setPlannerSaving(false);
    }
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
          <LaneKartSlot
            laneId={laneId}
            laneIndex={0}
            onReorder={reorderKartInLane}
            onDropOnSlot={handleDropOnLaneKart}
          >
            <KartCard
              key={`${laneId}-exit-${exitKart}-0`}
              num={exitKart}
              kart={allKarts[exitKart]}
              {...kartModelProps(allKarts[exitKart])}
              draggable
              variant="exiting"
              laneId={laneId}
              laneIndex={0}
              transponderActive={transponderReady}
            />
          </LaneKartSlot>
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
            <LaneKartSlot
              key={`${laneId}-w-slot-${laneIndex}-${num}`}
              laneId={laneId}
              laneIndex={laneIndex}
              onReorder={reorderKartInLane}
              onDropOnSlot={handleDropOnLaneKart}
            >
              <KartCard
                num={num}
                kart={kart}
                {...kartModelProps(kart)}
                draggable
                variant="waiting"
                laneId={laneId}
                laneIndex={laneIndex}
              />
            </LaneKartSlot>
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
    <div className={`admin-dashboard admin-no-scroll${adminTheme === 'dark' ? ' admin-theme-dark' : ''}`}>
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
      {showLivePreview && (
        <LivePreviewFloat
          trackSlug={trackSlug}
          heatType={heatType}
          timingColumns={timingColumns}
          onToggleTimingColumn={(colId) => setTimingColumns((prev) => ({ ...prev, [colId]: !prev[colId] }))}
          onClose={() => setShowLivePreview(false)}
          tourElevated={showWalkthrough}
        />
      )}
      {showWalkthrough && (
        <AdminWalkthrough
          trackSlug={trackSlug}
          isFirstRun={needsOnboarding}
          activePanels={{ preview: showLivePreview, planner: showTrackPlannerModal }}
          onStepChange={handleWalkthroughStep}
          onComplete={handleWalkthroughComplete}
        />
      )}
      {showTrackPlannerModal && (
        <TrackPlannerModal
          onClose={() => setShowTrackPlannerModal(false)}
          tourElevated={showWalkthrough}
          darkMode={adminTheme === 'dark'}
          t={t}
          trackDisplayName={trackDisplayName}
          setTrackDisplayName={setTrackDisplayName}
          openingTime={openingTime}
          setOpeningTime={setOpeningTime}
          closingTime={closingTime}
          setClosingTime={setClosingTime}
          sessionDurationPlan={sessionDurationPlan}
          setSessionDurationPlan={setSessionDurationPlan}
          turnoverMin={turnoverMin}
          setTurnoverMin={setTurnoverMin}
          competitiveBlockMin={competitiveBlockMin}
          setCompetitiveBlockMin={setCompetitiveBlockMin}
          avgDriversPerSession={avgDriversPerSession}
          setAvgDriversPerSession={setAvgDriversPerSession}
          pricePerSession={pricePerSession}
          setPricePerSession={setPricePerSession}
          competitiveHeatsPlanned={competitiveHeatsPlanned}
          setCompetitiveHeatsPlanned={setCompetitiveHeatsPlanned}
          dayPlan={dayPlan}
          onSave={applyTrackPlanner}
          isSaving={plannerSaving}
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
      {showProEventModal && (
        <ProRaceEventModal
          onClose={() => setShowProEventModal(false)}
          darkMode={adminTheme === 'dark'}
          t={t}
          initialType={proEventModalType}
          prepOnly={heatType === 'time'}
          draft={plannedRaceEvent}
          onApply={applyPlannedRaceEvent}
          isSaving={proEventSaving}
          trackSlug={trackSlug}
        />
      )}
      {showChampionshipModal && (
        <ChampionshipModal
          onClose={() => setShowChampionshipModal(false)}
          t={t}
          trackSlug={trackSlug}
          darkMode={adminTheme === 'dark'}
        />
      )}

      <header className="admin-header">
        <div className="admin-header-brand">
          <HakafastLogo to="/" className="admin-header-logo" />
          <h1>{t('admin_main_title')}</h1>
        </div>
        <div className="admin-header-actions">
          {isolated && (
            <span className="demo-workspace-badge" title={getWorkspaceLabel(trackSlug)}>
              {t('demo_workspace_badge', { id: getWorkspaceLabel(trackSlug) })}
            </span>
          )}
          <button
            type="button"
            className="admin-theme-toggle"
            onClick={toggleAdminTheme}
            title={t('live_theme_toggle')}
            aria-pressed={adminTheme === 'dark'}
          >
            {adminTheme === 'dark' ? '☀️' : '🌙'}
          </button>
          <button
            type="button"
            className="admin-tour-restart"
            onClick={() => setShowWalkthrough(true)}
            title={t('admin_tour_restart')}
          >
            🚀 {t('admin_tour_restart')}
          </button>
          <LanguageSwitcher className="admin-header-lang" />
        </div>
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
          <div className="inventory-pits-panel" data-tour="inventory-pits-flow">
            <div className="warehouse-zone" data-tour="warehouse">
              <div className="warehouse-zone-head">
                <h2>{t('admin_warehouse')}</h2>
                <span className="warehouse-kart-count">{poolKarts.length}</span>
              </div>
              <div className="security-toggle-row kart-types-toggle-row">
                <span className="field-label">{t('admin_multiple_kart_types')}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={multipleKartTypes}
                  className={`hf-toggle${multipleKartTypes ? ' is-on' : ''}`}
                  onClick={() => {
                    setMultipleKartTypes((on) => {
                      const next = !on;
                      if (next && kartTypes.length < 2) {
                        const seeded = DEFAULT_KART_TYPE_PRESETS.map((row) => ({ ...row }));
                        setKartTypes(seeded);
                        setSelectedKartTypeId(seeded[0]?.id || '');
                      }
                      if (!next) setKartNumbersByType({});
                      return next;
                    });
                  }}
                >
                  <span className="hf-toggle-knob" />
                </button>
              </div>
              {multipleKartTypes && kartTypes.length > 0 ? (
                <div className="warehouse-numbers-zone" data-tour="warehouse-numbers">
                  <KartTypesEditor
                  t={t}
                  compact
                  showNumbers
                  types={kartTypes}
                  numbersByType={kartNumbersByType}
                  onNumbersChange={(typeId, value) => {
                    setKartNumbersByType((prev) => ({ ...prev, [typeId]: value }));
                  }}
                  onAddModel={addKartsFromModels}
                  onChange={(next) => {
                    const normalized = normalizeKartTypes(next);
                    setKartTypes(normalized);
                    if (!normalized.some((row) => row.id === selectedKartTypeId)) {
                      setSelectedKartTypeId(normalized[0]?.id || '');
                    }
                    if (normalized.length < 2) {
                      setMultipleKartTypes(false);
                      setKartNumbersByType({});
                    }
                  }}
                />
                </div>
              ) : (
                <div className="warehouse-numbers-zone warehouse-numbers-zone-single" data-tour="warehouse-single-numbers">
                  <label className="warehouse-numbers-field-label" htmlFor="warehouse-kart-numbers-input">
                    {t('admin_kart_numbers_general_label')}
                  </label>
                <div className="input-group kart-add-row">
                  <input
                    id="warehouse-kart-numbers-input"
                    type="text"
                    value={kartInput}
                    onChange={(e) => setKartInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addKartsFromInput(); } }}
                    placeholder={t('admin_kart_input_placeholder')}
                  />
                  <button type="button" onClick={addKartsFromInput}>{t('admin_add_inventory')}</button>
                </div>
                </div>
              )}
              <div className="warehouse-pool-section" data-tour="warehouse-pool">
              <div className="warehouse-pool-label">{t('admin_warehouse_pool')}</div>
              <div
                className={`kart-pool warehouse-kart-pool${dragOverPool ? ' drag-over' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setDragOverPool(true); }}
                onDragLeave={() => setDragOverPool(false)}
                onDrop={handleDropToPool}
              >
                {poolKarts.map((num) => (
                  <KartCard
                    key={num}
                    num={num}
                    kart={allKarts[num]}
                    {...kartModelProps(allKarts[num])}
                    onToggle={toggleKartActive}
                    draggable
                    variant="pool"
                    showToggle
                  />
                ))}
              </div>
              </div>
            </div>
            <div className="inventory-pits-connector" aria-hidden>
              <span className="inventory-pits-connector-arrow">←</span>
            </div>
            <div className="pits-zone" data-tour="pits">
              <div className="panel-head-row">
                <h2>{t('admin_pits_title')}</h2>
                <button type="button" className="btn-purple" onClick={addNewLane}>{t('admin_add_lane')}</button>
              </div>
              <p className="lane-reorder-hint">{t('admin_lane_kart_reorder_hint')}</p>
              <div className="pit-lanes-board">
                {Object.keys(linesData).map((laneId) => {
                  const lane = linesData[laneId];
                  const exitKart = getExitKartNumber(lane);
                  const waitingKarts = getWaitingKartNumbers(lane);
                  const exitAtBottom = pitExitPosition !== 'top';
                  const laneFull = lane.maxKarts != null && (lane.karts?.length || 0) >= lane.maxKarts;
                  return (
                    <div
                      key={laneId}
                      className={`lane lane-flow-${exitAtBottom ? 'bottom' : 'top'}${!lane.active ? ' disabled-lane' : ''}${dragOverLane === laneId ? ' drag-over' : ''}${laneFull ? ' lane-full' : ''}`}
                      style={lane.color ? { borderColor: lane.color } : undefined}
                      onDragOver={(e) => { e.preventDefault(); setDragOverLane(laneId); }}
                      onDragLeave={() => setDragOverLane(null)}
                      onDrop={(e) => handleDropToLane(e, laneId, 'append')}
                    >
                      <input type="text" className="lane-header-input" value={lane.name} onChange={(e) => changeLaneName(laneId, e.target.value)} />
                      <div className="lane-meta-row">
                        <label className="lane-color-picker" title={t('admin_lane_color')}>
                          <input
                            type="color"
                            value={lane.color || '#cbd5e0'}
                            onChange={(e) => changeLaneColor(laneId, e.target.value)}
                          />
                        </label>
                        <label className="lane-max-karts">
                          {t('admin_lane_max_karts')}
                          <input
                            type="number"
                            min="0"
                            placeholder="∞"
                            value={lane.maxKarts ?? ''}
                            onChange={(e) => changeLaneMaxKarts(laneId, e.target.value)}
                          />
                        </label>
                        {lane.maxKarts != null && (
                          <span className={`lane-capacity-badge${laneFull ? ' is-full' : ''}`}>
                            {lane.karts?.length || 0}/{lane.maxKarts}
                          </span>
                        )}
                      </div>
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
              <div className={`on-track-strip on-track-flow-${pitExitPosition === 'top' ? 'top' : 'bottom'}`}>
                <div className="on-track-strip-header">
                  <span className="on-track-strip-title">{t('admin_on_track')}</span>
                  <span className="on-track-strip-badge">{onTrack.length}</span>
                </div>
                <div className="on-track-strip-track">
                  <div className="on-track-strip-line" aria-hidden />
                  {onTrack.length === 0 ? (
                    <p className="on-track-strip-empty">{t('admin_on_track_empty')}</p>
                  ) : (
                    (() => {
                      const pitEntryOrder = orderOnTrackKartsForPitEntry(onTrack);
                      const byKart = new Map(onTrack.map((ot) => [Number(ot.kart_number), ot]));
                      const ordered = pitEntryOrder
                        .map((n) => byKart.get(n))
                        .filter(Boolean);
                      onTrack.forEach((ot) => {
                        if (!pitEntryOrder.includes(Number(ot.kart_number))) ordered.push(ot);
                      });
                      return ordered;
                    })().map((ot) => {
                        const kart = allKarts[ot.kart_number] || allKarts[String(ot.kart_number)];
                        return (
                          <div
                            key={ot.kart_number}
                            className="on-track-kart-wrap"
                            title={t('admin_on_track_simulate_lap')}
                            onClick={() => simulateTransponderLap(ot.kart_number)}
                            onDoubleClick={() => returnKartFromTrack(ot.kart_number, ot.laneId || ot.originLaneId)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') simulateTransponderLap(ot.kart_number);
                            }}
                            role="button"
                            tabIndex={0}
                          >
                            {kart ? (
                              <KartCard
                                num={ot.kart_number}
                                kart={kart}
                                {...kartModelProps(kart)}
                                variant="ontrack"
                                draggable={false}
                              />
                            ) : (
                              <span className="on-track-num">{ot.kart_number}</span>
                            )}
                          </div>
                        );
                      })
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="admin-drivers-column">
          <div className="driver-column driver-column-main" data-tour="drivers">
            <div className="heat-session-combo">
              <div className="heat-type-bar heat-type-bar-embedded" data-tour="heat-settings">
                <label className="field-label">{t('admin_heat_settings')}</label>
                <select value={heatType} onChange={(e) => setHeatType(e.target.value)}>
                  <option value="time">{t('heat_time')}</option>
                  <option value="endurance">{t('heat_endurance')}</option>
                  <option value="sprint">{t('heat_sprint')}</option>
                </select>
                <p className="heat-mode-hint">
                  {heatType === 'time' ? t('admin_heat_mode_session') : t('admin_heat_mode_competitive')}
                </p>
                {plannedRaceEvent?.name && heatType === 'time' && (
                  <p className="pro-event-draft-badge">
                    {t('admin_pro_event_draft_ready', { name: plannedRaceEvent.name, type: t(plannedRaceEvent.type === 'sprint' ? 'heat_sprint' : 'heat_endurance') })}
                  </p>
                )}
                {heatType === 'time' && (
                  <>
                    <span className="duration-unit-label">{t('admin_duration_unit')}</span>
                    <div className="duration-presets duration-presets-compact">
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
                  <div className="heat-competitive-grid">
                    <label className="heat-compact-field">
                      <span>{t('admin_hours_placeholder')}</span>
                      <input type="number" min="0" value={enduranceHours} onChange={(e) => setEnduranceHours(e.target.value)} />
                    </label>
                    <label className="heat-compact-field">
                      <span>{t('admin_minutes_placeholder')}</span>
                      <input type="number" min="0" max="59" value={enduranceMinutes} onChange={(e) => setEnduranceMinutes(e.target.value)} />
                    </label>
                    <label className="heat-compact-field">
                      <span>{t('admin_formation_laps')}</span>
                      <input type="number" min="0" max="5" value={formationLaps} onChange={(e) => setFormationLaps(e.target.value)} />
                    </label>
                    <label className="heat-compact-field heat-compact-field-grow">
                      <span>{t('admin_start_mode')}</span>
                      <select value={startMode} onChange={(e) => setStartMode(e.target.value)}>
                        <option value="grid">{t('admin_start_grid')}</option>
                        <option value="le_mans">{t('admin_start_le_mans')}</option>
                      </select>
                    </label>
                  </div>
                )}
                {heatType === 'sprint' && (
                  <div className="heat-competitive-grid heat-competitive-grid-sprint">
                    <label className="heat-compact-field heat-compact-field-grow">
                      <span>{t('admin_laps_placeholder')}</span>
                      <input type="number" min="1" value={targetLaps} onChange={(e) => setTargetLaps(e.target.value)} />
                    </label>
                    <label className="heat-compact-field">
                      <span>{t('admin_formation_laps')}</span>
                      <input type="number" min="0" max="5" value={formationLaps} onChange={(e) => setFormationLaps(e.target.value)} />
                    </label>
                  </div>
                )}
                {heatType === 'endurance' && startMode === 'le_mans' && (
                  <div className="le-mans-panel le-mans-panel-embedded">
                    <button type="button" className="btn-muted" onClick={deployAllGridKarts}>
                      {t('admin_le_mans_deploy_all')}
                    </button>
                  </div>
                )}
              </div>

              <div className="heat-session-drivers" data-tour="driver-register">
                <h2>{t('admin_register_title')}</h2>
                <div className="section-box">
                  <label>{t('admin_req_label')}</label>
                  <input
                    type="text"
                    dir="auto"
                    value={drName}
                    onChange={(e) => setDrName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && canAddDriver) { e.preventDefault(); addDriverToQueue(); } }}
                    placeholder={t('admin_driver_placeholder_bulk')}
                  />
                  {isBulkDrivers && <p className="bulk-hint">{t('admin_bulk_names_hint')} ({driverNames.length})</p>}
                  {heatType === 'endurance' && (
                    <>
                      <input
                        type="text"
                        dir="auto"
                        value={drTeam}
                        onChange={(e) => setDrTeam(e.target.value)}
                        placeholder={t('admin_team_placeholder')}
                      />
                      <button
                        type="button"
                        className="btn-muted btn-pro-event-inline"
                        onClick={() => openProEventModal('endurance')}
                      >
                        {t('admin_pro_event_open_endurance')}
                      </button>
                      <p className="pro-event-inline-hint">{t('admin_pro_event_endurance_hint')}</p>
                    </>
                  )}
                  {heatType === 'sprint' && (
                    <>
                      <button
                        type="button"
                        className="btn-muted btn-pro-event-inline"
                        onClick={() => openProEventModal('sprint')}
                      >
                        {t('admin_pro_event_open_sprint')}
                      </button>
                      <p className="pro-event-inline-hint">{t('admin_pro_event_sprint_hint')}</p>
                    </>
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
              </div>
            </div>

            <h3 className="queue-heading">
              {heatType === 'endurance' ? t('admin_queue_title_endurance') : t('admin_queue_title')}
            </h3>
            <ul className="queue-list queue-list-tall">
              {heatType === 'endurance' ? (
                enduranceQueueTeams.length === 0 ? (
                  <li className="queue-empty">{t('admin_queue_empty')}</li>
                ) : enduranceQueueTeams.map((team, i) => {
                  const starterName = teamStarters[team.teamName] || team.drivers[0]?.name;
                  return (
                    <li key={team.teamName} className="queue-item queue-item-team">
                      <span className="queue-pos">{i + 1}</span>
                      <div className="queue-team-block">
                        <strong className="queue-team-name">{team.teamName}</strong>
                        <span className="queue-team-drivers">
                          {team.drivers.map((d, di) => (
                            <span key={`${d.name}-${di}`} className="queue-driver-chip">
                              {formatEnduranceQueueDriver(d, starterName === d.name)}
                              {di < team.drivers.length - 1 ? ', ' : ''}
                            </span>
                          ))}
                        </span>
                        <label className="queue-starter-pick">
                          <span className="queue-starter-label">{t('admin_endurance_starter_short')}</span>
                          <select
                            value={starterName || ''}
                            onChange={(e) => setTeamStarters((prev) => ({
                              ...prev,
                              [team.teamName]: e.target.value,
                            }))}
                          >
                            {team.drivers.map((d) => (
                              <option key={d.name} value={d.name}>{d.name}</option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <button
                        type="button"
                        className="btn-remove"
                        onClick={() => setDriverQueue((q) => removeTeamFromQueue(q, team.teamName))}
                      >
                        X
                      </button>
                    </li>
                  );
                })
              ) : driverQueue.length === 0 ? (
                <li className="queue-empty">{t('admin_queue_empty')}</li>
              ) : driverQueue.map((d, i) => (
                <li key={`${d.name}-${i}`} className={`queue-item${d.saved ? ' queue-item-saved' : ''}`}>
                  <span className="queue-pos">{i + 1}</span>
                  <span className="queue-name">
                    {d.saved && <span className="saved-badge">★</span>}
                    {d.name}{d.level ? ` (${levelLabel(d.level)})` : ''}
                  </span>
                  <button type="button" className="btn-remove" onClick={() => setDriverQueue((q) => q.filter((_, idx) => idx !== i))}>X</button>
                </li>
              ))}
            </ul>
            <button type="button" className="btn-execute" data-tour="execute" onClick={executeAutoAssignment}>{t('admin_btn_execute')} 🚀</button>
          </div>
        </section>

        <aside className="admin-sidebar">
          <div className="admin-sidebar-actions">
            <button
              type="button"
              className="btn-preview"
              data-tour="preview-trigger"
              onClick={() => setShowLivePreview((open) => !open)}
            >
              {showLivePreview ? t('admin_preview_close') : t('admin_preview')}
            </button>
            <button
              type="button"
              className="btn-muted btn-sidebar-tool"
              data-tour="planner-trigger"
              onClick={() => setShowTrackPlannerModal(true)}
            >
              {t('admin_track_planner')}
            </button>
            {heatType === 'time' && (
              <button
                type="button"
                className="btn-muted btn-sidebar-tool"
                data-tour="pro-event"
                onClick={() => openProEventModal(plannedRaceEvent?.type || 'endurance')}
              >
                {t('admin_pro_event_prep_day')}
              </button>
            )}
            {heatType === 'endurance' && (
              <>
                <button type="button" className="btn-muted btn-sidebar-tool" onClick={() => openProEventModal('endurance')}>
                  {t('admin_pro_event_plan_endurance')}
                </button>
                <button type="button" className="btn-muted btn-sidebar-tool" onClick={() => setShowEnduranceModal(true)}>
                  {t('admin_open_endurance_tools')}
                </button>
              </>
            )}
            {heatType === 'sprint' && (
              <button type="button" className="btn-muted btn-sidebar-tool" onClick={() => openProEventModal('sprint')}>
                {t('admin_pro_event_plan_sprint')}
              </button>
            )}
            {heatType === 'sprint' && sprintHeatsRemaining > 0 && (
              <button type="button" className="btn-muted btn-sidebar-tool" onClick={loadNextSprintSession}>
                {t('admin_pro_event_next_heat', { n: sprintHeatsRemaining })}
              </button>
            )}
            {heatType === 'sprint' && sprintHeatsRemaining === 0
              && plannedRaceEvent?.type === 'sprint'
              && (plannedRaceEvent?.sessions?.length || 0) > 1
              && heatNumber != null && (
              <button type="button" className="btn-muted btn-sidebar-tool" onClick={generateNextSprintRound}>
                {t('admin_pro_event_generate_next_round')}
              </button>
            )}
            <button
              type="button"
              className="btn-muted btn-sidebar-tool btn-sidebar-championship"
              onClick={() => setShowChampionshipModal(true)}
            >
              🏆 {t('admin_championship')}
            </button>
          </div>

          <div className="heat-clock-bar">
            <span className="field-label">{t('admin_heat_timer')}</span>
            <span className={`heat-clock-value${getHeatClockClassName(displayHeatClock)}`}>
              {formatHeatClock(displayHeatClock, t('admin_heat_not_started'), '00:00', {
                lastLap: t('live_race_last_lap'),
                checkered: '🏁',
                formation: t('live_race_formation'),
              })}
            </span>
            {heatNumber ? (
              <span className="admin-heat-number">{t('live_heat_number', { n: heatNumber })}</span>
            ) : null}
          </div>

          <div className="timing-columns-bar">
            <TimingColumnsPicker
              t={t}
              heatType={heatType}
              timingColumns={timingColumns}
              onToggleColumn={(colId) => setTimingColumns((prev) => ({ ...prev, [colId]: !prev[colId] }))}
            />
            {reorderableColumns.length > 0 && (
              <div className="timing-column-order">
                <span className="field-label">{t('admin_timing_column_order')}</span>
                <p className="timing-columns-intro">{t('admin_timing_column_order_fixed')}</p>
                <TimingColumnOrderList
                  columns={reorderableColumns}
                  onReorder={handleTimingColumnReorder}
                  dragHint={t('admin_timing_column_drag_hint')}
                  getLabel={(col) => t(col.labelKey)}
                />
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
