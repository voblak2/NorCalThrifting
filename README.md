# Saturday Finds — Backend

A Node.js/Express API that aggregates garage sale listings from public
sources and serves them through a clean REST interface to the
`saturday_finds.jsx` React frontend.

## What it does

- **Scrapes Craigslist RSS feeds** (`gms` category) across 20 major U.S. cities
- **Scrapes EstateSales.net** for structured estate-sale listings
- **Accepts user submissions** via a public POST endpoint
- **Geocodes every sale** to lat/lng using the free U.S. Census Geocoder
- **Stores everything in SQLite** — no external database required
- **Refreshes automatically** on a cron schedule (default: 6 AM daily)
- **Auto-expires old sales** so the list stays current

## Project layout

```
saturday-finds-backend/
├── package.json
├── .env.example          → copy to .env
├── server.js             → Express app, routes, cron scheduling
├── db.js                 → SQLite schema & query helpers
├── parser.js             → free-text → structured data (date, time, ZIP, categories)
├── geocode.js            → U.S. Census geocoder client
├── refresh.js            → runs every scraper once
├── seed.js               → inserts sample data
└── scrapers/
    ├── craigslist.js     → RSS feeds, 20 cities
    └── estatesales.js    → HTML scraping
```

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Set up environment
cp .env.example .env
# Edit .env and set ADMIN_TOKEN to a real secret

# 3. Seed the DB with sample data
npm run seed

# 4. Run the server
npm start
# → API listening on http://localhost:3001

# 5. (In another terminal) Pull live data
npm run refresh
```

The frontend (`saturday_finds.jsx`) hits `http://localhost:3001/api/sales`
by default. If the API is unreachable, it gracefully falls back to its
bundled sample data so the UI still demos.

## API reference

### `GET /api/health`
Liveness check.
```json
{ "ok": true, "sales": 142, "now": "2026-04-28T12:00:00Z" }
```

### `GET /api/sales`
Search/list sales. All query params are optional.

| param | type | description |
|---|---|---|
| `q` | string | free-text (matches title, description, categories, city) |
| `city` | string | substring match, case-insensitive |
| `state` | string | exact 2-letter (e.g., `CA`) |
| `zip` | string | exact 5-digit |
| `from` | YYYY-MM-DD | sale_date >= from |
| `to` | YYYY-MM-DD | sale_date <= to |
| `limit` | number | 1–500, default 100 |

```json
{
  "count": 12,
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
      "sale_date": "2026-05-02",
      "start_time": "08:00",
      "end_time": "14:00",
      "categories": ["Furniture", "Vintage"],
      "expires_at": "2026-05-12"
    }
  ]
}
```

### `GET /api/sales/:id`
Get one sale by id.

### `POST /api/sales`
Submit a new sale. No auth — add captcha/rate-limit before exposing publicly.

```json
{
  "title": "My Garage Sale",
  "address": "123 Main St",
  "city": "Sacramento",
  "state": "CA",
  "zip": "95825",
  "sale_date": "2026-05-15",
  "start_time": "08:00",
  "end_time": "14:00",
  "description": "Furniture, books, kitchen stuff",
  "categories": ["Furniture", "Books"]
}
```

Required fields: `title`, `address`, `city`, `state`, `sale_date`.

### `POST /api/admin/refresh`
Manually trigger a scraper run. Requires `X-Admin-Token` header matching `ADMIN_TOKEN` in `.env`.

```bash
curl -X POST http://localhost:3001/api/admin/refresh \
  -H "X-Admin-Token: your-secret-here"
```

## Adding more cities

**Craigslist** — edit `scrapers/craigslist.js`:
```js
export const CRAIGSLIST_CITIES = [
  // ...existing cities...
  { sub: 'inlandempire', city: 'Riverside', state: 'CA' },
];
```
Find the subdomain in any Craigslist URL (e.g., `inlandempire.craigslist.org`).

**EstateSales.net** — edit `scrapers/estatesales.js`:
```js
export const ESTATESALES_CITIES = [
  // ...existing cities...
  { state: 'CA', city: 'Riverside' },           // single-word city
  { state: 'CA', city: 'San-Bernardino' },      // multi-word: use dashes
];
```

## Adding more sources

Each scraper exports an `async refreshAll()` function that returns
`{ total, totalErrors }`. To add a new source:

1. Create `scrapers/yoursource.js` exporting `refreshAll()`.
2. Inside it, call `upsertSale({ source: 'yoursource', source_id: <unique>, ...fields })` for each listing.
3. Import and call it from `refresh.js`.

The DB unique constraint is `(source, source_id)` so re-running the
scraper updates existing rows instead of duplicating them.

## Production considerations

- **Rate limiting**: Add `express-rate-limit` to `POST /api/sales` before
  going live. Right now anyone can spam submissions.
- **Captcha**: Add hCaptcha or Cloudflare Turnstile to the submission form.
- **Spam moderation**: Add an `approved` boolean column and a review UI.
  Currently submissions go live immediately.
- **Real geocoder**: The Census Geocoder is free but slow and U.S.-only.
  For real traffic, swap in Mapbox or Google Geocoding (paid, fast, global).
- **Caching**: Add `Cache-Control` headers to `GET /api/sales` and put
  Cloudflare in front. Listings change slowly.
- **Robots & ToS**: The Craigslist RSS feeds are explicitly published for
  syndication, but always re-check robots.txt for any source you scrape.
  EstateSales.net's TOS allows automated reading of their public listing
  pages at the time of writing — verify before deploying.
- **Error reporting**: Hook up Sentry or similar — scrapers fail silently
  by design (one site breaking shouldn't break your app), but you do
  want to know.

## Troubleshooting

**`Error: Cannot find module 'better-sqlite3'`**
The native module needs to compile during install. On Windows you may
need to install Visual Studio Build Tools; on macOS/Linux you need a
C++ toolchain (`xcode-select --install` on Mac, `apt install build-essential`
on Debian/Ubuntu).

**`[craigslist] {city}: feed fetch failed`**
Craigslist occasionally blocks IPs that hit too many feeds too fast. Slow
down the loop in `scrapers/craigslist.js` (increase the `sleep(1000)` to
2000–5000) or run from a different IP.

**`[estatesales] {city}: 0 cards found — selector may be stale`**
Their HTML changed. Open the city page in a browser, inspect a sale
card, copy a stable selector (class names with semantic meaning), and
update the `cards` query in `scrapers/estatesales.js`.

**Empty results from `GET /api/sales`**
Run `npm run seed` to populate sample data, then `npm run refresh` to
pull live data. Check the DB exists at `./data/sales.db`.

## License

MIT for the code. Listings are property of their original posters and
the platforms they were sourced from.
