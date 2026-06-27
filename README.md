# NorCal Thrifting

A full-stack web app that aggregates garage sales, estate sales, and thrift stores across Sacramento, the Central Valley, and Northern California — with a warm, editorial UI for searching, mapping, and saving the ones worth visiting.

Live at **[norcalthrifting.com](https://norcalthrifting.com)**.

![NorCal Thrifting](https://img.shields.io/badge/stack-React%20%2B%20Node.js-A8542C?style=flat-square) ![Database](https://img.shields.io/badge/database-Turso%20(libSQL)-6B5444?style=flat-square) ![License](https://img.shields.io/badge/license-MIT-7A8B6F?style=flat-square)

---

## What it does

**Backend**
- Scrapes Craigslist (HTML) and EstateSales.net (JSON-LD) for NorCal cities
- Parses free-text listing bodies to extract dates, times, ZIP codes, and categories
- Geocodes every sale to lat/lng using the free U.S. Census Geocoder
- Stores everything in **Turso** (cloud-hosted libSQL/SQLite)
- JWT auth (httpOnly cookie) with signup/signin and an admin role
- Accepts community-submitted sales via a rate-limited REST endpoint (5/hour/IP, requires sign-in)
- Accepts photo uploads on submissions (multer + sharp, 5 photos/8MB max)
- Auto-refreshes scrapers on a configurable cron schedule (default: 6 AM daily)
- Auto-expires old listings so results stay current

**Frontend**
- Warm, editorial design with a paper-grain texture and serif typography
- Live search with 250 ms debounce, advanced filters (date range, sale type, "open now", quick chips)
- Map view (react-leaflet + OpenStreetMap) alongside the list view
- Sign up / sign in, persistent favorites, "Add a Sale" submission modal with photo upload
- Admin dashboard: stats, listings management, user role management, manual scraper trigger
- Opens any listing in Google Maps with one click
- Gracefully falls back to bundled sample listings if the backend is unreachable

---

## Scope

NorCal Thrifting is intentionally local. The competitive advantage over national aggregators like gsalr.com is community and geography — a Sacramento-branded site with real NorCal coverage is more useful and more defensible than another national scraper.

Current and planned sources:
- **Garage sales** — Craigslist scraper (live)
- **Estate sales** — EstateSales.net scraper (live)
- **Thrift stores** — directory of 34 verified NorCal stores: Goodwill, Salvation Army, Habitat ReStore (live)
- **Flea markets & swap meets** — directory listings (planned)
- **Church, library & community sales** — community submissions (planned)
- **Find of the Day** — user-posted photos of great finds (planned — most differentiated long-term feature)

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite 8, react-leaflet 4 (map), Lucide React |
| Backend | Node.js 20+, Express 4 |
| Database | Turso (libSQL/SQLite cloud) via `@libsql/client` |
| Auth | bcryptjs + jsonwebtoken, httpOnly cookie, 30-day JWT |
| Photo uploads | multer + sharp |
| Scraping | Craigslist (axios + cheerio), EstateSales.net (axios + cheerio, JSON-LD) |
| Geocoding | U.S. Census Geocoder (free, no API key required) |
| Scheduling | node-cron |
| Hosting | Render (backend), Vercel (frontend) |

All data sources and hosting targets are free. No paid APIs in use.

---

## Project structure

```
NorCalThrifting/
├── backend/
│   ├── server.js               → Express app, routes, cron scheduling
│   ├── db.js                   → Turso/libSQL schema & query helpers (async)
│   ├── auth.js                 → JWT signing/verification, requireAuth/requireAdmin
│   ├── parser.js                → Free-text → structured data (date, time, ZIP, categories)
│   ├── geocode.js               → U.S. Census geocoder client
│   ├── refresh.js               → Runs all scrapers once
│   ├── seed.js                  → Inserts sample listings
│   ├── seed-thrift-stores.js    → Seeds the 34-store thrift directory
│   ├── routes/
│   │   ├── auth.js              → signup / signin / signout / me
│   │   ├── favorites.js         → list / toggle favorites
│   │   ├── admin.js             → stats / sales / users / manual refresh
│   │   └── uploads.js           → photo upload endpoint
│   ├── .env.example             → Copy to .env and configure
│   └── scrapers/
│       ├── craigslist.js        → HTML scraping for NorCal cities
│       └── estatesales.js       → JSON-LD scraping for CA cities
└── frontend/
    ├── index.html
    ├── vite.config.js           → Dev proxy: /api → localhost:3001
    ├── vercel.json               → Vercel deployment config
    └── src/
        ├── main.jsx
        └── norcal_thrifting.jsx → Single-file React app
```

---

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org/) v20 or later
- A free [Turso](https://turso.tech) account and database (or omit the Turso env vars for a local SQLite file)

### First-time setup (after cloning)

```powershell
# 1. Install backend dependencies
cd C:\Projects\NorCalThrifting\backend
npm install

# 2. Create the environment file
Copy-Item .env.example .env

# 3. Install frontend dependencies
cd C:\Projects\NorCalThrifting\frontend
npm install
```

Edit `backend/.env` — at minimum set a real `JWT_SECRET`. Turso vars are optional for local dev: omitting them falls back to a local `file:./data/sales.db`.

### Running the app

Open **two terminal windows** and run one command in each:

**Terminal 1 — Backend:**
```powershell
cd C:\Projects\NorCalThrifting\backend
npm run dev
```

The API starts on `http://localhost:3001`. On startup it prints how many sales are currently in the database.

**Terminal 2 — Frontend:**
```powershell
cd C:\Projects\NorCalThrifting\frontend
npm run dev
```

Then open **`http://localhost:5173`** in your browser.

> The frontend Vite dev server proxies all `/api` requests to the backend automatically. No CORS configuration needed in development.

### Populate with data

The database starts empty on a fresh clone. You have three options, which can be combined:

```powershell
cd C:\Projects\NorCalThrifting\backend

# Option A — load sample listings instantly
npm run seed

# Option B — scrape live listings from Craigslist + EstateSales.net
npm run refresh

# Option C — seed the thrift store directory (34 verified NorCal stores)
node seed-thrift-stores.js
```

---

## Environment variables

Copy `backend/.env.example` to `backend/.env` and adjust as needed:

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | Port the Express server listens on |
| `ALLOWED_ORIGINS` | `http://localhost:5173,http://localhost:3000` | Comma-separated CORS origins, or `*` |
| `TURSO_DATABASE_URL` | — | `libsql://...` from the Turso dashboard. Omit (with `TURSO_AUTH_TOKEN`) to use a local `file:./data/sales.db` instead |
| `TURSO_AUTH_TOKEN` | — | Auth token from the Turso dashboard. Not needed for `file:` URLs |
| `JWT_SECRET` | *(insecure dev fallback)* | **Required in production.** Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `JWT_EXPIRES_IN` | `30d` | JWT lifetime |
| `ADMIN_EMAILS` | — | Comma-separated emails auto-granted the admin role on sign-up |
| `CRON_SCHEDULE` | `0 6 * * *` | Cron expression for automatic scraper refresh |

Frontend (`frontend/.env`, see `frontend/.env.example`):

| Variable | Default | Description |
|---|---|---|
| `VITE_API_URL` | `/api` (dev proxy) | Set to the deployed backend URL in production, e.g. `https://norcal-thrifting-api.onrender.com/api` |

---

## API reference

### `GET /api/health`
Liveness check.
```json
{ "ok": true, "sales": 434, "now": "2026-06-27T23:00:00Z" }
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
| `sale_type` | string | e.g. `garage_sale`, `estate_sale`, `thrift_store` |
| `limit` | number | Results per page, 1–500 (default 100) |

### `GET /api/sales/:id`
Returns a single sale by ID. 404 if not found.

### `POST /api/sales`
Submit a community listing. Requires sign-in; rate-limited to 5 submissions/hour/IP.

Required fields: `title`, `address`, `city`, `state`, `sale_date`. Optional: `description`, `start_time`, `end_time`, `categories[]`, `sale_type`, `photo_urls[]` (upload via `/api/uploads` first to get URLs).

### Auth

| Endpoint | Description |
|---|---|
| `POST /api/auth/signup` | Create an account (`email`, `password`) — sets httpOnly session cookie |
| `POST /api/auth/signin` | Sign in — sets httpOnly session cookie |
| `POST /api/auth/signout` | Clears the session cookie |
| `GET /api/auth/me` | Current signed-in user, or 401 |

### Favorites *(requires sign-in)*

| Endpoint | Description |
|---|---|
| `GET /api/favorites` | List the current user's favorited sale IDs |
| `POST /api/favorites/:saleId` | Toggle a favorite on/off |

### Photo uploads *(requires sign-in)*

| Endpoint | Description |
|---|---|
| `POST /api/uploads` | Multipart upload, field `photos` (max 5 files, 8MB each) — returns hosted URLs to attach to a submission |

### Admin *(requires admin role)*

| Endpoint | Description |
|---|---|
| `GET /api/admin/stats` | Dashboard counts |
| `GET /api/admin/sales` | List/manage all sales |
| `PATCH /api/admin/sales/:id` | Edit or change status of a sale |
| `GET /api/admin/users` | List all users |
| `PATCH /api/admin/users/:id/role` | Promote/demote a user's role |
| `POST /api/admin/refresh` | Manually trigger a full scraper run |

---

## Deployment

The live site runs on three free-tier services:

- **Database** — Turso (libSQL cloud), `libsql://norcal-thrifting-voblak2.aws-us-west-2.turso.io`
- **Backend** — Render, configured via [`render.yaml`](render.yaml). Paste `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` into the Render dashboard env vars (marked `sync: false` in the manifest so they aren't committed)
- **Frontend** — Vercel, configured via [`frontend/vercel.json`](frontend/vercel.json). Set `VITE_API_URL` to the Render service URL
- **DNS** — `norcalthrifting.com` (Porkbun) points at Vercel's nameservers
- **Keep-alive** — Render's free tier spins the backend down after 15 min of inactivity, causing a slow "cold start" on the next request. A GitHub Actions workflow ([`.github/workflows/keepalive.yml`](.github/workflows/keepalive.yml)) pings `/api/health` every 10 minutes to keep it warm

---

## Expanding coverage

### Adding Craigslist cities

Edit [backend/scrapers/craigslist.js](backend/scrapers/craigslist.js) and add an entry for the new city/subdomain.

### Adding EstateSales.net cities

Edit [backend/scrapers/estatesales.js](backend/scrapers/estatesales.js) and add entries to `ESTATESALES_CITIES`:

```js
{ state: 'CA', city: 'Riverside' },       // single-word city
{ state: 'CA', city: 'San-Bernardino' },  // multi-word: use dashes
```

### Adding thrift stores / directory entries

Edit [backend/seed-thrift-stores.js](backend/seed-thrift-stores.js) and re-run `node seed-thrift-stores.js`. Upserts on `(source, source_id)`, so it's safe to re-run after edits.

### Adding a new source entirely

1. Create `backend/scrapers/yoursource.js` exporting an `async refreshAll()` function
2. Inside it, call `upsertSale({ source: 'yoursource', source_id: '<unique>', ...fields })` for each listing
3. Import and call it from [backend/refresh.js](backend/refresh.js)

The database's unique constraint on `(source, source_id)` means re-running the scraper updates existing rows instead of duplicating them.

---

## Known gaps / next steps

- **Photo storage is ephemeral** — `backend/uploads/` is local disk, which Render wipes on every redeploy. Swap for Cloudflare R2 or Backblaze B2 before relying on uploaded photos long-term.
- **Submission moderation** — community submissions go live immediately. Consider an `approved` column and review UI if spam becomes an issue.
- **Captcha** — no bot protection on the submission form yet beyond rate limiting and requiring sign-in.
- **Geocoder** — the U.S. Census Geocoder is free but slow and U.S.-only; fine at current traffic levels.

---

## Troubleshooting

**`[craigslist] {city}: feed fetch failed` / rate-limited**
Craigslist occasionally rate-limits IPs that hit many pages in quick succession. Increase the delay between requests in `scrapers/craigslist.js`, or run from a different network.

**`[estatesales] {city}: 0 cards found — selector may be stale`**
Their HTML changed. Open the city page in a browser, inspect a sale card, find a stable selector, and update the scraper.

**Empty results from `GET /api/sales`**
Run `npm run seed` for instant sample data, or `npm run refresh` for live data.

**Frontend shows "backend API isn't reachable" banner**
Locally: the backend isn't running, or isn't on port 3001. In production: this is usually a Render free-tier cold start (see [Deployment](#deployment)) — refresh after a few seconds. The frontend still works with bundled sample data in this state.

---

## License

MIT for the code. Listings are the property of their original posters and the platforms they were sourced from.
