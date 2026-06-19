# HAKAFAST Changelog

## [1.3.0] — 2026-06-19

### Added
- **Admin walkthrough updated** — 3 new tour steps: Results History, Advance Bookings, Championship; preview step now mentions the 🏁 tab
- **Championship venue management** — link track slugs to championships; current track is auto-suggested when creating or editing; linked venues shown on list cards with "📍 this track" badge; heat history now loaded from the correct workspace
- **Championship create flow** — numbered step-by-step wizard (name → type → points → venues) instead of flat form
- **Get license button** — unlicensed tracks see a "💳 רכוש רישיון" link in the sidebar pointing to `/quote` (the pricing page)

## [1.2.0] — 2026-06-19

### Added
- **Results history viewer** — admin can push any past heat's results to the live timing screen customers are watching
  - "🏁 הצג תוצאות" button in admin sidebar opens a picker showing all saved heats
  - Selecting a heat broadcasts it to all connected clients via WebSocket
  - Live timing shows a full-screen overlay with positions, kart numbers, driver names, best laps, and lap counts
  - Sorted correctly for each heat type (sprint: most laps first, then best lap; time/endurance: best lap)
  - "הסתר תוצאות" clears the display for all customers immediately
  - Dark/light theme aware; server endpoint `POST /api/display-results`
- **Gap calculation fix** — sprint/endurance gap column no longer shows values before first full lap is complete
  - Guard: `aheadLaps === 0` → return `'—'` (prevents crossingGapSeconds from firing on the initial start-line crossing)
  - Last driver in classification (no one ahead) consistently shows `'—'`

## [1.1.0] — 2026-06-19

### Added
- **Booking & Day Planner module** (licensed feature)
  - Customer kiosk booking page at `/booking/:track` — group size, heats per person, consecutive/scattered mode, preferred time slot
  - Admin Day Planner panel (📅 button in sidebar) with 3 tabs: visual timeline, bookings list, settings
  - Booking management: approve, send to driver queue, cancel, delete
  - Manual booking creation from admin
  - Booking settings: enable/disable, max heats per person, consecutive toggle, phone required, kiosk URL
  - Server endpoints: `/api/bookings`, `/api/scheduled-events`, `/api/booking-settings`
- **HQ License Portal** at `/hq`
  - Password + HMAC-SHA1 TOTP double authentication (no external library)
  - Issue/revoke license keys per track name and slug
  - 4-hour session tokens, ±1 TOTP window tolerance
  - `scripts/hq-code.js` — CLI tool for getting current TOTP code
- **Live Preview light theme** — float panel now inherits admin light/dark theme instead of always being dark
- **Driver queue grid** — waiting drivers displayed as 2-per-row grid instead of single column list
- **Driver name disambiguation** — duplicate first names in queue get shortest unique suffix (e.g. "Moshe Co" / "Moshe Le")
- **Venue selection in championship CREATE form** — venues can be chosen when creating a new championship, not only in Settings tab
- **Mobile timing columns** — user-selected columns now show on mobile (removed CSS overrides that forced hide)
- **Hebrew installation guide** at `docs/מדריך-התקנה-לתחנות-קארטינג.md`

### Fixed
- `TypeError: Cannot read properties of null (reading 'width')` — race condition in `useDraggableResizable` when resize handle released while React updater pending
- Live preview body always dark even when admin panel in light theme
- Timing column picker chips white-on-white in light theme float
- `fonts.googleapis.com` blocked by CSP (`style-src` / `font-src` too restrictive)
- "Position" header overflowing into KART column — shortened to "Pos" / "Kart"
- "On track" and "Heat assignments" text invisible (white-on-white) in light preview
- Driver names white-on-white in light preview assignments board

### Changed
- Queue grid: `repeat(auto-fill, minmax(120px, 1fr))` → `repeat(2, 1fr)` (exactly 2 per row)
- Queue driver names: added `font-weight: 700`
- Installer staged files now include `translations.json` and `scripts/` directory

---

## [1.0.0] — 2026-05-01

- Initial release: local track server, live timing, heat management, kart assignment, championship module, AMB/MyLaps decoder support, Windows service installer
