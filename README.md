# Saturday Finds

A full-stack web app that aggregates garage sale and estate sale listings from public sources across the country, with a warm, editorial UI for searching and saving the ones worth visiting.

![Saturday Finds](https://img.shields.io/badge/stack-React%20%2B%20Node.js-A8542C?style=flat-square) ![SQLite](https://img.shields.io/badge/database-SQLite%20(sql.js)-6B5444?style=flat-square) ![License](https://img.shields.io/badge/license-MIT-7A8B6F?style=flat-square)

---

## What it does

**Backend**
- Scrapes Craigslist RSS feeds (`gms` category) across 20 major U.S. cities
- Scrapes EstateSales.net for structured estate sale listings
- Parses free-text listing bodies to extract dates, times, ZIP codes, and categories
- Geocodes every sale to lat/lng using the free U.S. Census Geocoder
- Stores everything in SQLite — no external database required
- Accepts community-submitted sales via a public REST endpoint
- Auto-refreshes on a configurable cron schedule (default: 6 AM daily)
- Auto-expires old listings so results stay current

**Frontend**
- Warm, editorial design with a paper-grain texture and serif typography
- Live search with 250 ms debounce — queries the backend as you type
- Filter by state; sort by date or city
- Save/heart listings for a personal shortlist
- "Add a Sale" modal to submit community listings directly to the database
- Opens any listing in Google Maps with one click
- Gracefully falls back to 16 bundled sample listings if the backend is unreachable

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite 5, Lucide React |
| Backend | Node.js 20+, Express 4 |
| Database | SQLite via sql.js (pure JS — no native compilation needed) |
| Scraping | Craigslist RSS (rss-parser), EstateSales.net (cheerio) |
| Geocoding | U.S. Census Geocoder (free, no API key required) |
| Scheduling | node-cron |

---

## Project structure

```
GarageSaleFinder/
├── backend/
│   ├── server.js             → Express app, routes, cron scheduling
│   ├── db.js                 → SQLite schema & query helpers
│   ├── parser.js             → Free-text → structured data (date, time, ZIP, categories)
│   ├── geocode.js            → U.S. Census geocoder client
│   ├── refresh.js            → Runs all scrapers once
│   ├── seed.js               → Inserts 16 sample listings
│   ├── .env.example          → Copy to .env and configure
│   ├── data/
│   │   └── sales.db          → SQLite database (gitignored)
│   └── scrapers/
│       ├── craigslist.js     → RSS feeds across 20 cities
│       └── estatesales.js    → HTML scraping
└── frontend/
    ├── index.html
    ├── vite.config.js        → Dev proxy: /api → localhost:3001
    └── src/
        ├── main.jsx
        └── saturday_finds.jsx → Single-file React app
```

---

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org/) v20 or later

### First-time setup (after cloning)

```powershell
# 1. Install backend dependencies
cd C:\Projects\GarageSaleFinder\backend
npm install

# 2. Create the environment file
Copy-Item .env.example .env

# 3. Install frontend dependencies
cd C:\Projects\GarageSaleFinder\frontend
npm install
```

The `.env` file defaults work for local development. Before going live, set `ADMIN_TOKEN` to a strong random string.

### Running the app

Open **two terminal windows** and run one command in each:

**Terminal 1 — Backend:**
```powershell
cd C:\Projects\GarageSaleFinder\backend
npm run dev
```

The API starts on `http://localhost:3001`. On startup it prints how many sales are currently in the database.

**Terminal 2 — Frontend:**
```powershell
cd C:\Projects\GarageSaleFinder\frontend
npm run dev
```

Then open **`http://localhost:5173`** in your browser.

> The frontend Vite dev server proxies all `/api` requests to the backend automatically. No CORS configuration needed in development.

### Populate with data

The database starts empty on a fresh clone. You have two options:

```powershell
# Option A — load 16 sample listings instantly
cd C:\Projects\GarageSaleFinder\backend
npm run seed

# Option B — scrape live listings from Craigslist + EstateSales.net
npm run refresh
```

### Restarting after closing VS Code (same machine)

Since `node_modules`, `.env`, and the database all stay on your local machine and are not pushed to GitHub, you only need to start the servers again — no reinstall required.

**Terminal 1:**
```powershell
cd C:\Projects\GarageSaleFinder\backend
npm run dev
```

**Terminal 2:**
```powershell
cd C:\Projects\GarageSaleFinder\frontend
npm run dev
```

Open `http://localhost:5173`. Done.

---

## Environment variables

Copy `backend/.env.example` to `backend/.env` and adjust as needed:

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | Port the Express server listens on |
| `ALLOWED_ORIGINS` | `http://localhost:5173,http://localhost:3000` | Comma-separated CORS origins, or `*` |
| `DB_PATH` | `./data/sales.db` | Path to the SQLite database file |
| `ADMIN_TOKEN` | `changeme` | Secret required for `POST /api/admin/refresh` |
| `CRON_SCHEDULE` | `0 6 * * *` | Cron expression for automatic refresh (6 AM daily) |

---

## API reference

### `GET /api/health`
Liveness check.
```json
{ "ok": true, "sales": 142, "now": "2026-05-15T12:00:00Z" }
```

### `GET /api/sales`
Search and list sales. All query params are optional.

| Param | Type | Description |
|---|---|---|
| `q` | string | Free-text search (title, description, categories, city, ZIP) |
| `city` | string | Case-insensitive substring match |
| `state` | string | Exact 2-letter code (e.g. `CA`) |
| `zip` | string | Exact 5-digit ZIP |
| `from` | YYYY-MM-DD | Only sales on or after this date |
| `to` | YYYY-MM-DD | Only sales on or before this date |
| `limit` | number | Results per page, 1–500 (default 100) |

```json
{
  "count": 3,
  "sales": [
    {
      "id": 1,
      "source": "craigslist",
      "source_url": "https://sacramento.craigslist.org/...",
      "title": "Multi-Family Garage Sale",
      "description": "Tons of stuff...",
      "address": null,
      "address_visible": false,
      "city": "Sacramento",
      "state": "CA",
      "zip": "95825",
      "lat": 38.5816,
      "lng": -121.4944,
      "sale_date": "2026-05-17",
      "start_time": "08:00",
      "end_time": "14:00",
      "categories": ["Furniture", "Vintage"],
      "expires_at": "2026-05-31"
    }
  ]
}
```

### `GET /api/sales/:id`
Returns a single sale by ID. 404 if not found.

### `POST /api/sales`
Submit a community listing. No authentication required.

Required fields: `title`, `address`, `city`, `state`, `sale_date`

```json
{
  "title": "Weekend Garage Sale",
  "address": "123 Elm Street",
  "city": "Sacramento",
  "state": "CA",
  "zip": "95825",
  "sale_date": "2026-05-24",
  "start_time": "08:00",
  "end_time": "14:00",
  "description": "Furniture, tools, kids clothes",
  "categories": ["Furniture", "Tools", "Kids"]
}
```

### `POST /api/admin/refresh`
Manually triggers a full scraper run. Requires the `X-Admin-Token` header matching `ADMIN_TOKEN` in `.env`.

```powershell
Invoke-RestMethod -Method POST http://localhost:3001/api/admin/refresh `
  -Headers @{ "X-Admin-Token" = "your-secret-here" }
```

---

## Expanding coverage

### Adding Craigslist cities

Edit [backend/scrapers/craigslist.js](backend/scrapers/craigslist.js) and add entries to `CRAIGSLIST_CITIES`:

```js
{ sub: 'inlandempire', city: 'Riverside', state: 'CA' },
```

The subdomain comes from any Craigslist URL (e.g. `inlandempire.craigslist.org`).

### Adding EstateSales.net cities

Edit [backend/scrapers/estatesales.js](backend/scrapers/estatesales.js) and add entries to `ESTATESALES_CITIES`:

```js
{ state: 'CA', city: 'Riverside' },       // single-word city
{ state: 'CA', city: 'San-Bernardino' },  // multi-word: use dashes
```

### Adding a new source entirely

1. Create `backend/scrapers/yoursource.js` exporting an `async refreshAll()` function
2. Inside it, call `upsertSale({ source: 'yoursource', source_id: '<unique>', ...fields })` for each listing
3. Import and call it from [backend/refresh.js](backend/refresh.js)

The database's unique constraint on `(source, source_id)` means re-running the scraper updates existing rows instead of duplicating them.

---

## Production notes

- **Rate limiting** — Add `express-rate-limit` to `POST /api/sales` before going live. Submissions are currently unauthenticated.
- **Captcha** — Add hCaptcha or Cloudflare Turnstile to the submission form to prevent spam.
- **Submission moderation** — Submissions go live immediately. Add an `approved` column and a review UI before opening to the public.
- **Geocoder** — The U.S. Census Geocoder is free but slow and U.S.-only. For real traffic, swap in Mapbox or Google Geocoding.
- **Caching** — Add Cloudflare or a reverse proxy in front. Listings change slowly and are well-suited to aggressive caching.
- **Error tracking** — Hook up Sentry or similar. Scrapers fail silently by design (one broken source shouldn't break the app), but you'll want visibility.
- **Terms of service** — Craigslist RSS feeds are explicitly published for syndication. EstateSales.net's public listing pages permit automated reading at time of writing. Always verify before deploying.

---

## Troubleshooting

**`[craigslist] {city}: feed fetch failed`**
Craigslist occasionally rate-limits IPs that hit many feeds in quick succession. Increase the `sleep(1000)` delay in `scrapers/craigslist.js` to 2000–5000 ms, or run from a different network.

**`[estatesales] {city}: 0 cards found — selector may be stale`**
Their HTML changed. Open the city page in a browser, inspect a sale card, find a stable selector, and update the `cards` query in `scrapers/estatesales.js`.

**Empty results from `GET /api/sales`**
Run `npm run seed` for instant sample data, or `npm run refresh` for live data. Verify the database exists at `backend/data/sales.db`.

**Frontend shows "backend API isn't reachable" banner**
The backend isn't running or isn't on port 3001. Start it with `npm run dev` from the `backend/` folder. The frontend still works with bundled sample data in this state.

---

## License

MIT for the code. Listings are the property of their original posters and the platforms they were sourced from.
