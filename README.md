# NorCal Thrifting

A full-stack web app that aggregates garage sales, estate sales, and thrift stores across Sacramento, the Central Valley, and Northern California — with a warm, editorial UI for searching, mapping, and saving the ones worth visiting.

Live at **[norcalthrifting.com](https://norcalthrifting.com)**.

![NorCal Thrifting](https://img.shields.io/badge/stack-React%20%2B%20Node.js-A8542C?style=flat-square) ![Database](https://img.shields.io/badge/database-Turso%20(libSQL)-6B5444?style=flat-square) ![License](https://img.shields.io/badge/license-MIT-7A8B6F?style=flat-square)

---

## What it does

**Backend**
- Scrapes Craigslist (HTML) and EstateSales.net (JSON-LD) for NorCal cities
- Pulls thrift/vintage/consignment/antique store locations from OpenStreetMap's Overpass API, layered on top of a hand-curated list of major chains (Goodwill, Salvation Army, Habitat ReStore)
- Parses free-text listing bodies to extract dates, times, ZIP codes, and categories
- Geocodes sales to lat/lng using the free U.S. Census Geocoder, with a Nominatim/OpenStreetMap fallback for listings that don't expose a full street address (common for estate sales pre-event-day, and Craigslist posts that only show a neighborhood)
- Stores everything in **Turso** (cloud-hosted libSQL/SQLite)
- JWT auth (httpOnly cookie) with signup/signin and an admin role
- Accepts community-submitted sales via a rate-limited REST endpoint (5/hour/IP, requires sign-in)
- Accepts photo uploads on submissions (multer + sharp, 5 photos/8MB max)
- Auto-refreshes scrapers on a configurable cron schedule (default: 6 AM daily), plus a boot-time self-heal that runs a fresh scrape immediately if the last successful run is more than 20 hours stale — covers Render free-tier restarts landing on a bad minute for the cron
- Auto-expires old listings so results stay current

**Frontend**
- Warm, editorial design with a paper-grain texture and serif typography
- Live search with 250 ms debounce, advanced filters (date range, sale type, "open now", quick chips)
- Map view (react-leaflet + OpenStreetMap) alongside the list view, with an "approximate location" note on pins that come from a fallback geocode rather than an exact address
- Sign up / sign in, persistent favorites, "Add a Sale" submission modal with photo upload
- Admin dashboard: stats, listings management, user role management, manual scraper trigger
- Contact Us link in the header (mailto to hello@norcalthrifting.com)
- Opens any listing in Google Maps with one click
- Gracefully falls back to bundled sample listings if the backend is unreachable, retrying with a longer timeout first so a real cold start doesn't need to

---

## Scope

NorCal Thrifting is intentionally local. The competitive advantage over national aggregators like gsalr.com is community and geography — a Sacramento-branded site with real NorCal coverage is more useful and more defensible than another national scraper.

Current and planned sources:
- **Garage sales** — Craigslist scraper (live)
- **Estate sales** — EstateSales.net scraper (live)
- **Thrift, vintage, consignment & antique stores** — a hand-curated baseline of 34 major-chain locations (Goodwill, Salvation Army, Habitat ReStore), plus 50+ independent stores discovered via OpenStreetMap and growing weekly (live)
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
| Scraping | Craigslist (axios + cheerio), EstateSales.net (axios + cheerio, JSON-LD), OpenStreetMap Overpass API (thrift/vintage/antique directory) |
| Geocoding | U.S. Census Geocoder (precise addresses) + Nominatim/OpenStreetMap (city/ZIP-centroid fallback) — both free, no API key required |
| Scheduling | node-cron, plus a boot-time staleness check |
| Hosting | Render (backend), Vercel (frontend) |
| Uptime monitoring | UptimeRobot (free tier, pings `/api/health` every 5 min to keep the Render backend warm) |

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
│   ├── geocode.js               → U.S. Census geocoder + Nominatim fallback
│   ├── refresh.js               → Runs all scrapers once (directory scraper gated to once/week)
│   ├── seed.js                  → Inserts sample listings
│   ├── seed-thrift-stores.js    → Seeds the 34-store hand-curated chain directory
│   ├── routes/
│   │   ├── auth.js              → signup / signin / signout / me
│   │   ├── favorites.js         → list / toggle favorites
│   │   ├── admin.js             → stats / sales / users / manual refresh
│   │   └── uploads.js           → photo upload endpoint
│   ├── .env.example             → Copy to .env and configure
│   └── scrapers/
│       ├── craigslist.js        → HTML scraping for NorCal cities
│       ├── estatesales.js       → JSON-LD scraping for CA cities
│       └── directory.js         → OpenStreetMap Overpass API scraping for thrift/vintage/antique stores
└── frontend/
    ├── index.html
    ├── vite.config.js           → Dev proxy: /api → localhost:3001
    ├── vercel.json               → Vercel deployment config
    ├── public/
    │   └── favicon.svg           → Site favicon
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

# Option B — scrape live listings from Craigslist + EstateSales.net + the OSM store directory
npm run refresh

# Option C — seed just the hand-curated chain directory (34 verified NorCal stores)
node seed-thrift-stores.js
```

`npm run refresh` runs everything in `refresh.js`, including the OSM directory scraper — but that one only actually fetches if it's never run before or the last run is more than 7 days old, to stay polite to Overpass's free public server.

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
{ "ok": true, "sales": 292, "now": "2026-08-07T18:37:27Z" }
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
| `limit` | number | Results per page, 1–500 (default 500 — there's no pagination UI, so an unspecified limit returns everything up to the safety cap) |

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

The live site runs entirely on free-tier services:

- **Database** — Turso (libSQL cloud), `libsql://norcal-thrifting-voblak2.aws-us-west-2.turso.io`
- **Backend** — Render, configured via [`render.yaml`](render.yaml). Paste `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` into the Render dashboard env vars (marked `sync: false` in the manifest so they aren't committed)
- **Frontend** — Vercel, configured via [`frontend/vercel.json`](frontend/vercel.json). Set `VITE_API_URL` to the Render service URL
- **DNS** — `norcalthrifting.com` (Porkbun) points at Vercel's nameservers
- **Email** — `hello@norcalthrifting.com` via Porkbun's free email forwarding to a personal Gmail, with Gmail's "Send mail as" configured (SMTP through `smtp.gmail.com` with an App Password) so replies go out as that address too. The header's Contact Us link points here.
- **Keep-alive** — Render's free tier spins the backend down after 15 min of inactivity, causing a slow "cold start" on the next request. Originally used a GitHub Actions cron to ping `/api/health`, but GitHub's `schedule` trigger turned out to be unreliable in practice — measured real gaps of 40 minutes to nearly 6 hours despite a `*/10 * * * *` schedule, since GitHub deprioritizes scheduled workflow runs under platform load. Replaced with **UptimeRobot** (free tier), which pings `/api/health` every 5 minutes from outside GitHub's scheduler and actually does the job. As a backstop, the frontend's fetch also retries with a much longer timeout (45s) before falling back to sample data, so an occasional cold start degrades to a slower load rather than fake data.

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

Two ways, depending on the store:

- **A known chain location** (Goodwill, Salvation Army, Habitat ReStore, etc.) — add it to [backend/seed-thrift-stores.js](backend/seed-thrift-stores.js) and re-run `node seed-thrift-stores.js`. This hand-curated list exists because OpenStreetMap's coverage of specific chain locations turned out to be incomplete when checked directly (only ~40% of this list had a close match in OSM data) — don't assume OSM alone covers these.
- **Everything else** (independents, vintage, consignment, antiques) — these come from [backend/scrapers/directory.js](backend/scrapers/directory.js) automatically. To expand geographic coverage, add a city to `DIRECTORY_CITIES` (needs `city`, `state`, and `lat`/`lon` for the search center — a ~20km radius is queried around each point).

Both upsert on `(source, source_id)`, so re-running is always safe — `directory.js` additionally checks for a nearby same-chain store before inserting, so it won't double-pin a location that's already in the hand-curated list.

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
- **Geocoder** — the U.S. Census Geocoder is free but slow and U.S.-only, and only matches full street addresses (no city/ZIP-only lookups) — the Nominatim fallback covers that gap for listings without a full address, at the cost of a coarser (city/ZIP-centroid) pin.
- **OSM directory data quality** — crowdsourced, so coverage and tagging (city names, addresses) are occasionally inconsistent. `directory.js` normalizes what it can (casing, a couple of known mis-tagging patterns) but isn't exhaustive. The hand-curated chain list exists specifically because OSM's coverage of those chains was found to be incomplete — don't assume it's a superset without checking.
- **Directory scraper is node-only** — `directory.js` only queries OSM `node` elements, not `way`s (building outlines). Some stores mapped as building polygons rather than points aren't picked up; not fixed yet.

---

## Troubleshooting

**`[craigslist] {city}: feed fetch failed` / rate-limited**
Craigslist occasionally rate-limits IPs that hit many pages in quick succession. Increase the delay between requests in `scrapers/craigslist.js`, or run from a different network.

**`[estatesales] {city}: 0 cards found — selector may be stale`**
Their HTML changed. Open the city page in a browser, inspect a sale card, find a stable selector, and update the scraper.

**`[directory] fetch failed (attempt N/3, status 429/504)`**
Overpass's public server only allows 2 concurrent slots per IP and is shared with everyone hitting it — this is usually transient load, and `directory.js` already retries with backoff (15s/30s/60s). If a city fails all 3 attempts, it just gets skipped for that run; the weekly refresh will pick it up next time. Not something to "fix" unless it's persistent.

**Empty results from `GET /api/sales`**
Run `npm run seed` for instant sample data, or `npm run refresh` for live data.

**Frontend shows "backend API isn't reachable" banner**
Locally: the backend isn't running, or isn't on port 3001. In production: this is usually a Render free-tier cold start (see [Deployment](#deployment)) — refresh after a few seconds. The frontend still works with bundled sample data in this state.

---

## License

MIT for the code. Listings are the property of their original posters and the platforms they were sourced from.
