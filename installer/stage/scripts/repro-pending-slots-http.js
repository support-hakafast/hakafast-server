/**
 * HTTP repro: 4 karts on track for Heat A (timed, 3s duration, export enabled).
 * While Heat A runs, prepare Heat B with 4 drivers using pickKartsForAssignment
 * with onTrackKarts/pendingOnTrackSlots: 2 drivers get karts from pits directly,
 * 2 drivers get "pending" slots waiting for karts returning from Heat A's track.
 *
 * When Heat A ends, each on-track kart completes a real cooldown lap via the
 * transponder. The first 2 returning karts should fill the 2 pending Heat B
 * slots. After export-ack, Heat B should promote with ALL 4 drivers having
 * karts assigned.
 *
 * Run: node scripts/repro-pending-slots-http.js  (server must be running on :5000)
 */
const BASE = 'http://localhost:5000';
const WS = 'reprops-' + Date.now();
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

// --- Inlined ports of adminHelpers ---
function orderOnTrackKartsForPitEntry(onTrackKarts) {
  return (onTrackKarts || []).slice().sort((a, b) => (a.lap_count || 0) - (b.lap_count || 0)).map((k) => Number(k.kart_number));
}
function countPitKartsInLines(workingLines, laneKeys) {
  return laneKeys.reduce((sum, key) => sum + (workingLines[key]?.karts?.length || 0), 0);
}
function pickKartsForAssignment(workingLines, laneKeys, driverCount, options = {}) {
  const usePendingTrackSlots = Boolean(options.pendingOnTrackSlots);
  const onTrackOrdered = orderOnTrackKartsForPitEntry(options.onTrackKarts || []);
  const pitKartTotal = countPitKartsInLines(workingLines, laneKeys);
  if (pitKartTotal + onTrackOrdered.length < driverCount) return { assigned: [], complete: false };

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
        if (trackKart != null) found = { kart: trackKart, lane: null, depth: -1, source: 'on_track' };
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

  // Seed: 6 karts total, lane1=[1,2,3], lane2=[4,5,6]
  const seededPitLines = {
    1: { name: 'טור 1', active: true, karts: [1, 2, 3] },
    2: { name: 'טור 2', active: true, karts: [4, 5, 6] },
  };
  const laneKeys = ['1', '2'];

  // Heat A: 4 drivers (karts 1,4,2,5)
  let workingLines = JSON.parse(JSON.stringify(seededPitLines));
  const pickA = pickKartsForAssignment(workingLines, laneKeys, 4, {});
  console.log('Heat A karts=', pickA.assigned.map((a) => a.kart));
  reorderAssignedKartsToPitFront(workingLines, pickA.assigned);

  const assignA = await post('/api/admin/assign-heat', {
    assignments: buildAssignmentPayload(pickA.assigned, ['A1', 'A2', 'A3', 'A4']),
    heatSettings: { type: 'time', duration: 0.05, exportCsv: true, exportPdf: false },
    pitLines: workingLines,
  });
  console.log('Assign Heat A success=', assignA.success);

  // Launch all 4 karts
  for (let i = 0; i < 4; i += 1) {
    const s = await call('/api/admin/session-state');
    for (const [laneId, lane] of Object.entries(s.pitLines)) {
      const exitKart = lane.karts?.[0];
      if (exitKart != null && s.heatKartNumbers.includes(exitKart) && !s.onTrack.some((o) => o.kart_number === exitKart)) {
        await post('/api/transponder/pit-exit', { transponder_id: String(exitKart) });
        break;
      }
    }
  }

  let s = await call('/api/admin/session-state');
  console.log('onTrack:', s.onTrack.map((o) => o.kart_number));
  console.log('pits remaining:', Object.values(s.pitLines).flatMap((l) => l.karts));

  // Prepare Heat B with 4 drivers: 2 pit karts available (3,6), 2 pending from track
  console.log('\n--- Preparing Heat B (4 drivers, 2 pit karts + 2 pending track slots) ---');
  let workingLinesB = JSON.parse(JSON.stringify(s.pitLines));
  const pickB = pickKartsForAssignment(workingLinesB, laneKeys, 4, {
    onTrackKarts: s.onTrack,
    pendingOnTrackSlots: true,
  });
  console.log('Heat B pick complete=', pickB.complete, 'slots=', JSON.stringify(pickB.assigned));
  reorderAssignedKartsToPitFront(workingLinesB, pickB.assigned);

  const assignB = await post('/api/admin/assign-heat', {
    assignments: buildAssignmentPayload(pickB.assigned, ['B1', 'B2', 'B3', 'B4']),
    heatSettings: { type: 'time', duration: 0.05, exportCsv: true, exportPdf: false },
    pitLines: workingLinesB,
  });
  console.log('Assign B success=', assignB.success, 'prepared=', assignB.prepared);

  s = await call('/api/admin/session-state');
  console.log('nextHeatKartNumbers:', s.nextHeatKartNumbers);
  console.log('nextHeatReadiness:', JSON.stringify(s.nextHeatReadiness));

  // Wait for Heat A expiry
  console.log('\n--- Waiting for Heat A expiry (3s) ---');
  await sleep(4000);
  s = await call('/api/admin/session-state');
  console.log('heatCooldownPhase:', s.heatClock.cooldownPhase, 'racePhase:', s.heatClock.racePhase);
  console.log('onTrack:', s.onTrack.map((o) => ({ kart: o.kart_number, pending: o.cooldownLapPending, done: o.cooldownLapDone })));
  console.log('nextHeatKartNumbers:', s.nextHeatKartNumbers);

  // Complete cooldown laps in entry order (order they appear on track)
  console.log('\n--- Completing cooldown laps ---');
  const order = s.onTrack.map((o) => o.kart_number);
  for (const kart of order) {
    const r = await post('/api/transponder/lap', { transponder_id: String(kart), lap_time_sec: 45 });
    console.log(`lap kart ${kart}: success=${r.success} lap_count=${r.lap_count}`);
    s = await call('/api/admin/session-state');
    console.log('  -> nextHeatKartNumbers now:', s.nextHeatKartNumbers, 'nextHeatDriverCount:', s.nextHeatDriverCount);
  }

  s = await call('/api/admin/session-state');
  console.log('\nAfter all cooldown laps:');
  console.log('heatFrozen:', s.heatFrozen, 'autoFinishRequested:', s.autoFinishRequested);
  console.log('nextHeatKartNumbers:', s.nextHeatKartNumbers, 'nextHeatDriverCount:', s.nextHeatDriverCount);
  console.log('onTrack:', s.onTrack.map((o) => o.kart_number));

  if (s.autoFinishRequested) {
    console.log('\n--- Acknowledging auto export ---');
    const ack = await post('/api/admin/auto-export-ack', {});
    console.log('ack onTrack:', JSON.stringify(ack.onTrack?.map((o) => o.kart_number)));
  }

  s = await call('/api/admin/session-state');
  console.log('\nFinal state:');
  console.log('heatFrozen:', s.heatFrozen);
  console.log('heatKartNumbers (Heat B promoted):', s.heatKartNumbers);
  console.log('onTrack:', s.onTrack.map((o) => o.kart_number));
  console.log('heatClock.startedAt set?', Boolean(s.heatClock.startedAt), 'running:', s.heatClock.running);

  const allFilled = s.heatKartNumbers.every((n) => Number.isFinite(n) && n !== 0);
  console.log('\nAll 4 Heat B drivers have karts:', allFilled, 'count:', s.heatKartNumbers.length);
  if (!allFilled || s.heatKartNumbers.length !== 4) {
    console.error('FAIL');
    process.exit(1);
  }
  console.log('PASS');
}

main().catch((e) => { console.error(e); process.exit(1); });
