/**
 * Repro: Heat B prepared with 4 drivers while Heat A is still on track.
 * 2 drivers get karts from pits immediately, 2 drivers get "pending" slots
 * (kart_number=null, kart_pending=true) waiting for karts returning from
 * Heat A's track. When Heat A ends and karts complete their real cooldown
 * laps one by one (in entry order), the first 2 returning karts should be
 * allocated to fill those 2 pending slots.
 *
 * Run: node scripts/repro-pending-slots.js
 */
const demoStore = require('../demoStore');

function row(kart, name, laps = 2) {
  return {
    kart_number: kart,
    driver_name: name,
    driver_level: 'Amateur',
    lap_count: laps,
    lap_times: Array.from({ length: laps }, () => '45.000'),
  };
}

function main() {
  const wsId = 'reproPendingSlots1';
  demoStore.resetStore('kart-demo', wsId);
  const store = demoStore.resolveFromParts('kart-demo', wsId);

  // Heat A: 4 karts on track (1,2,3,4), timed heat, already expired.
  const startedAt = Date.now() - 700000;
  store.heatSettings = { type: 'time', duration: 10, exportCsv: true, exportPdf: false };
  store.heatRuntime.startedAt = startedAt;
  store.currentHeat = [
    row(1, 'A1'), row(2, 'A2'), row(3, 'A3'), row(4, 'A4'),
  ];
  store.onTrack = [1, 2, 3, 4].map((n) => ({
    kart_number: n,
    launchedAt: startedAt,
    lastLapAt: Date.now() - 5000,
    simulatedLaps: 2,
  }));

  // Heat B (next heat): 4 drivers.
  // - B1, B2 already have karts from pits (5, 6)
  // - B3, B4 are "pending" - waiting for a kart to return from track
  store.nextHeat = [
    { ...row(5, 'B1', 0), kart_pending: false },
    { ...row(6, 'B2', 0), kart_pending: false },
    { kart_number: null, driver_name: 'B3', driver_level: 'Amateur', lap_count: 0, lap_times: [], kart_pending: true },
    { kart_number: null, driver_name: 'B4', driver_level: 'Amateur', lap_count: 0, lap_times: [], kart_pending: true },
  ];

  // Pits are empty aside from lane bookkeeping.
  store.pitLines = {
    1: { name: 'Lane 1', active: true, karts: [] },
    2: { name: 'Lane 2', active: true, karts: [] },
  };

  console.log('--- Before getSessionState (Heat A time expired) ---');
  demoStore.getSessionState(store);
  console.log('heatCooldownPhase:', store.heatCooldownPhase);
  console.log('onTrack:', store.onTrack.map((o) => ({ kart: o.kart_number, pending: o.cooldownLapPending, done: o.cooldownLapDone })));
  console.log('nextHeat:', store.nextHeat.map((r) => ({ name: r.driver_name, kart: r.kart_number, pending: r.kart_pending })));

  // Karts 1,2,3,4 complete their real cooldown lap one-by-one, in entry order.
  for (const n of [1, 2, 3, 4]) {
    console.log(`\n--- Kart ${n} completes cooldown lap ---`);
    const r = demoStore.processTransponderLap(store, String(n), 45);
    console.log('result:', JSON.stringify(r));
    console.log('onTrack:', store.onTrack.map((o) => Number(o.kart_number)));
    console.log('nextHeat pending state:', store.nextHeat.map((rr) => ({ name: rr.driver_name, kart: rr.kart_number, pending: rr.kart_pending })));
    console.log('pitLines:', JSON.stringify(Object.fromEntries(Object.entries(store.pitLines).map(([k, v]) => [k, v.karts]))));
  }

  console.log('\n--- Final session state ---');
  demoStore.getSessionState(store);
  console.log('heatFrozen:', store.heatFrozen, 'autoFinishExportPending:', store.autoFinishExportPending);
  console.log('nextHeat:', store.nextHeat.map((r) => ({ name: r.driver_name, kart: r.kart_number, pending: r.kart_pending })));

  if (store.heatFrozen && store.autoFinishExportPending) {
    console.log('\n--- Acknowledge auto export ---');
    const ack = demoStore.acknowledgeAutoExport(store);
    console.log('ack onTrack:', ack.onTrack.map((o) => o.kart_number));
  }

  demoStore.getSessionState(store);
  console.log('\n--- After drain ---');
  console.log('heatFrozen:', store.heatFrozen);
  console.log('currentHeat (promoted heat B?):', store.currentHeat.map((r) => ({ name: r.driver_name, kart: r.kart_number })));
  console.log('onTrack:', store.onTrack.map((o) => Number(o.kart_number)));

  const allFilled = store.currentHeat.every((r) => r.kart_number != null && !Number.isNaN(Number(r.kart_number)));
  console.log('\nAll Heat B drivers have karts assigned:', allFilled);
  if (!allFilled) {
    console.error('FAIL: some Heat B drivers still missing karts:', store.currentHeat.filter((r) => r.kart_number == null));
    process.exit(1);
  }
  console.log('PASS');
}

main();
