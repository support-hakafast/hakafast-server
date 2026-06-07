/**
 * Timing system verification — run: node scripts/verify-timing.js
 */
const demoStore = require('../demoStore');

function lapToSeconds(lap) {
  if (!lap || typeof lap !== 'string') return Infinity;
  const trimmed = lap.trim();
  if (trimmed.includes(':')) {
    const [mins, secs] = trimmed.split(':');
    return (parseInt(mins, 10) || 0) * 60 + (parseFloat(secs) || 0);
  }
  const value = parseFloat(trimmed);
  return Number.isNaN(value) ? Infinity : value;
}

function gapToLeader(row, leader, heatType) {
  if (!row || !leader) return '--.---';
  if (heatType === 'time') {
    const leaderBest = lapToSeconds(leader.best_lap_time);
    const rowBest = lapToSeconds(row.best_lap_time);
    if (leaderBest === Infinity || rowBest === Infinity) return '--.---';
    const gap = rowBest - leaderBest;
    if (gap <= 0) return '—';
    return `+${gap.toFixed(3)}`;
  }
  return '—';
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function buildRow(kart, name, best, last, laps = 2) {
  return {
    kart_number: kart,
    driver_name: name,
    best_lap_time: best,
    last_lap_time: last,
    lap_count: laps,
  };
}

function setupStore() {
  const wsId = 'verify001';
  demoStore.resetStore('kart-demo', wsId);
  const store = demoStore.resolveFromParts('kart-demo', wsId);
  store.heatSettings.type = 'time';
  store.heatSettings.timingColumns.gap = true;
  store.currentHeat = [
    {
      kart_number: 1,
      driver_name: 'Leader',
      driver_level: 'Amateur',
      registered: false,
      lap_count: 0,
      last_lap_time: null,
      best_lap_time: null,
      lap_times: [],
    },
    {
      kart_number: 2,
      driver_name: 'Chaser',
      driver_level: 'Amateur',
      registered: false,
      lap_count: 0,
      last_lap_time: null,
      best_lap_time: null,
      lap_times: [],
    },
  ];
  store.pitLines[1].karts = [1];
  store.pitLines[2].karts = [2];
  return store;
}

function testLapRecording(store) {
  const launch1 = demoStore.launchKart(store, 1, 1);
  assert(launch1.success, 'kart 1 should launch');

  const lap1 = demoStore.processTransponderLap(store, '1', 42.5);
  assert(lap1.success, 'lap 1 should record');
  assert(lap1.last_lap_time === '42.500', `last lap should update (got ${lap1.last_lap_time})`);

  const row1 = store.currentHeat.find((r) => r.kart_number === 1);
  assert(row1.lap_count === 1, 'lap count should be 1');
  assert(row1.best_lap_time == null, 'best lap should stay empty on first lap');
  assert(row1.lap_times.length === 1, 'lap history should have 1 entry');

  const lap2 = demoStore.processTransponderLap(store, '1', 41.2);
  assert(lap2.success, 'lap 2 should record');
  assert(lap2.last_lap_time === '41.200', `last lap should update again (got ${lap2.last_lap_time})`);
  assert(row1.best_lap_time === '41.200', 'best lap should update from lap 2');
  assert(row1.lap_count === 2, 'lap count should be 2');
}

function testLastLapUpdatesOnEachCrossing(store) {
  const before = rowLast(store, 1);
  demoStore.processTransponderLap(store, '1', 40.9);
  const after = rowLast(store, 1);
  assert(before !== after, 'last lap should change on each crossing');
  assert(after === '40.900', `expected 40.900 got ${after}`);
}

function rowLast(store, kart) {
  return store.currentHeat.find((r) => r.kart_number === kart).last_lap_time;
}

function testTimingDataSortAndFields(store) {
  demoStore.launchKart(store, 2, 2);
  demoStore.processTransponderLap(store, '2', 43.0);
  demoStore.processTransponderLap(store, '2', 42.8);
  demoStore.processTransponderLap(store, '1', 40.5);

  const rows = demoStore.getTimingData(store);
  assert(rows.length === 2, 'both on-track karts should appear');
  assert(rows[0].kart_number === 1, 'leader should be kart 1 (fastest best lap)');
  assert(rows[0].best_lap_time, 'leader should have best lap displayed');
  assert(rows[0].last_lap_time, 'leader should have last lap displayed');
  assert(rows[1].kart_number === 2, 'second place should be kart 2');
}

function testGapColumnTimeMode() {
  const leader = buildRow(1, 'Leader', '41.200', '40.500');
  const chaser = buildRow(2, 'Chaser', '42.800', '42.100');
  const gap = gapToLeader(chaser, leader, 'time');
  assert(gap === '+1.600', `gap should be +1.600 (got ${gap})`);
  assert(gapToLeader(leader, leader, 'time') === '—', 'leader gap should be dash');
}

function testSimulationCatchUp(store) {
  const wsId = 'verify002';
  demoStore.resetStore('kart-demo', wsId);
  const simStore = demoStore.resolveFromParts('kart-demo', wsId);
  simStore.heatSettings.type = 'time';
  simStore.currentHeat = [{
    kart_number: 3,
    driver_name: 'Sim',
    driver_level: 'Amateur',
    registered: false,
    lap_count: 0,
    last_lap_time: null,
    best_lap_time: null,
    lap_times: [],
  }];
  simStore.pitLines[1].karts = [3];
  demoStore.launchKart(simStore, 3, 1);

  const ot = simStore.onTrack[0];
  ot.launchedAt = Date.now() - 95 * 1000;
  ot.lastLapAt = ot.launchedAt;
  ot.simulatedLaps = 0;

  demoStore.getTimingData(simStore);
  const row = simStore.currentHeat[0];
  assert(row.lap_count >= 2, `simulation should catch up missed laps (got ${row.lap_count})`);
}

function testSessionFastestFlag(store) {
  const rows = demoStore.getTimingData(store);
  const fastest = rows.find((r) => r.is_session_fastest);
  assert(fastest, 'one row should be marked session fastest');
  assert(
    lapToSeconds(fastest.last_lap_time) <= lapToSeconds(rows[0].best_lap_time),
    'session fastest should match a real lap time',
  );
}

function testRetireDoesNotStopClock() {
  const wsId = 'verify004';
  demoStore.resetStore('kart-demo', wsId);
  const store = demoStore.resolveFromParts('kart-demo', wsId);
  store.heatSettings.duration = 10;
  store.currentHeat = [
    { kart_number: 1, driver_name: 'A', driver_level: 'Amateur', registered: false, lap_count: 0, lap_times: [] },
    { kart_number: 2, driver_name: 'B', driver_level: 'Amateur', registered: false, lap_count: 0, lap_times: [] },
  ];
  store.pitLines[1].karts = [1, 2];
  store.heatRuntime.startedAt = Date.now() - 30000;

  demoStore.launchKart(store, 1, 1);
  const before = demoStore.getHeatClock(store);
  assert(before.startedAt, 'clock should be started');
  assert(before.remainingSec > 0, 'clock should have time left');

  demoStore.returnKart(store, 1, 1);
  const after = demoStore.getHeatClock(store);
  assert(after.startedAt, 'clock must keep running after retire');
  assert(after.remainingSec > 0, 'clock must still count down after retire');
  assert(after.remainingSec <= before.remainingSec, 'clock should not reset on retire');
  assert(store.onTrack.length === 0, 'retired kart leaves track');
}

function testHeatDrainBlocksNextLaunch() {
  const wsId = 'verify003';
  demoStore.resetStore('kart-demo', wsId);
  const store = demoStore.resolveFromParts('kart-demo', wsId);
  store.currentHeat = [{
    kart_number: 7,
    driver_name: 'Current',
    driver_level: 'Amateur',
    registered: false,
    lap_count: 2,
    last_lap_time: '45.000',
    best_lap_time: '44.000',
    lap_times: ['46.000', '44.000'],
  }];
  store.nextHeat = [{
    kart_number: 7,
    driver_name: 'Next Driver',
    driver_level: 'Amateur',
    registered: false,
    lap_count: 0,
    last_lap_time: null,
    best_lap_time: null,
    lap_times: [],
  }];
  store.onTrack = [{ kart_number: 7, launchedAt: Date.now(), lastLapAt: Date.now() }];
  store.pitLines[1].karts = [7];
  store.heatRuntime.startedAt = Date.now() - 600000;

  demoStore.finishHeat(store, { keepOnTrack: true });
  assert(store.heatFrozen, 'heat should freeze with karts on track');
  assert(store.onTrack.length === 1, 'on-track karts should remain after timed finish');

  const blocked = demoStore.launchKart(store, 7, 1);
  assert(!blocked.success, 'next heat launch must wait while kart is on track');
  assert(
    blocked.error === 'session_still_active' || blocked.error === 'already_on_track',
    `expected block error, got ${blocked.error}`,
  );

  demoStore.returnKart(store, 7, 1);
  assert(store.onTrack.length === 0, 'kart should return');
  assert(!store.heatFrozen, 'heat should drain after last return');
  assert(store.currentHeat.length === 0, 'current heat cleared after drain');
}

async function testOnTrackKartPool() {
  const { pickKartsForAssignment } = await import('../src/utils/adminHelpers.js');
  const lines = {
    1: { active: true, karts: [11, 12] },
    2: { active: true, karts: [] },
  };
  const withoutTrack = pickKartsForAssignment(lines, ['1', '2'], 5);
  assert(!withoutTrack.complete, '5 drivers should fail with only 2 pit karts');

  const withTrack = pickKartsForAssignment(lines, ['1', '2'], 5, {
    onTrackKarts: [1, 2, 3, 4],
  });
  assert(withTrack.complete, '5 drivers should succeed with 2 pits + 4 on track');
  assert(withTrack.assigned.length === 5, 'should assign 5 karts');
  const nums = new Set(withTrack.assigned.map((a) => a.kart));
  assert(nums.has(11) && nums.has(12), 'should use pit karts first');
  const fromTrack = withTrack.assigned.filter((a) => a.source === 'on_track').length;
  assert(fromTrack === 3, `expected 3 on-track karts, got ${fromTrack}`);
}

function testAvgLapFromLapTimes() {
  const avg = demoStore.computeAvgLapFromTimes(['46.000', '44.000', '45.000']);
  assert(avg === '45.000', `avg should be mean of laps (got ${avg})`);
}

function testDailyHeatNumber() {
  const wsId = 'verify005';
  demoStore.resetStore('kart-demo', wsId);
  const store = demoStore.resolveFromParts('kart-demo', wsId);
  store.currentHeat = [{ kart_number: 1, driver_name: 'A', lap_count: 0, lap_times: [] }];
  demoStore.assignHeatBatch(store, [{
    kart_number: 2,
    driver_name: 'B',
    assignment_order: 1,
  }], { type: 'time', duration: 10 });
  assert(demoStore.getCurrentHeatNumber(store) === 1, 'first heat of day should be 1');
  demoStore.assignHeatBatch(store, [{
    kart_number: 3,
    driver_name: 'C',
    assignment_order: 1,
  }], { type: 'time', duration: 10 });
  assert(demoStore.getCurrentHeatNumber(store) === 2, 'second heat should be 2');
}

function testTopLapStats() {
  const wsId = 'verify006';
  demoStore.resetStore('kart-demo', wsId);
  const store = demoStore.resolveFromParts('kart-demo', wsId);
  store.lapRecords = [
    { lap_sec: 42.1, lap_time: '42.100', driver_name: 'Fast', recorded_at: new Date().toISOString() },
    { lap_sec: 43.5, lap_time: '43.500', driver_name: 'Slow', recorded_at: new Date().toISOString() },
  ];
  const top = demoStore.getTopLaps(store, 'day', 10);
  assert(top.length === 2, 'should return recorded laps');
  assert(top[0].driver_name === 'Fast', 'fastest lap should be first');
}

function testEndurancePitsAndPenalty() {
  const wsId = 'verify007';
  demoStore.resetStore('kart-demo', wsId);
  const store = demoStore.resolveFromParts('kart-demo', wsId);
  store.heatSettings.type = 'endurance';
  store.currentHeat = [{
    kart_number: 5,
    driver_name: 'Team A',
    team_name: 'Team A',
    team_drivers: [{ name: 'Driver 1', transponder_id: 'T100' }],
    active_driver: 'Driver 1',
    lap_count: 0,
    lap_times: [],
    pit_visits: 0,
    stints: [],
  }];
  store.pitLines[1].karts = [5];
  demoStore.launchKart(store, 5, 1);
  demoStore.processTransponderLap(store, 'T100', 50.0);
  demoStore.processTransponderLap(store, 'T100', 48.5);
  const row = store.currentHeat[0];
  assert(row.avg_lap_time === '49.250', `avg lap from splits (got ${row.avg_lap_time})`);
  assert(row.current_stint?.lap_count === 2, 'stint should track laps');

  demoStore.addPenalty(store, 5, { seconds: 60, reason: 'track limits' });
  assert(row.unserved_penalty_sec === 60, 'penalty should be unserved');

  demoStore.returnKart(store, 5, 1);
  assert(row.pit_visits === 1, 'pit visit should increment');
  assert(row.pit_entered_at, 'pit timer should start');

  row.pit_entered_at = Date.now() - 30000;
  demoStore.getTimingData(store);
  assert(row.unserved_penalty_sec < 60, 'penalty should serve while in pits');
}

async function main() {
  const results = [];
  const run = async (name, fn) => {
    try {
      await fn();
      results.push({ name, ok: true });
    } catch (err) {
      results.push({ name, ok: false, error: err.message });
    }
  };

  await run('gap column (time mode)', testGapColumnTimeMode);

  const store = setupStore();
  await run('lap recording + first lap skip for best', () => testLapRecording(store));
  await run('last lap updates each crossing', () => testLastLapUpdatesOnEachCrossing(store));
  await run('timing data sort + display fields', () => testTimingDataSortAndFields(store));
  await run('session fastest flag', () => testSessionFastestFlag(store));
  await run('simulation catch-up laps', testSimulationCatchUp);
  await run('next-heat uses on-track karts', testOnTrackKartPool);
  await run('retire does not stop heat clock', () => testRetireDoesNotStopClock());
  await run('timed finish waits for kart return', () => testHeatDrainBlocksNextLaunch());
  await run('avg lap from lap splits', () => testAvgLapFromLapTimes());
  await run('daily heat number', () => testDailyHeatNumber());
  await run('top lap stats', () => testTopLapStats());
  await run('endurance pits stints penalties', () => testEndurancePitsAndPenalty());

  const failed = results.filter((r) => !r.ok);
  console.log('\n=== HAKAFAST timing verification ===\n');
  results.forEach((r) => {
    console.log(`${r.ok ? '✓' : '✗'} ${r.name}${r.error ? ` — ${r.error}` : ''}`);
  });
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
