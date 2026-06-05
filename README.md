# HAKAFAST Server

Karting live timing and track admin — Express API + React frontend.

## Local development

```bash
npm install
npm run dev          # Vite dev server (port 3000, proxies API to :5000)
npm run server       # API only (port 5000)
```

## Production (Render)

1. **Build command:** `npm install && npm run build`
2. **Start command:** `npm start` (runs build via `prestart`, then `node server.js`)
3. Set `DATABASE_URL` in Render environment variables.

Or use the included `render.yaml` Blueprint.

## Routes

| Path | Description |
|------|-------------|
| `/` | Marketing homepage |
| `/admin` | Admin panel |
| `/live-timing` | Live timing display |
| `/admin/:trackName` | Track login + admin |
