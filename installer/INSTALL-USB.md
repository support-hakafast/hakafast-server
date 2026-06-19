# HAKAFAST — USB Installation Guide

## What you need

- USB drive with `HAKAFAST-Setup-x.x.x.exe`
- Windows 10/11 PC at the venue (64-bit)
- The venue's local network (Wi-Fi or cable) — same network as the AMB/MyLaps decoder

---

## Step 1 — Run the installer

1. Plug in the USB
2. Double-click `HAKAFAST-Setup-x.x.x.exe`
3. Click **Yes** on the UAC prompt (admin required)
4. Follow the wizard — defaults are fine:
   - Install location: `C:\Program Files\HAKAFAST`
   - Check **"Install Windows service"** — HAKAFAST will start automatically on every boot
   - Check **"Create desktop shortcuts"** — Admin and Kiosk icons on the desktop

---

## Step 2 — Run the setup wizard

After the installer finishes, a browser opens automatically at `http://127.0.0.1:5000/setup`

If it doesn't open, double-click **HAKAFAST Admin** on the desktop.

Fill in:
- **Track name** (e.g. "Speed Park")
- **Track slug** (short ID, e.g. `speed-park`) — used in all URLs
- **Number of karts**
- **Admin password** (optional but recommended)

Click **Save** — the server is now live on your local network.

---

## Step 3 — Connect the AMB/MyLaps decoder

HAKAFAST reads lap times from your **decoder box** over the local network (TCP). It does NOT connect to the magnetic loop directly — the loop talks to transponders on the karts, the decoder reads the transponders.

In the Admin panel go to **Settings → Decoder**:

| Setting | Value |
|---------|-------|
| Decoder IP | IP address of your AMB/MyLaps decoder box (e.g. `192.168.1.50`) |
| Decoder Port | `5403` (AMB/MyLaps default) |
| Transponder map | Assign each transponder ID to a kart number |

The decoder must be on the same LAN as the HAKAFAST PC.

---

## Step 4 — Open screens on other devices

Once the server is running, any device on the same Wi-Fi can open these URLs:

| Screen | URL |
|--------|-----|
| Admin panel | `http://[PC-IP]:5000/admin/[track-slug]` |
| Live timing (customers) | `http://[PC-IP]:5000/live-timing/[track-slug]` |
| Driver reception | `http://[PC-IP]:5000/reception/[track-slug]` |
| Results | `http://[PC-IP]:5000/results` |
| Kiosk booking | `http://[PC-IP]:5000/booking/[track-slug]` |

To find your PC's IP: open Command Prompt → type `ipconfig` → look for **IPv4 Address** under your network adapter.

---

## Daily use

- The server starts automatically with Windows — nothing to do
- Open Admin: double-click **HAKAFAST Admin** on the desktop
- Start a session: Admin → add drivers → assign karts → start heat

---

## Troubleshooting

**Server not starting**
```
Services → find "HAKAFAST" → Start
```
or double-click `start-hakafast.bat` on the desktop.

**No lap times coming in**
- Confirm decoder IP is correct in Settings
- Ping the decoder from the HAKAFAST PC: `ping 192.168.1.50`
- Make sure Windows Firewall allows port 5403

**Browser says "site can't be reached"**
- Wait 10 seconds after clicking the desktop shortcut (server takes a moment to start)
- Try `http://127.0.0.1:5000` directly

**Need to uninstall**
- Control Panel → Programs → HAKAFAST → Uninstall
- Or: Start menu → HAKAFAST → Uninstall

---

## Where data is stored

`C:\ProgramData\HAKAFAST\`

Back this folder up periodically — it contains all heat results, championship data, and settings.
