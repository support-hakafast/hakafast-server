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

function gapToLeader(row, ahead, heatType) {
  if (!row) return '--.---';
  if (!ahead) return '—';
  if (heatType === 'time') {
    const aheadBest = lapToSeconds(ahead.best_lap_time);
    const rowBest = lapToSeconds(row.best_lap_time);
    if (aheadBest === Infinity || rowBest === Infinity) return '--.---';
    const gap = rowBest - aheadBest;
    if (gap <= 0) return '—';
    return `+${gap.toFixed(3)}`;
  }
  const aheadLaps = ahead.lap_count || 0;
  const rowLaps = row.lap_count || 0;
  const lapDiff = aheadLaps - rowLaps;
  if (lapDiff >= 1) return lapDiff === 1 ? '+1 Lap' : `+${lapDiff} Laps`;
  if (lapDiff < 0) return '—';
  const trackGap = (ahead.track_position || 0) - (row.track_position || 0);
  if (trackGap <= 0.001) return '—';
  const refLap = lapToSeconds(ahead.last_lap_time);
  const estSec = trackGap * (refLap !== Infinity ? refLap : 45);
  return `+${estSec.toFixed(3)}`;
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
  assert(row1.best_lap_time === '42.500', 'best lap should update on first lap');
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
  const ahead = buildRow(1, 'Leader', '41.200', '40.500');
  const chaser = buildRow(2, 'Chaser', '42.800', '42.100');
  const gap = gapToLeader(chaser, ahead, 'time');
  assert(gap === '+1.600', `gap should be +1.600 (got ${gap})`);
  assert(gapToLeader(chaser, null, 'time') === '—', 'P1 gap should be dash');
}

function testSprintGapUsesTrackPosition() {
  const ahead = { kart_number: 1, lap_count: 3, track_position: 0.8, last_lap_time: '45.000' };
  const chaser = { kart_number: 2, lap_count: 3, track_position: 0.2, last_lap_time: '46.000' };
  const lapped = { kart_number: 3, lap_count: 2, track_position: 0.9, last_lap_time: '44.000' };
  const sameLapGap = gapToLeader(chaser, ahead, 'sprint');
  assert(sameLapGap.startsWith('+'), `same-lap sprint gap should be seconds (got ${sameLapGap})`);
  assert(gapToLeader(lapped, ahead, 'sprint') === '+1 Lap', 'one lap down should show +1 Lap');
  assert(gapToLeader(ahead, null, 'sprint') === '—', 'P1 should have no gap');
}

function testSprintGapToCarAheadNotLeader() {
  const leader = { kart_number: 1, lap_count: 4, track_position: 0.9, last_lap_time: '44.000' };
  const middle = { kart_number: 2, lap_count: 3, track_position: 0.7, last_lap_time: '45.000' };
  const back = { kart_number: 3, lap_count: 3, track_position: 0.2, last_lap_time: '46.000' };
  assert(gapToLeader(back, leader, 'sprint') === '+1 Lap', 'back is one lap down on leader');
  const gapToAhead = gapToLeader(back, middle, 'sprint');
  assert(gapToAhead.startsWith('+') && !gapToAhead.includes('Lap'), 'back should show seconds gap to car directly ahead');
  assert(gapToAhead === '+22.500', `expected +22.500 track gap (got ${gapToAhead})`);
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
  assert(row.lap_times.length >= 2, 'lap history should reflect catch-up');
  const lastTwo = row.lap_times.slice(-2);
  assert(
    lastTwo[0] !== lastTwo[1],
    `consecutive simulated laps must differ (got ${lastTwo.join(' vs ')})`,
  );
  assert(
    row.last_lap_time === lastTwo[1],
    'last lap should match most recent crossing',
  );
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
  assert(!store.heatFrozen, 'heat should drain when only next-heat kart remains on track');
  assert(store.onTrack.length === 1, 'next-heat kart should stay on track');
  assert(Number(store.onTrack[0].kart_number) === 7, 'same kart remains on track after promote');
  assert(store.currentHeat.length === 1, 'next heat should promote after drain');
  assert(store.currentHeat[0].driver_name === 'Next Driver', 'promoted next heat drivers');
  assert(store.nextHeat.length === 0, 'next heat queue cleared on promote');

  const blocked = demoStore.launchKart(store, 7, 1);
  assert(!blocked.success, 'kart already on track should not relaunch');
  assert(blocked.error === 'already_on_track', `expected already_on_track, got ${blocked.error}`);
}

function testReturnNonNextHeatKartsOnFinish() {
  const wsId = 'verify025';
  demoStore.resetStore('kart-demo', wsId);
  const store = demoStore.resolveFromParts('kart-demo', wsId);
  store.currentHeat = [
    { kart_number: 1, driver_name: 'A', driver_level: 'Amateur', lap_count: 2, lap_times: ['45.000', '44.000'] },
    { kart_number: 2, driver_name: 'B', driver_level: 'Amateur', lap_count: 2, lap_times: ['46.000', '45.000'] },
    { kart_number: 3, driver_name: 'C', driver_level: 'Amateur', lap_count: 2, lap_times: ['47.000', '46.000'] },
  ];
  store.nextHeat = [
    { kart_number: 1, driver_name: 'A2', driver_level: 'Amateur', lap_count: 0, lap_times: [] },
    { kart_number: 4, driver_name: 'D', driver_level: 'Amateur', lap_count: 0, lap_times: [] },
  ];
  store.onTrack = [
    { kart_number: 1, launchedAt: Date.now(), lastLapAt: Date.now(), originLaneId: 1 },
    { kart_number: 2, launchedAt: Date.now(), lastLapAt: Date.now(), originLaneId: 1 },
    { kart_number: 3, launchedAt: Date.now(), lastLapAt: Date.now(), originLaneId: 1 },
  ];
  store.pitLines[1].karts = [];
  store.heatRuntime.startedAt = Date.now() - 600000;

  demoStore.finishHeat(store, { keepOnTrack: true });
  assert(!store.heatFrozen, 'should promote when only next-heat kart 1 remains');
  assert(store.onTrack.length === 1, 'only next-heat kart stays on track');
  assert(Number(store.onTrack[0].kart_number) === 1, 'kart 1 stays for next heat');
  assert(store.pitLines[1].karts.includes(2), 'kart 2 should return to pits');
  assert(store.pitLines[1].karts.includes(3), 'kart 3 should return to pits');
  assert(store.currentHeat[0].driver_name === 'A2', 'next heat promoted with new driver on kart 1');
}

function testCooldownReturnsNonNextHeatKarts() {
  const wsId = 'verify026';
  demoStore.resetStore('kart-demo', wsId);
  const store = demoStore.resolveFromParts('kart-demo', wsId);
  const startedAt = Date.now() - 700000;
  store.heatSettings = { type: 'time', duration: 10 };
  store.heatRuntime.startedAt = startedAt;
  store.currentHeat = [
    { kart_number: 1, driver_name: 'A', driver_level: 'Amateur', lap_count: 2, lap_times: ['45.000', '44.000'] },
    { kart_number: 2, driver_name: 'B', driver_level: 'Amateur', lap_count: 2, lap_times: ['46.000', '45.000'] },
  ];
  store.nextHeat = [
    { kart_number: 1, driver_name: 'A2', driver_level: 'Amateur', lap_count: 0, lap_times: [] },
  ];
  store.onTrack = [
    { kart_number: 1, launchedAt: startedAt, lastLapAt: Date.now() - 45000, simulatedLaps: 2 },
    { kart_number: 2, launchedAt: startedAt, lastLapAt: Date.now() - 45000, simulatedLaps: 2, originLaneId: 1 },
  ];
  store.pitLines[1].karts = [];

  demoStore.getSessionState(store);
  assert(store.heatCooldownPhase, 'timed expiry should enter cooldown');
  assert(store.onTrack.length === 1, 'non-next kart should return at cooldown start');
  assert(Number(store.onTrack[0].kart_number) === 1, 'next-heat kart stays on track for cooldown lap');
  assert(store.pitLines[1].karts.includes(2), 'other karts go to pits for staff');

  const blocked = demoStore.returnKart(store, 1, 1);
  assert(!blocked.success, 'next-heat kart should stay on track during cooldown');
  assert(blocked.error === 'keep_for_next_heat', `expected keep_for_next_heat, got ${blocked.error}`);
}

function testAutoFinishExportMetadata() {
  const wsId = 'verify008';
  demoStore.resetStore('kart-demo', wsId);
  const store = demoStore.resolveFromParts('kart-demo', wsId);
  const { assignHeatNumber } = require('../lapStats');
  store.heatSettings = { type: 'time', duration: 10, exportCsv: true, exportPdf: false };
  const startedAt = Date.now() - 700000;
  store.heatRuntime.startedAt = startedAt;
  store.currentHeat = [{
    kart_number: 1,
    driver_name: 'A',
    driver_level: 'Amateur',
    best_lap_time: '44.000',
    lap_count: 1,
    lap_times: ['44.000'],
  }];
  store.onTrack = [];
  assignHeatNumber(store);

  const state = demoStore.getSessionState(store);
  assert(store.heatFrozen, 'heat should freeze when timed limit hit with no karts on track');
  assert(store.autoFinishExportPending, 'auto export should be pending');
  assert(store.autoFinishStartedAt === startedAt, 'should preserve heat start time for export');
  assert(store.autoFinishHeatNumber === 1, 'should preserve heat number for export');
  assert(state.autoFinishRequested, 'session should request auto export');
  assert(state.autoFinishStartedAt === startedAt, 'session should expose saved start time');

  demoStore.acknowledgeAutoExport(store);
  assert(!store.autoFinishExportPending, 'ack should clear pending export');
  assert(demoStore.getSessionState(store).autoFinishRequested === false, 'session should stop requesting export');
}

function testTimedCooldownThenAutoFinish() {
  const wsId = 'verify010';
  demoStore.resetStore('kart-demo', wsId);
  const store = demoStore.resolveFromParts('kart-demo', wsId);
  const startedAt = Date.now() - 700000;
  store.heatSettings = { type: 'time', duration: 10 };
  store.heatRuntime.startedAt = startedAt;
  store.currentHeat = [{
    kart_number: 1,
    driver_name: 'A',
    driver_level: 'Amateur',
    lap_count: 2,
    last_lap_time: '44.000',
    best_lap_time: '43.500',
    lap_times: ['45.000', '43.500'],
  }];
  store.onTrack = [{
    kart_number: 1,
    launchedAt: startedAt,
    lastLapAt: Date.now() - 45000,
    simulatedLaps: 2,
  }];
  store.pitLines[1].karts = [];

  demoStore.getSessionState(store);
  assert(store.heatCooldownPhase, 'timed expiry with karts on track should enter cooldown');
  assert(!store.heatFrozen, 'heat should not freeze until cooldown return');
  assert(!store.autoFinishExportPending, 'export waits until all karts return');

  demoStore.returnKart(store, 1, 1);
  assert(store.heatFrozen, 'heat should freeze after cooldown return');
  assert(store.autoFinishExportPending, 'auto export should trigger after cooldown return');
  assert(store.onTrack.length === 0, 'kart should be in pits');
}

function testSprintLastLapPhase() {
  const wsId = 'verify012';
  demoStore.resetStore('kart-demo', wsId);
  const store = demoStore.resolveFromParts('kart-demo', wsId);
  store.heatSettings = { type: 'sprint', targetLaps: 3 };
  store.heatRuntime.startedAt = Date.now() - 60000;
  store.currentHeat = [{
    kart_number: 1,
    driver_name: 'A',
    driver_level: 'Amateur',
    lap_count: 2,
    last_lap_time: '44.000',
    best_lap_time: '43.500',
    lap_times: ['45.000', '43.500'],
  }];
  store.onTrack = [{
    kart_number: 1,
    launchedAt: Date.now() - 60000,
    lastLapAt: Date.now() - 20000,
    simulatedLaps: 2,
  }];

  const clock = demoStore.getHeatClock(store);
  assert(clock.racePhase === 'last_lap', 'after n-1 laps sprint should show last lap phase');
}

function testTimedLastLapPhase() {
  const wsId = 'verify013';
  demoStore.resetStore('kart-demo', wsId);
  const store = demoStore.resolveFromParts('kart-demo', wsId);
  store.heatSettings = { type: 'time', duration: 10 };
  store.heatRuntime.startedAt = Date.now() - 700000;
  store.currentHeat = [{
    kart_number: 1,
    driver_name: 'A',
    driver_level: 'Amateur',
    lap_count: 2,
    lap_times: ['45.000', '43.500'],
  }];
  store.onTrack = [{
    kart_number: 1,
    launchedAt: Date.now() - 700000,
    lastLapAt: Date.now() - 30000,
  }];

  const clock = demoStore.getHeatClock(store);
  assert(clock.racePhase === 'last_lap', 'timed expiry with kart on track should show last lap phase');
}

function testFormationLapsBeforeRaceClock() {
  const wsId = 'verify014';
  demoStore.resetStore('kart-demo', wsId);
  const store = demoStore.resolveFromParts('kart-demo', wsId);
  store.heatSettings = { type: 'sprint', targetLaps: 3, formationLaps: 1 };
  store.currentHeat = [
    { kart_number: 1, driver_name: 'A', driver_level: 'Amateur', lap_count: 0, lap_times: [] },
    { kart_number: 2, driver_name: 'B', driver_level: 'Amateur', lap_count: 0, lap_times: [] },
  ];
  store.pitLines[1].karts = [1];
  store.pitLines[2].karts = [2];
  demoStore.launchKart(store, 1, 1);
  demoStore.launchKart(store, 2, 2);
  assert(!store.heatRuntime.startedAt, 'race clock must not start during formation');
  demoStore.processTransponderLap(store, '1', 50.0);
  demoStore.processTransponderLap(store, '2', 51.0);
  assert(store.currentHeat[0].lap_count === 0, 'formation lap must not count toward race laps');
  assert(store.heatRuntime.startedAt, 'race clock should start after formation complete');
  assert(store.heatRacingStarted, 'racing phase should be active');
}

function testLeMansGridDeploy() {
  const wsId = 'verify015';
  demoStore.resetStore('kart-demo', wsId);
  const store = demoStore.resolveFromParts('kart-demo', wsId);
  store.heatSettings = { type: 'endurance', duration: 60, formationLaps: 0, startMode: 'le_mans' };
  store.currentHeat = [{
    kart_number: 5,
    driver_name: 'Team A',
    team_name: 'Team A',
    lap_count: 0,
    lap_times: [],
    stints: [],
  }];
  store.pitLines[1].karts = [5];
  const blocked = demoStore.launchKart(store, 5, 1);
  assert(!blocked.success && blocked.error === 'use_grid_deploy', 'pit launch blocked before le mans green');
  const deployed = demoStore.deployGridKart(store, 5);
  assert(deployed.success, 'grid deploy should succeed');
  assert(store.onTrack.length === 1, 'kart should be on track');
  assert(store.pitLines[1].karts.length === 0, 'kart removed from pit lane');
  assert(store.heatRuntime.startedAt, 'clock starts when no formation laps configured');
}

function testSprintClockAndCooldown() {
  const wsId = 'verify011';
  demoStore.resetStore('kart-demo', wsId);
  const store = demoStore.resolveFromParts('kart-demo', wsId);
  store.heatSettings = { type: 'sprint', targetLaps: 2 };
  store.heatRuntime.startedAt = Date.now() - 120000;
  store.currentHeat = [{
    kart_number: 1,
    driver_name: 'A',
    driver_level: 'Amateur',
    lap_count: 2,
    last_lap_time: '44.000',
    best_lap_time: '43.500',
    lap_times: ['45.000', '43.500'],
  }];
  store.onTrack = [{
    kart_number: 1,
    launchedAt: Date.now() - 120000,
    lastLapAt: Date.now() - 30000,
    simulatedLaps: 2,
  }];
  store.pitLines[1].karts = [];

  const clock = demoStore.getHeatClock(store);
  assert(clock.clockMode === 'up', 'sprint clock should count up');
  assert(clock.elapsedSec >= 120, 'sprint clock should show elapsed time');
  assert(!clock.expired, 'sprint clock should keep running until cooldown complete');

  demoStore.getSessionState(store);
  assert(store.heatCooldownPhase, 'sprint should enter cooldown when target laps reached on track');
  const cooldownClock = demoStore.getHeatClock(store);
  assert(cooldownClock.racePhase === 'checkered', 'sprint cooldown should show checkered flag');
  assert(!demoStore.hasActiveTimingSession(store), 'next heat must wait during sprint cooldown');

  const lapsBefore = store.currentHeat[0].lap_count;
  demoStore.processTransponderLap(store, '1', 46.0);
  assert(store.currentHeat[0].lap_count === lapsBefore, 'cooldown lap must not increment lap count');

  demoStore.returnKart(store, 1, 1);
  assert(store.heatFrozen, 'sprint should auto-finish after cooldown return');
  assert(store.autoFinishExportPending, 'sprint auto export should be pending');
}

function testHeatNumberIncrementsOnPromote() {
  const wsId = 'verify009';
  demoStore.resetStore('kart-demo', wsId);
  const store = demoStore.resolveFromParts('kart-demo', wsId);
  const { assignHeatNumber } = require('../lapStats');
  store.currentHeat = [{
    kart_number: 7,
    driver_name: 'Current',
    driver_level: 'Amateur',
    lap_count: 1,
    best_lap_time: '44.000',
    lap_times: ['44.000'],
  }];
  store.nextHeat = [{
    kart_number: 7,
    driver_name: 'Next Driver',
    driver_level: 'Amateur',
    lap_count: 0,
    lap_times: [],
  }];
  assignHeatNumber(store);
  assert(demoStore.getCurrentHeatNumber(store) === 1, 'current heat should be number 1');

  store.onTrack = [{ kart_number: 7, launchedAt: Date.now(), lastLapAt: Date.now() }];
  store.pitLines[1].karts = [7];
  demoStore.finishHeat(store, { keepOnTrack: true });
  demoStore.returnKart(store, 7, 1);

  assert(demoStore.getCurrentHeatNumber(store) === 2, 'promoted next heat should increment heat number');
  assert(store.currentHeat[0].driver_name === 'Next Driver', 'next heat drivers should be active');
}

function testTimedExpiryStopsSimulationWithNextHeat() {
  const wsId = 'verify006';
  demoStore.resetStore('kart-demo', wsId);
  const store = demoStore.resolveFromParts('kart-demo', wsId);
  store.heatSettings = { type: 'time', duration: 10, timingColumns: { laps: true } };
  store.currentHeat = [{
    kart_number: 1,
    driver_name: 'Current',
    driver_level: 'Amateur',
    registered: false,
    lap_count: 2,
    last_lap_time: '44.000',
    best_lap_time: '43.500',
    lap_times: ['45.000', '43.500'],
  }];
  store.nextHeat = [{
    kart_number: 5,
    driver_name: 'Waiting',
    driver_level: 'Amateur',
    registered: false,
    lap_count: 0,
    lap_times: [],
  }];
  store.onTrack = [{
    kart_number: 1,
    launchedAt: Date.now() - 700000,
    lastLapAt: Date.now() - 45000,
    simulatedLaps: 2,
  }];
  store.heatRuntime.startedAt = Date.now() - 700000;

  const lapsBefore = store.currentHeat[0].lap_count;
  demoStore.getTimingData(store);

  assert(store.onTrack.length === 0, 'non-next kart should return to pits when next heat is queued');
  assert(store.heatFrozen, 'heat should auto-freeze after non-next kart returns');
  assert(store.currentHeat[0].driver_name === 'Current', 'current drivers kept until export ack');
  assert(store.nextHeat.length === 1, 'next heat still queued');
  assert(store.currentHeat[0].lap_count === lapsBefore, 'counted laps must not increase after expiry');
  assert(!demoStore.hasActiveTimingSession(store), 'session must not stay active after expiry');
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

function testFixedTimingColumnPrefix() {
  const {
    normalizeTimingColumnOrder,
    moveColumnOrder,
    FIXED_TIMING_COLUMN_IDS,
  } = require('../src/utils/liveTimingColumns.js');
  const order = normalizeTimingColumnOrder(['gap', 'best_lap', 'pos', 'kart_driver', 'last_lap']);
  assert(order[0] === 'pos' && order[1] === 'kart' && order[2] === 'driver', 'fixed prefix pos/kart/driver');
  assert(!order.includes('kart_driver'), 'kart_driver should migrate to kart+driver');
  const blocked = moveColumnOrder(order, 'pos', -1);
  assert(blocked[0] === 'pos', 'position column stays fixed');
  const movedGap = moveColumnOrder(order, 'gap', -1);
  assert(movedGap.indexOf('gap') >= FIXED_TIMING_COLUMN_IDS.length, 'only columns after fixed prefix move');
}

function testEnduranceRulesParsing() {
  const { parseEnduranceRules } = require('../enduranceRules');
  const rules = parseEnduranceRules('min_driver_changes=2\nviolation_penalty_sec=90');
  assert(rules.minDriverChanges === 2, 'parses min driver changes');
  assert(rules.violationPenaltySec === 90, 'parses penalty seconds');
  const rulesHe = parseEnduranceRules('חובה 2 החלפות נהג');
  assert(rulesHe.minDriverChanges === 2, 'parses Hebrew driver-change rule');
}

function testEnduranceOneHourTwoDriverChangesSimulation() {
  const enduranceRulesMod = require('../enduranceRules');
  const wsId = 'verify027';
  demoStore.resetStore('kart-demo', wsId);
  const store = demoStore.resolveFromParts('kart-demo', wsId);
  const hourMs = 60 * 60 * 1000;
  store.heatSettings = {
    type: 'endurance',
    duration: 60,
    enduranceRules: 'min_driver_changes=2\nviolation_penalty_sec=120',
  };
  store.heatRuntime.startedAt = Date.now() - hourMs * 0.9;
  store.currentHeat = [
    {
      kart_number: 5,
      driver_name: 'Team Alpha',
      team_name: 'Team Alpha',
      team_drivers: [{ name: 'A1' }, { name: 'A2' }, { name: 'A3' }],
      active_driver: 'A3',
      driver_swap_count: 2,
      lap_count: 42,
      lap_times: [],
      pit_visits: 2,
      stints: [{ driver_name: 'A1' }, { driver_name: 'A2' }],
      penalties: [],
    },
    {
      kart_number: 6,
      driver_name: 'Team Beta',
      team_name: 'Team Beta',
      team_drivers: [{ name: 'B1' }, { name: 'B2' }, { name: 'B3' }],
      active_driver: 'B1',
      driver_swap_count: 0,
      lap_count: 40,
      lap_times: [],
      pit_visits: 0,
      stints: [{ driver_name: 'B1' }],
      penalties: [],
    },
  ];
  store.onTrack = [
    { kart_number: 5, launchedAt: Date.now() - hourMs, lastLapAt: Date.now() - 50000 },
    { kart_number: 6, launchedAt: Date.now() - hourMs, lastLapAt: Date.now() - 52000 },
  ];

  enduranceRulesMod.tickEnduranceRules(store);

  const compliant = store.currentHeat.find((r) => Number(r.kart_number) === 5);
  const violator = store.currentHeat.find((r) => Number(r.kart_number) === 6);
  assert(!enduranceRulesMod.hasAutoPenalty(compliant, 'min_driver_changes'), 'compliant team avoids penalty');
  assert(enduranceRulesMod.hasAutoPenalty(violator, 'min_driver_changes'), 'team without swaps gets penalty');
  assert(violator.unserved_penalty_sec === 120, 'penalty seconds from rules');

  demoStore.finishHeat(store, { keepOnTrack: false });
  assert(store.currentHeat.length === 0, 'one-hour endurance heat can finish after rule check');
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
  await run('sprint gap uses track position', testSprintGapUsesTrackPosition);
  await run('sprint gap to car ahead', testSprintGapToCarAheadNotLeader);

  const store = setupStore();
  await run('lap recording + first lap skip for best', () => testLapRecording(store));
  await run('last lap updates each crossing', () => testLastLapUpdatesOnEachCrossing(store));
  await run('timing data sort + display fields', () => testTimingDataSortAndFields(store));
  await run('session fastest flag', () => testSessionFastestFlag(store));
  await run('simulation catch-up laps', testSimulationCatchUp);
  await run('next-heat uses on-track karts', testOnTrackKartPool);
  await run('retire does not stop heat clock', () => testRetireDoesNotStopClock());
  await run('next-heat kart stays on track after finish', () => testHeatDrainBlocksNextLaunch());
  await run('finish returns non-next karts to pits', () => testReturnNonNextHeatKartsOnFinish());
  await run('cooldown returns non-next karts to pits', () => testCooldownReturnsNonNextHeatKarts());
  await run('timed expiry stops current heat with next waiting', () => testTimedExpiryStopsSimulationWithNextHeat());
  await run('timed cooldown then auto finish', () => testTimedCooldownThenAutoFinish());
  await run('sprint clock up + cooldown lap', () => testSprintClockAndCooldown());
  await run('sprint last lap phase', () => testSprintLastLapPhase());
  await run('timed last lap phase', () => testTimedLastLapPhase());
  await run('formation laps before race clock', () => testFormationLapsBeforeRaceClock());
  await run('le mans grid deploy', () => testLeMansGridDeploy());
  await run('auto finish export metadata', () => testAutoFinishExportMetadata());
  await run('heat number increments on promote', () => testHeatNumberIncrementsOnPromote());
  await run('avg lap from lap splits', () => testAvgLapFromLapTimes());
  await run('daily heat number', () => testDailyHeatNumber());
  await run('top lap stats', () => testTopLapStats());
  await run('endurance pits stints penalties', () => testEndurancePitsAndPenalty());
  await run('fixed timing column prefix', () => testFixedTimingColumnPrefix());
  await run('endurance rules parsing', () => testEnduranceRulesParsing());
  await run('endurance 1h two driver changes simulation', () => testEnduranceOneHourTwoDriverChangesSimulation());

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
