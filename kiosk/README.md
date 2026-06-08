# HAKAFAST On-Premise Kiosk

Infrastructure for packaging the admin + live timing stack as a closed-network MSI / Electron app with real transponder hardware.

## Architecture

```
┌─────────────────┐     HTTP/WS      ┌──────────────────┐
│ Transponder HW  │ ───────────────► │  server.js       │
│ (pit + finish)  │  /api/transponder│  + demoStore     │
└─────────────────┘                  └────────┬─────────┘
                                                │
┌─────────────────┐     same host             │
│ MSI WebView2 /  │ ◄─────────────────────────┘
│ Electron shell  │   /admin  /live-timing
└─────────────────┘
```

## Quick start (dev)

1. `npm run build && npm start`
2. Open admin — copy workspace id from browser DevTools: `localStorage.getItem('hf_workspace_kart-demo')`
3. Test transponder bridge:

```bash
set HF_WORKSPACE=<your-uuid>
node kiosk/transponder-bridge.example.js 21
```

## API contract

See [`manifest.json`](./manifest.json) for full endpoint list.

| Event | Endpoint | When |
|-------|----------|------|
| Pit exit | `POST /api/transponder/pit-exit` | Kart passes pit-out loop — launches kart |
| Pit entry | `POST /api/transponder/pit-entry` or TranX pit-in loop | Kart returns to pit queue |
| Lap | `POST /api/transponder/lap` | Kart crosses finish magnetic loop — sets `last_lap_time`, increments laps |

Both require headers:

- `x-hf-track`: track slug
- `x-hf-workspace`: per-device workspace UUID

## MSI packaging notes

- Set `HF_KIOSK_MODE=1` in the Windows service / shortcut environment.
- Point WebView2 start URL to `http://127.0.0.1:5000/admin/<track-slug>`.
- Optional fixed `HF_WORKSPACE_ID` for single-station installs.
- Transponder DLL / serial driver should call `postPitExit` / `postLap` from `transponder-bridge.example.js` (or reimplement in C#).

## Password / security

Isolated workspace tracks (`kart-demo`, etc.) skip server login HTML. Admin password is optional and stored per workspace in **Advanced Settings** — only enforced inside the admin UI when set after workspace reset.
