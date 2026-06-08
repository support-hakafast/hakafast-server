/**
 * Example transponder → HAKAFAST bridge for on-premise kiosk / MSI wrapper.
 * Run alongside server.js or embed in Electron main process.
 *
 * Usage:
 *   HF_TRACK=kart-demo HF_WORKSPACE=<uuid> node kiosk/transponder-bridge.example.js
 *
 * Wire your timing hardware to call postPitExit / postLap when loops fire.
 */

const BASE = process.env.HF_API_BASE || 'http://127.0.0.1:5000';
const TRACK = process.env.HF_TRACK || 'kart-demo';
const WORKSPACE = process.env.HF_WORKSPACE || '';

async function hfFetch(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hf-track': TRACK,
      'x-hf-workspace': WORKSPACE,
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

/** Magnetic loop at pit exit — starts heat clock on first kart */
export async function postPitExit(transponderId) {
  return hfFetch('/api/transponder/pit-exit', { transponder_id: transponderId });
}

/** Finish-line loop — updates last_lap_time once per crossing */
export async function postLap(transponderId, lapTimeSec) {
  return hfFetch('/api/transponder/lap', {
    transponder_id: transponderId,
    lap_time_sec: lapTimeSec,
  });
}

if (require.main === module) {
  if (!WORKSPACE) {
    console.error('Set HF_WORKSPACE to the admin workspace UUID (from browser localStorage hf_workspace_kart-demo).');
    process.exit(1);
  }
  postPitExit(process.argv[2] || '21')
    .then((r) => console.log('pit-exit', r))
    .catch((e) => console.error(e));
}
