# NorCal Thrifting

A full-stack web app that aggregates garage sales, estate sales, and thrift stores across Sacramento, the Central Valley, and Northern California — with a warm, editorial UI for searching, mapping, and saving the ones worth visiting.

Live at **[norcalthrifting.com](https://norcalthrifting.com)**.

![NorCal Thrifting](https://img.shields.io/badge/stack-React%20%2B%20Node.js-A8542C?style=flat-square) ![Database](https://img.shields.io/badge/database-Turso%20(libSQL)-6B5444?style=flat-square) ![License](https://img.shields.io/badge/license-MIT-7A8B6F?style=flat-square)

---

## What it does

**Backend**
- Scrapes Craigslist (HTML) and EstateSales.net (JSON-LD) for NorCal cities, including the Bay Area
- Pulls thrift/vintage/consignment/antique store locations from OpenStreetMap's Overpass API (both point locations and building outlines), layered on a hand-curated baseline (34 major chains — Goodwill, Salvation Army, Habitat ReStore — plus a 56-store batch of independent Sacramento-area shops), plus a moderated "Suggest a Store" crowdsourcing queue
- Parses free-text listing bodies to extract dates, times, ZIP codes, and categories
- Geocodes sales and stores to lat/lng using the free U.S. Census Geocoder, with a Nominatim/OpenStreetMap fallback for listings that don't expose a full street address (common for estate sales pre-event-day, and Craigslist posts that only show a neighborhood)
- Stores everything in **Turso** (cloud-hosted libSQL/SQLite)
- JWT auth (httpOnly cookie) with signup/signin, Google Sign-In for regular users, and an admin role with optional TOTP two-factor authentication (QR-code setup + one-time backup codes)
- Accepts community-submitted sales via a rate-limited REST endpoint (5/hour/IP, requires sign-in)
- Accepts photo uploads on submissions — resized/re-encoded with sharp and stored on **Cloudflare R2** (5 photos/8MB max)
- Contact form backed by a DB-logged message table plus **Resend** email delivery (every submission is saved before an email is even attempted, so nothing is lost if delivery fails)
- Auto-refreshes scrapers on a configurable cron schedule (default: 6 AM daily), plus a boot-time self-heal that runs a fresh scrape immediately if the last successful run is more than 20 hours stale — covers Render free-tier restarts landing on a bad minute for the cron
- Auto-expires old listings so results stay current

**Frontend**
- Warm, editorial design with a paper-grain texture, serif typography, and a custom logo/favicon
- Live search with 250 ms debounce, advanced filters (date range, sale type, "open now", quick chips), and a city dropdown populated from real data
- Map view (react-leaflet + OpenStreetMap) alongside the list view, with an "approximate location" note on pins that come from a fallback geocode rather than an exact address
- Client-side routing: homepage, a `/thrift-stores` directory, per-listing `/listing/:id` detail pages, five SEO region landing pages (`/sacramento`, `/bay-area`, `/central-valley`, `/northern-california`, `/redding`), and a real `/contact` page
- SEO: per-page meta/OG tags, Event/LocalBusiness JSON-LD, an auto-generated `sitemap.xml`, and `robots.txt`
- Sticky, site-wide header (shared across every page) with a "Browse by Region" dropdown
- Sign up / sign in — including Google Sign-In — persistent favorites (guest favorites saved to `localStorage`, synced to the account once signed in), an "Add a Sale" submission modal with photo upload, and a "Suggest a Store" modal
- Each listing card's "via Craigslist" / "via estatesales" attribution links out to the original listing in a new tab when a source URL is available
- Admin dashboard: stats, listings management, user role management, a store-suggestion moderation queue, a contact-message viewer, 2FA setup (Security tab), and a manual scraper trigger
- Opens any listing in Google Maps with one click
- Gracefully falls back to bundled sample listings if the backend is unreachable, retrying with a longer timeout first so a real cold start doesn't need to

---

## Scope

NorCal Thrifting is intentionally local. The competitive advantage over national aggregators like gsalr.com is community and geography — a Sacramento-branded site with real NorCal coverage is more useful and more defensible than another national scraper.

Current and planned sources:
- **Garage sales** — Craigslist scraper (live)
- **Estate sales** — EstateSales.net scraper (live)
- **Thrift, vintage, consignment & antique stores** — a hand-curated baseline of 34 major-chain locations plus a 56-store batch of independent shops, topped up by ongoing OpenStreetMap discovery and community-submitted, admin-moderated suggestions (live)
- **Flea markets & swap meets** — directory listings (planned)
- **Church, library & community sales** — community submissions (planned)
- **Find of the Day** — user-posted photos of great finds (planned — most differentiated long-term feature)

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite 8, React Router 7, react-leaflet 4 (map), Lucide React |
| Backend | Node.js 20+, Express 4 |
| Database | Turso (libSQL/SQLite cloud) via `@libsql/client` |
| Auth | bcryptjs + jsonwebtoken (httpOnly cookie, 30-day JWT) · otplib (admin TOTP 2FA) · google-auth-library (Google Sign-In) |
| Photo uploads | multer + sharp, stored on Cloudflare R2 (S3-compatible, via `@aws-sdk/client-s3`) |
| Email | Resend (HTTPS API) — contact form delivery |
| Scraping | Craigslist (axios + cheerio), EstateSales.net (axios + cheerio, JSON-LD), OpenStreetMap Overpass API (nodes + building ways, thrift/vintage/antique directory) |
| Geocoding | U.S. Census Geocoder (precise addresses) + Nominatim/OpenStreetMap (city/ZIP-centroid fallback) — both free, no API key required |
| Scheduling | node-cron, plus a boot-time staleness check |
| Hosting | Render (backend), Vercel (frontend), Cloudflare R2 (photo storage) |
| Uptime monitoring | UptimeRobot (free tier, pings `/api/health` every 5 min to keep the Render backend warm) |

All data sources and hosting targets are free. No paid APIs in use.

---

## Project structure

```
NorCalThrifting/
├── backend/
│   ├── server.js                      → Express app, routes, middleware, cron scheduling
│   ├── db.js                          → Turso/libSQL schema & query helpers (async)
│   ├── auth.js                        → JWT signing/verification, requireAuth/requireAdmin, 2FA pending-token helpers
│   ├── email.js                       → Resend-based contact-form email + test-email helper
│   ├── parser.js                      → Free-text → structured data (date, time, ZIP, categories)
│   ├── geocode.js                     → U.S. Census geocoder + Nominatim fallback (geocodeApprox)
│   ├── dateUtils.js                   → Date helpers (e.g. expiry calculation)
│   ├── dedupe.js                      → Generic cross-source store name/location dedup matcher
│   ├── utils.js                       → Misc shared helpers
│   ├── refresh.js                     → Runs all scrapers once (directory scraper gated to once/week)
│   ├── seed.js                        → Inserts sample listings
│   ├── seed-thrift-stores.js          → Seeds the 34-store hand-curated chain directory
│   ├── seed-thrift-stores-curated.js  → Seeds a 56-store batch of independent Sacramento-area shops
│   ├── .env.example                   → Copy to .env and configure
│   ├── routes/
│   │   ├── auth.js                    → signup / signin / verify-2fa / google / signout / me
│   │   ├── favorites.js               → list / toggle favorites
│   │   ├── admin.js                   → stats / sales / users / suggestions / 2FA / contact messages / manual refresh
│   │   └── uploads.js                 → photo upload endpoint (Cloudflare R2)
│   └── scrapers/
│       ├── craigslist.js              → HTML scraping for NorCal cities
│       ├── estatesales.js             → JSON-LD scraping for CA cities
│       ├── directory.js               → OpenStreetMap Overpass API scraping for thrift/vintage/antique stores
│       ├── storeDedupe.js             → Store-specific dedup (chain-keyword guard, OSM node/way merge)
│       └── shared.js                  → Shared scraper helpers
└── frontend/
    ├── index.html
    ├── vite.config.js                 → Dev proxy: /api → localhost:3001
    ├── vercel.json                    → Vercel deployment config + SPA rewrite
    ├── .env.example                   → Copy to .env.local and configure
    ├── scripts/
    │   └── generate-sitemap.mjs       → Prebuild hook: fetches live listings, writes sitemap.xml
    ├── public/
    │   ├── favicon.ico, logo-header.png, apple-touch-icon.png → Branding
    │   └── robots.txt                 → Points at the sitemap
    └── src/
        ├── main.jsx                   → Entry point
        ├── App.jsx                    → Route table (react-router-dom)
        ├── Header.jsx                 → Sticky site-wide nav (region dropdown, thrift directory, contact, sign-in)
        ├── AuthContext.jsx            → Session state, shared across all pages
        ├── AuthModal.jsx              → Sign up / sign in modal, including Google Sign-In
        ├── TwoFactorSettings.jsx      → Admin Dashboard → Security tab (2FA setup/disable)
        ├── norcal_thrifting.jsx       → Homepage: search, filters, list/map toggle, favorites
        ├── SaleCard.jsx               → Shared sale/thrift-store card (homepage + location pages)
        ├── ListingDetail.jsx          → Per-listing page (/listing/:id), Event/LocalBusiness JSON-LD
        ├── ThriftDirectory.jsx        → /thrift-stores directory page
        ├── LocationLanding.jsx        → SEO region landing pages (/sacramento, /bay-area, etc.)
        ├── locations.js               → Config for the region landing pages
        ├── Contact.jsx                → /contact page (form + JSON-LD)
        ├── SubmitModal.jsx            → "Add a Sale" submission modal, with photo upload
        ├── SuggestStoreModal.jsx      → "Suggest a Store" crowdsourcing modal
        ├── ApproveSuggestionModal.jsx → Admin-side pre-filled edit/approve form
        ├── AdminDashboard.jsx         → Stats, listings/users/suggestions management, scraper trigger, contact messages
        ├── MapView.jsx                → react-leaflet map view
        ├── Field.jsx                  → Shared form field component
        ├── shared.js                  → API_URL/API_ORIGIN, resolvePhotoUrl, formatDate/formatTime, buildMapUrl
        ├── useSales.js                → Shared sales-fetching hook
        ├── useSEO.js                  → Hand-rolled title/meta/OG/canonical/JSON-LD hook
        └── styles.js                  → Shared style constants
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

Edit `backend/.env` — at minimum set a real `JWT_SECRET`. Turso vars are optional for local dev: omitting them falls back to a local `file:./data/sales.db`. Google Sign-In, Cloudflare R2 photo uploads, and Resend email are all optional for local dev too — each feature no-ops or degrades gracefully without its keys configured (see [Environment variables](#environment-variables)).

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

The database starts empty on a fresh clone. You have a few options, which can be combined:

```powershell
cd C:\Projects\NorCalThrifting\backend

# Option A — load sample listings instantly
npm run seed

# Option B — scrape live listings from Craigslist + EstateSales.net + the OSM store directory
npm run refresh

# Option C — seed the 34-store hand-curated chain directory
node seed-thrift-stores.js

# Option D — seed the 56-store curated batch of independent Sacramento-area shops
node seed-thrift-stores-curated.js
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
| `GOOGLE_CLIENT_ID` | — | OAuth client ID from Google Cloud Console — enables Google Sign-In. Same value as the frontend's `VITE_GOOGLE_CLIENT_ID` |
| `CRON_SCHEDULE` | `0 6 * * *` | Cron expression for automatic scraper refresh |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET_NAME` / `R2_PUBLIC_URL` | — | Cloudflare R2 credentials for photo uploads (S3-compatible) — required for `POST /api/uploads` to work |
| `RESEND_API_KEY` | — | Resend API key for contact-form email delivery. Without it, submissions still save to the database, just aren't emailed |
| `CONTACT_TO_EMAIL` | `hello@norcalthrifting.com` | Destination address for contact form submissions |

Frontend (`frontend/.env.local`, see `frontend/.env.example`):

| Variable | Default | Description |
|---|---|---|
| `VITE_API_URL` | `/api` (dev proxy) | Set to the deployed backend URL in production, e.g. `https://norcal-thrifting-api.onrender.com/api` |
| `VITE_GOOGLE_CLIENT_ID` | — | Same OAuth client ID as the backend's `GOOGLE_CLIENT_ID` — public value, safe to expose to the browser |

---

## API reference

### `GET /api/health`
Liveness check.
```json
{ "ok": true, "sales": 292, "now": "2026-08-07T18:37:27Z" }
```

### Sales

#### `GET /api/sales`
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
| `offset` | number | Opts into offset-based pagination (used by the homepage's infinite scroll) over the combined dated+permanent result set |

Each sale object includes `source` (e.g. `craigslist`, `estatesales`, `osm_directory`, `curated`, `suggested`, `submission`) and `source_url` — a link to the original listing, present for scraped sources and `null` for hand-curated/directory/community entries. The frontend uses `source_url` to make the "via [source]" attribution on each card clickable when it's set.

#### `GET /api/sales/:id`
Returns a single sale by ID. 404 if not found.

#### `POST /api/sales`
Submit a community listing. Requires sign-in; rate-limited to 5 submissions/hour/IP.

Required fields: `title`, `address`, `city`, `state`, `sale_date`. Optional: `description`, `start_time`, `end_time`, `categories[]`, `sale_type`, `photo_urls[]` (upload via `/api/uploads` first to get URLs). Goes live immediately — no moderation queue.

### `POST /api/suggestions`
Suggest a thrift/vintage/consignment/antique store for the directory. No auth required, rate-limited to 3/hour/IP. Goes into a moderation queue (`store_suggestions` table) for an admin to review — **never** auto-published.

Required fields: `name`, `address`, `city`, `state`. Optional: `zip`, `website`, `store_type`, `notes`.

### `POST /api/contact`
Contact form submission. No auth required, rate-limited to 3/hour/IP. Saved to the database before an email is attempted, so a submission is never lost even if Resend is unconfigured or delivery fails.

Required fields: `name`, `email`, `message`. Optional: `subject` (one of a fixed list — General Question, Report a Problem, Suggest a Store, Partnership Inquiry, Press & Media, Other).

### Auth

| Endpoint | Description |
|---|---|
| `POST /api/auth/signup` | Create an account (`email`, `password`) — sets httpOnly session cookie |
| `POST /api/auth/signin` | Sign in. If the account is an admin with 2FA enabled, returns `{ requires2fa: true, tempToken }` instead of setting a cookie |
| `POST /api/auth/verify-2fa` | Second step for a 2FA-enabled admin — `{ tempToken, code }`, `code` is either the 6-digit authenticator code or an `XXXX-XXXX` backup code; sets the session cookie on success |
| `POST /api/auth/google` | Sign in or sign up via a verified Google ID token (`{ idToken }`) — regular users only, see below |
| `POST /api/auth/signout` | Clears the session cookie |
| `GET /api/auth/me` | Current signed-in user, or 401 |

#### Google Sign-In (regular users only)

`POST /api/auth/google` verifies the ID token server-side and either signs into an existing `google_id` match, links `google_id` onto an existing password account with the same email, or creates a new `role: 'customer'` account. It **never** creates or signs into an admin account — an email that already belongs to an admin is explicitly refused (403) rather than linked, so Google Sign-In can't become a backdoor around the admin's password + 2FA flow.

#### Two-factor authentication (admin accounts only)

TOTP-based 2FA (Google Authenticator / Authy compatible, via [otplib](https://www.npmjs.com/package/otplib)) can be enabled per-admin-account from the Admin Dashboard → Security tab. Regular user accounts never see this — `signin` only ever branches into the 2FA challenge for an account that is both `role === 'admin'` and has `totp_enabled` set.

| Endpoint | Description |
|---|---|
| `GET /api/admin/2fa/status` | Whether 2FA is enabled on the current admin, and how many backup codes remain |
| `POST /api/admin/2fa/setup` | Stages a new TOTP secret, returns it plus a QR code data URL — does **not** enable 2FA yet |
| `POST /api/admin/2fa/confirm` | `{ code }` — confirms the staged secret with a real 6-digit code, enables 2FA, and returns 8 backup codes **in plaintext, shown exactly once** (only their bcrypt hashes are ever stored) |
| `POST /api/admin/2fa/disable` | `{ password }` — current password required, so a hijacked session cookie alone can't strip 2FA off the account |

**Recovery, by design, requires direct DB access.** If an admin loses both their authenticator app and their backup codes, there is intentionally no "forgot 2FA" self-service flow (e.g. an email reset link) — that would just recreate the exact account-takeover-via-email risk 2FA exists to close. To recover, someone with direct production DB access must run:

```sql
UPDATE users SET totp_enabled = 0, totp_secret = NULL, backup_codes = NULL WHERE email = 'the-locked-out-admin@example.com';
```

against the Turso database (`turso db shell <db-name>`, or the Turso dashboard's SQL console). This clears 2FA entirely; the admin can then sign in with just their password and re-run setup from the dashboard if they want 2FA on again. There is no other recovery path — treat backup codes as the real safety net and tell the admin to store them somewhere durable (password manager, printed copy in a safe) the moment they're issued, since they're shown only once.

### Favorites *(requires sign-in)*

| Endpoint | Description |
|---|---|
| `GET /api/favorites` | List the current user's favorited sale IDs |
| `POST /api/favorites/:saleId` | Toggle a favorite on/off |

Guest (logged-out) favorites persist locally via `localStorage`; they merge into the account's DB-backed favorites once the guest signs in.

### Photo uploads *(requires sign-in)*

| Endpoint | Description |
|---|---|
| `POST /api/uploads` | Multipart upload, field `photos` (max 5 files, 8MB each) — resized/re-encoded via sharp, stored on Cloudflare R2, returns public R2 URLs to attach to a submission |

### Admin *(requires admin role)*

| Endpoint | Description |
|---|---|
| `GET /api/admin/stats` | Dashboard counts (sales, pending sales, users, pending store suggestions, last scraper run) |
| `GET /api/admin/sales` | List/manage all sales, any status |
| `PATCH /api/admin/sales/:id` | Change a sale's status (`active` / `pending` / `rejected`) |
| `GET /api/admin/users` | List all users |
| `PATCH /api/admin/users/:id/role` | Promote/demote a user's role |
| `GET /api/admin/suggestions` | List store suggestions (defaults to the pending queue) |
| `POST /api/admin/suggestions/:id/approve` | Geocode and publish a suggestion as a permanent directory entry — accepts body overrides so the admin can fix typos before publishing |
| `POST /api/admin/suggestions/:id/reject` | Reject a suggestion (stays in the table for reference, just drops out of the pending queue) |
| `GET /api/admin/contact-messages` | List contact form submissions, newest first |
| `POST /api/admin/test-email` | Sends a real test email via Resend and returns the raw result — a debugging tool, doesn't sanitize errors |
| `POST /api/admin/refresh` | Manually trigger a full scraper run |

---

## Deployment

The live site runs entirely on free-tier services:

- **Database** — Turso (libSQL cloud), `libsql://norcal-thrifting-voblak2.aws-us-west-2.turso.io`
- **Backend** — Render, configured via [`render.yaml`](render.yaml). `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN` are marked `sync: false` in the manifest, so they're pasted directly into the Render dashboard's env vars rather than committed; `GOOGLE_CLIENT_ID`, the `R2_*` vars, and `RESEND_API_KEY`/`CONTACT_TO_EMAIL` were added the same way (not yet added to the manifest itself)
- **Frontend** — Vercel, configured via [`frontend/vercel.json`](frontend/vercel.json). Set `VITE_API_URL` and `VITE_GOOGLE_CLIENT_ID` in Vercel's environment variables. Vercel's GitHub webhook has occasionally failed to fire on a push (the deploy list showing no build for the new commit) — an empty commit (`git commit --allow-empty`) re-triggers it if that happens
- **Photo storage** — Cloudflare R2 (S3-compatible, free tier: 10GB storage, zero egress fees). Uploaded photos are resized/re-encoded via `sharp` and served from a public `pub-xxxx.r2.dev` URL
- **DNS** — `norcalthrifting.com` (Porkbun) points at Vercel's nameservers
- **Email** — The `/contact` page sends via **Resend**'s HTTPS API from the verified `hello@norcalthrifting.com` domain. An earlier attempt used Gmail SMTP and failed live with `ETIMEDOUT` — Render's free tier blocks outbound SMTP connections at the network level, not fixable in code, hence the switch to an HTTPS-API-based provider. Every submission is saved to the database before an email is attempted, so nothing is lost if delivery fails. The `hello@norcalthrifting.com` address itself is Porkbun free email forwarding to a personal Gmail
- **Keep-alive** — Render's free tier spins the backend down after 15 min of inactivity, causing a slow "cold start" on the next request. Originally used a GitHub Actions cron to ping `/api/health`, but GitHub's `schedule` trigger turned out to be unreliable in practice — measured real gaps of 40 minutes to nearly 6 hours despite a `*/10 * * * *` schedule, since GitHub deprioritizes scheduled workflow runs under platform load. Replaced with **UptimeRobot** (free tier), which pings `/api/health` every 5 minutes from outside GitHub's scheduler and actually does the job. As a backstop, the frontend's fetch also retries with a much longer timeout (45s) before falling back to sample data, so an occasional cold start degrades to a slower load rather than fake data

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

Three ways, depending on the store:

- **A known chain location** (Goodwill, Salvation Army, Habitat ReStore, etc.) — add it to [backend/seed-thrift-stores.js](backend/seed-thrift-stores.js) and re-run `node seed-thrift-stores.js`. This hand-curated list exists because OpenStreetMap's coverage of specific chain locations turned out to be incomplete when checked directly (only ~40% of this list had a close match in OSM data) — don't assume OSM alone covers these.
- **A known independent store** — add it to [backend/seed-thrift-stores-curated.js](backend/seed-thrift-stores-curated.js) and re-run `node seed-thrift-stores-curated.js`, or let a visitor submit it via the "Suggest a Store" form and approve it from the Admin Dashboard's Store Suggestions tab.
- **Everything else** (independents, vintage, consignment, antiques not yet known about) — these come from [backend/scrapers/directory.js](backend/scrapers/directory.js) automatically. To expand geographic coverage, add a city to `DIRECTORY_CITIES` (needs `city`, `state`, and `lat`/`lon` for the search center — a ~20km radius is queried around each point).

All three paths upsert on `(source, source_id)`, so re-running is always safe — `directory.js` additionally checks for a nearby same-chain store before inserting, so it won't double-pin a location that's already in a hand-curated list.

### Adding a new source entirely

1. Create `backend/scrapers/yoursource.js` exporting an `async refreshAll()` function
2. Inside it, call `upsertSale({ source: 'yoursource', source_id: '<unique>', ...fields })` for each listing
3. Import and call it from [backend/refresh.js](backend/refresh.js)

The database's unique constraint on `(source, source_id)` means re-running the scraper updates existing rows instead of duplicating them.

---

## Known gaps / next steps

- **Three separate city lists** — `CRAIGSLIST_CITIES` (`scrapers/craigslist.js`), `ESTATESALES_CITIES` (`scrapers/estatesales.js`), and `DIRECTORY_CITIES` (`scrapers/directory.js`) each independently hand-maintain roughly the same NorCal metros in three different shapes. A city added to one doesn't propagate to the others — this exact gap caused the Bay Area to go unscraped by the store directory for over a week after Craigslist/EstateSales.net coverage had already been added. Worth consolidating into one canonical metro list that each source's config derives from.
- **Submission moderation** — community-submitted sales (`POST /api/sales`) go live immediately, protected only by rate-limiting + requiring sign-in. (Store suggestions, by contrast, already go through an admin approval queue.) Revisit sale submissions if spam becomes an actual problem.
- **Captcha** — no bot protection on any of the public forms yet beyond rate limiting (and sign-in, for sale submissions).
- **Geocoder** — the U.S. Census Geocoder is free but slow and U.S.-only, and only matches full street addresses (no city/ZIP-only lookups) — the Nominatim fallback covers that gap for listings without a full address, at the cost of a coarser (city/ZIP-centroid) pin.
- **OSM directory data quality** — crowdsourced, so coverage and tagging (city names, addresses) are occasionally inconsistent. `directory.js` normalizes what it can (casing, a couple of known mis-tagging patterns) but isn't exhaustive. The hand-curated chain list exists specifically because OSM's coverage of those chains was found to be incomplete — don't assume it's a superset without checking.
- **No SSR/prerendering** — this is a client-rendered SPA. Dynamic per-page OG tags work for Googlebot (which executes JS) but not for bots that don't (Slack/Twitter/Facebook link-preview unfurls fall back to the static homepage OG tags baked into `index.html`). Fixing this would need SSR/prerendering (e.g. a migration to Next.js/Astro, or an edge function that prerenders just for known bot user-agents).

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

**Pushed to `main` but the live site didn't change**
For the frontend, check that Vercel actually deployed the new commit (its GitHub webhook has occasionally failed to fire) — an empty commit re-triggers it. For the backend, Render redeploys reliably on push; if a route's behavior still looks stale, confirm via `GET /api/health` that the service actually restarted.

**Directory scraper isn't picking up a new city right after deploy**
The OSM directory pass in `refresh.js` is gated to run at most once every 7 days, and isn't bypassed by the Admin Dashboard's "Trigger Scraper" button (it calls the same gated `refreshAll()`). If a new `DIRECTORY_CITIES` entry doesn't show results immediately, that's expected — either wait for the natural weekly run or run the scraper directly, bypassing the gate.

---

## License

MIT for the code. Listings are the property of their original posters and the platforms they were sourced from.
