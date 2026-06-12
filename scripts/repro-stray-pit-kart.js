/**
 * Repro: a "stray" kart (not part of the current heat's roster) sits at the
 * pit-exit (lane.karts[0]), blocking a kart further back in the queue that
 * IS part of the current heat from ever being auto-launched.
 *
 * Run: node scripts/repro-stray-pit-kart.js
 */
const demoStore = require('../demoStore');

function row(kart, name) {
  return {
    kart_number: kart,
    driver_name: name,
    driver_level: 'Amateur',
    lap_count: 0,
    lap_times: [],
  };
}

function main() {
  const wsId = 'reproStrayKart1';
  demoStore.resetStore('kart-demo', wsId);
  const store = demoStore.resolveFromParts('kart-demo', wsId);

  // Current heat (Heat 2): karts 5, 6, 15, 20. Karts 15 and 20 already on track.
  store.heatSettings = { type: 'time', duration: 10, exportCsv: true, exportPdf: false };
  store.heatRuntime.startedAt = Date.now();
  store.currentHeat = [
    row(15, 'San Diego'), row(20, 'בובה של לילה'), row(5, 'D5'), row(6, 'D6'),
  ];
  store.onTrack = [15, 20].map((n) => ({
    kart_number: n,
    launchedAt: Date.now(),
    lastLapAt: Date.now(),
    simulatedLaps: 0,
  }));
  store.nextHeat = [];

  // Pit lanes: kart 4 (stray, not in heat2) sits at the exit of lane1,
  // ahead of kart 5 (which IS in heat2). Same for lane2: kart 9 (stray)
  // ahead of kart 6.
  store.pitLines = {
    1: { name: 'טור 1', active: true, karts: [4, 5, 10] },
    2: { name: 'טור 2', active: true, karts: [9, 6] },
  };

  console.log('Before getSessionState:');
  console.log('pitLines:', JSON.stringify(Object.fromEntries(Object.entries(store.pitLines).map(([k, v]) => [k, v.karts]))));
  console.log('onTrack:', store.onTrack.map((o) => Number(o.kart_number)));

  demoStore.getSessionState(store);

  console.log('\nAfter getSessionState:');
  console.log('pitLines:', JSON.stringify(Object.fromEntries(Object.entries(store.pitLines).map(([k, v]) => [k, v.karts]))));
  console.log('onTrack:', store.onTrack.map((o) => Number(o.kart_number)));

  const onTrackNums = new Set(store.onTrack.map((o) => Number(o.kart_number)));
  const pass = onTrackNums.has(5) && onTrackNums.has(6) && onTrackNums.has(15) && onTrackNums.has(20);
  console.log('\nAll Heat 2 karts (5,6,15,20) on track:', pass);
  if (!pass) {
    console.error('FAIL');
    process.exit(1);
  }
  console.log('PASS');
}

main();
