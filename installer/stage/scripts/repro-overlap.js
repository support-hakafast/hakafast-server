/**
 * Reproduce the overlap/cooldown/transponder flow against the running HTTP API,
 * mirroring AdminPanel's executeAutoAssignment (pickKartsForAssignment +
 * reorderAssignedKartsToPitFront) so kart numbers are populated correctly.
 * Run: node scripts/repro-overlap.js  (server must be running on :5000)
 */
const BASE = 'http://localhost:5000';
const WS = 'repro-' + Date.now();
const HEADERS = { 'Content-Type': 'application/json', 'x-hf-track': 'kart-demo', 'x-hf-workspace': WS };

async function call(path, opts = {}) {
  const res = await fetch(BASE + path, { headers: HEADERS, ...opts });
  return res.json();
}

async function post(path, body) {
  return call(path, { method: 'POST', body: JSON.stringify(body) });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- Inlined ports of src/utils/adminHelpers.js pickKartsForAssignment / reorderAssignedKartsToPitFront ---
function orderOnTrackKartsForPitEntry(onTrackKarts) {
  return (onTrackKarts || [])
    .slice()
    .sort((a, b) => (a.lap_count || 0) - (b.lap_count || 0))
    .map((k) => Number(k.kart_number));
}

function countPitKartsInLines(workingLines, laneKeys) {
  return laneKeys.reduce((sum, key) => sum + (workingLines[key]?.karts?.length || 0), 0);
}

function pickKartsForAssignment(workingLines, laneKeys, driverCount, options = {}) {
  const usePendingTrackSlots = Boolean(options.pendingOnTrackSlots);
  const onTrackOrdered = orderOnTrackKartsForPitEntry(options.onTrackKarts || []);
  const pitKartTotal = countPitKartsInLines(workingLines, laneKeys);

  if (pitKartTotal + onTrackOrdered.length < driverCount) {
    return { assigned: [], complete: false };
  }

  const used = new Set();
  const assigned = [];
  let laneCursor = 0;
  const maxDepth = Math.max(0, ...laneKeys.map((k) => workingLines[k]?.karts?.length || 0));

  for (let i = 0; i < driverCount; i += 1) {
    let found = null;

    for (let depth = 0; depth < maxDepth && !found; depth += 1) {
      for (let offset = 0; offset < laneKeys.length; offset += 1) {
        const key = laneKeys[(laneCursor + offset) % laneKeys.length];
        const kart = workingLines[key]?.karts?.[depth];
        const kartNum = Number(kart);
        if (kart != null && !Number.isNaN(kartNum) && !used.has(kartNum)) {
          found = { kart: kartNum, lane: key, depth, source: 'pit' };
          laneCursor = (laneCursor + offset + 1) % laneKeys.length;
          break;
        }
      }
    }

    if (!found) {
      if (usePendingTrackSlots) {
        const pendingAlready = assigned.filter((a) => a.pendingFromTrack).length;
        if (pendingAlready < onTrackOrdered.length) {
          found = { kart: null, lane: null, depth: -1, source: 'on_track_pending', pendingFromTrack: true };
        }
      } else {
        const trackKart = onTrackOrdered.find((n) => !used.has(n));
        if (trackKart != null) {
          found = { kart: trackKart, lane: null, depth: -1, source: 'on_track' };
        }
      }
    }

    if (!found) return { assigned, complete: false };
    if (found.kart != null) used.add(found.kart);
    assigned.push({ ...found, driverIndex: i });
  }
  return { assigned, complete: true };
}

function reorderAssignedKartsToPitFront(workingLines, assignedSlots) {
  if (!workingLines || !assignedSlots?.length) return workingLines;
  const byLane = {};
  assignedSlots.forEach((slot, i) => {
    if (slot.kart == null || slot.lane == null) return;
    const laneId = String(slot.lane);
    if (!byLane[laneId]) byLane[laneId] = [];
    byLane[laneId].push({ kart: Number(slot.kart), order: slot.driverIndex ?? i });
  });
  Object.entries(byLane).forEach(([laneId, entries]) => {
    const lane = workingLines[laneId];
    if (!lane) return;
    const ordered = entries.sort((a, b) => a.order - b.order).map((e) => e.kart);
    const orderedSet = new Set(ordered);
    const rest = (lane.karts || []).filter((k) => !orderedSet.has(Number(k)));
    lane.karts = [...ordered, ...rest];
  });
  return workingLines;
}

function buildAssignmentPayload(kartSlots, driverNames) {
  return kartSlots.map((slot, i) => ({
    kart_number: slot.pendingFromTrack ? null : slot.kart,
    kart_pending: Boolean(slot.pendingFromTrack),
    driver_name: driverNames[i],
    team_name: null,
    team_drivers: null,
    registered: false,
    assignment_order: i + 1,
  }));
}

async function main() {
  console.log('Workspace:', WS);

  // Seed: 7 karts total, lane1=[1,2,3,4], lane2=[5,6,7]
  const seededPitLines = {
    1: { name: 'טור 1', active: true, karts: [1, 2, 3, 4] },
    2: { name: 'טור 2', active: true, karts: [5, 6, 7] },
  };
  const laneKeys = ['1', '2'];

  // 1. Heat A: 5 drivers, picked from pit (karts 1-5 expected; 6,7 stay in pits)
  let workingLines = JSON.parse(JSON.stringify(seededPitLines));
  const pickA = pickKartsForAssignment(workingLines, laneKeys, 5, {});
  console.log('\nHeat A pick complete=', pickA.complete, 'karts=', pickA.assigned.map((a) => a.kart));
  reorderAssignedKartsToPitFront(workingLines, pickA.assigned);

  const assignA = await post('/api/admin/assign-heat', {
    assignments: buildAssignmentPayload(pickA.assigned, ['D1', 'D2', 'D3', 'D4', 'D5']),
    heatSettings: { type: 'time', duration: 0.05, exportCsv: true, exportPdf: false },
    pitLines: workingLines,
  });
  console.log('Assign Heat A success=', assignA.success, 'prepared=', assignA.prepared);

  let s = await call('/api/admin/session-state');
  console.log('heatKartNumbers:', s.heatKartNumbers);
  console.log('pitLines after assign A:');
  Object.entries(s.pitLines).forEach(([id, l]) => console.log(`  lane ${id}: karts=${JSON.stringify(l.karts)}`));

  // 2. Launch all 5 assigned karts via transponder pit-exit
  for (let i = 0; i < 5; i += 1) {
    s = await call('/api/admin/session-state');
    let launchedAny = false;
    for (const [laneId, lane] of Object.entries(s.pitLines)) {
      const exitKart = lane.karts?.[0];
      if (exitKart != null && s.heatKartNumbers.includes(exitKart) && !s.onTrack.some((o) => o.kart_number === exitKart)) {
        const r = await post('/api/transponder/pit-exit', { transponder_id: String(exitKart) });
        console.log(`Pit exit kart ${exitKart} (lane ${laneId}): success=${r.success} error=${r.error || ''}`);
        launchedAny = true;
        break;
      }
    }
    if (!launchedAny) break;
  }

  s = await call('/api/admin/session-state');
  console.log('\nonTrack:', s.onTrack.map((o) => o.kart_number));
  console.log('heatClock.startedAt set?', Boolean(s.heatClock.startedAt));
  console.log('pitLines:');
  Object.entries(s.pitLines).forEach(([id, l]) => console.log(`  lane ${id}: karts=${JSON.stringify(l.karts)}`));

  // 3. Run a lap on each on-track kart
  for (const ot of s.onTrack) {
    const r = await post('/api/transponder/lap', { transponder_id: String(ot.kart_number), lap_time_sec: 45 });
    console.log(`lap kart ${ot.kart_number}: success=${r.success} lap_count=${r.lap_count}`);
  }
  s = await call('/api/admin/session-state');
  console.log('\nheatClock:', JSON.stringify(s.heatClock));

  // 4. While heat A running, prepare heat B (2 drivers) using remaining pit karts (6,7) + onTrack pending pool
  console.log('\n--- Preparing heat B while heat A running ---');
  const sessionRunning = Boolean(s.heatClock.startedAt && s.heatClock.running && !s.heatClock.cooldownPhase && !s.heatClock.draining);
  const overlapMode = s.onTrack.length > 0 && (s.heatClock.draining || s.heatClock.cooldownPhase);
  const canUseTrackPool = overlapMode || sessionRunning;
  console.log('sessionRunning:', sessionRunning, 'overlapMode:', overlapMode, 'canUseTrackPool:', canUseTrackPool);
  console.log('pit karts available:', Object.values(s.pitLines).flatMap((l) => l.karts || []));

  let workingLinesB = JSON.parse(JSON.stringify(s.pitLines));
  const pickB = pickKartsForAssignment(workingLinesB, laneKeys, 2, {
    onTrackKarts: canUseTrackPool ? s.onTrack : [],
    pendingOnTrackSlots: canUseTrackPool,
  });
  console.log('Heat B pick complete=', pickB.complete, 'slots=', JSON.stringify(pickB.assigned));
  reorderAssignedKartsToPitFront(workingLinesB, pickB.assigned);

  const assignB = await post('/api/admin/assign-heat', {
    assignments: buildAssignmentPayload(pickB.assigned, ['Driver_B1', 'Driver_B2']),
    heatSettings: { type: 'time', duration: 0.05, exportCsv: true, exportPdf: false },
    pitLines: workingLinesB,
  });
  console.log('Assign B: success=', assignB.success, 'prepared=', assignB.prepared, 'error=', assignB.error);

  s = await call('/api/admin/session-state');
  console.log('nextHeatKartNumbers:', s.nextHeatKartNumbers);
  console.log('nextHeatReadiness:', JSON.stringify(s.nextHeatReadiness));
  console.log('pitLines after assign B:');
  Object.entries(s.pitLines).forEach(([id, l]) => console.log(`  lane ${id}: karts=${JSON.stringify(l.karts)}`));

  // 5. Wait for heat A (duration=0.05min=3s) to expire and enter cooldown
  console.log('\n--- Waiting for heat A time expiry (3s duration) ---');
  await sleep(4000);
  s = await call('/api/admin/session-state');
  console.log('heatCooldownPhase:', s.heatClock.cooldownPhase, 'racePhase:', s.heatClock.racePhase, 'draining:', s.heatClock.draining);
  console.log('heatFrozen:', s.heatFrozen, 'autoFinishRequested:', s.autoFinishRequested);
  console.log('currentHeat (heatKartNumbers):', s.heatKartNumbers);
  console.log('onTrack:', s.onTrack.map((o) => ({ kart: o.kart_number, cooldownLapPending: o.cooldownLapPending, cooldownLapDone: o.cooldownLapDone })));
  console.log('pitLines:');
  Object.entries(s.pitLines).forEach(([id, l]) => console.log(`  lane ${id}: karts=${JSON.stringify(l.karts)}`));

  // 6. Complete cooldown lap for kart(s) still on track for current heat (not next-heat reserved)
  console.log('\n--- Completing cooldown laps via transponder ---');
  for (const ot of s.onTrack) {
    const r = await post('/api/transponder/lap', { transponder_id: String(ot.kart_number), lap_time_sec: 45 });
    console.log(`cooldown lap kart ${ot.kart_number}:`, r.success, 'lap_count=', r.lap_count, r.error || '');
  }

  s = await call('/api/admin/session-state');
  console.log('\nAfter cooldown laps:');
  console.log('heatFrozen:', s.heatFrozen, 'autoFinishRequested:', s.autoFinishRequested);
  console.log('onTrack:', s.onTrack.map((o) => o.kart_number));
  console.log('currentHeat karts (heatKartNumbers):', s.heatKartNumbers);
  console.log('nextHeatKartNumbers:', s.nextHeatKartNumbers);
  console.log('heatClock.racePhase:', s.heatClock.racePhase);
  console.log('pitLines:');
  Object.entries(s.pitLines).forEach(([id, l]) => console.log(`  lane ${id}: karts=${JSON.stringify(l.karts)}`));

  // 7. Acknowledge export (simulate admin "finish" / auto export)
  if (s.autoFinishRequested) {
    console.log('\n--- Acknowledging auto export ---');
    const ack = await post('/api/admin/auto-export-ack', {});
    console.log('ack:', JSON.stringify(ack));
  } else {
    console.log('\n[no autoFinishRequested - export trigger NOT fired]');
  }

  s = await call('/api/admin/session-state');
  console.log('\nFinal state:');
  console.log('heatFrozen:', s.heatFrozen);
  console.log('heatKartNumbers (heat B promoted?):', s.heatKartNumbers);
  console.log('onTrack:', s.onTrack.map((o) => o.kart_number));
  console.log('heatClock.startedAt:', s.heatClock.startedAt, 'running:', s.heatClock.running, 'racePhase:', s.heatClock.racePhase);

  // 8. Test transponder lap on heat B kart
  if (s.onTrack.length) {
    console.log('\n--- Testing transponder lap on Heat B kart ---');
    const kart = s.onTrack[0].kart_number;
    const r = await post('/api/transponder/lap', { transponder_id: String(kart), lap_time_sec: 44 });
    console.log(`lap for kart ${kart}:`, JSON.stringify(r));
  } else {
    console.log('\nNo karts on track for heat B - need pit-exit first.');
    for (const [laneId, lane] of Object.entries(s.pitLines)) {
      const exitKart = lane.karts?.[0];
      if (exitKart != null && s.heatKartNumbers.includes(exitKart)) {
        const r = await post('/api/transponder/pit-exit', { transponder_id: String(exitKart) });
        console.log(`Pit exit kart ${exitKart} for heat B: success=${r.success} error=${r.error || ''}`);
      }
    }
    s = await call('/api/admin/session-state');
    console.log('onTrack now:', s.onTrack.map((o) => o.kart_number));
    if (s.onTrack.length) {
      const kart = s.onTrack[0].kart_number;
      const r = await post('/api/transponder/lap', { transponder_id: String(kart), lap_time_sec: 44 });
      console.log(`lap for kart ${kart}:`, JSON.stringify(r));
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
