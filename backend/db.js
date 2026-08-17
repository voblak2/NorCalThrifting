// db.js — SQLite via Turso/libSQL (@libsql/client).
//
// TURSO_DATABASE_URL  — libsql://... from Turso dashboard (or file:./data/sales.db for local)
// TURSO_AUTH_TOKEN    — auth token from Turso dashboard (not needed for file: URLs)
//
// All exported functions are async. Schema is created on module load (top-level await).

import { createClient } from '@libsql/client';
import { sameStoreName } from './dedupe.js';

const client = createClient({
  url:       process.env.TURSO_DATABASE_URL || 'file:./data/sales.db',
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// Schema — all columns declared upfront; IF NOT EXISTS is safe to re-run on every start.
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS sales (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    source          TEXT    NOT NULL,
    source_url      TEXT,
    source_id       TEXT,
    title           TEXT    NOT NULL,
    description     TEXT    NOT NULL DEFAULT '',
    address         TEXT,
    city            TEXT    NOT NULL,
    state           TEXT    NOT NULL,
    zip             TEXT,
    lat             REAL,
    lng             REAL,
    sale_date       TEXT,
    start_time      TEXT,
    end_time        TEXT,
    categories      TEXT    NOT NULL DEFAULT '[]',
    address_visible INTEGER NOT NULL DEFAULT 1,
    location_approx INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    expires_at      TEXT,
    posted_by       INTEGER,
    sale_type       TEXT    DEFAULT 'garage_sale',
    status          TEXT    DEFAULT 'active',
    photo_urls      TEXT    DEFAULT '[]',
    UNIQUE(source, source_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sales_state   ON sales(state)`,
  `CREATE INDEX IF NOT EXISTS idx_sales_city    ON sales(city)`,
  `CREATE INDEX IF NOT EXISTS idx_sales_zip     ON sales(zip)`,
  `CREATE INDEX IF NOT EXISTS idx_sales_date    ON sales(sale_date)`,
  `CREATE INDEX IF NOT EXISTS idx_sales_expires ON sales(expires_at)`,
  `CREATE INDEX IF NOT EXISTS idx_sales_type    ON sales(sale_type)`,
  `CREATE INDEX IF NOT EXISTS idx_sales_status  ON sales(status)`,
  `CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT    NOT NULL,
    email         TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL,
    role          TEXT    NOT NULL DEFAULT 'customer',
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS favorites (
    user_id    INTEGER NOT NULL,
    sale_id    INTEGER NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, sale_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE
  )`,
];

// Turso occasionally 502s transiently; without a retry here, that blip crashes
// the process before Express can bind to a port, which turns a few seconds of
// Turso flakiness into a full Render deploy failure.
async function initSchema(attempts = 5, delayMs = 2000) {
  for (let i = 1; i <= attempts; i++) {
    try {
      await client.batch(SCHEMA, 'write');
      return;
    } catch (err) {
      if (i === attempts) throw err;
      console.error(`[db] schema init failed (attempt ${i}/${attempts}): ${err.message}. Retrying in ${delayMs}ms...`);
      await new Promise(r => setTimeout(r, delayMs));
      delayMs *= 2;
    }
  }
}

await initSchema();

// CREATE TABLE IF NOT EXISTS above doesn't add new columns to a table that
// already exists — needed once when location_approx was introduced, and
// harmless (swallows "duplicate column") on every boot after.
try {
  await client.execute(`ALTER TABLE sales ADD COLUMN location_approx INTEGER NOT NULL DEFAULT 0`);
} catch (err) {
  if (!/duplicate column/i.test(err.message)) throw err;
}

// ---------- Insert / upsert ----------

export async function upsertSale(sale) {
  const result = await client.execute({
    sql: `
      INSERT INTO sales (
        source, source_url, source_id, title, description, address,
        city, state, zip, lat, lng, sale_date, start_time, end_time,
        categories, address_visible, location_approx, expires_at, sale_type, status, posted_by, photo_urls
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(source, source_id) DO UPDATE SET
        title=excluded.title,
        description=excluded.description,
        address=excluded.address,
        city=excluded.city,
        state=excluded.state,
        zip=excluded.zip,
        lat=excluded.lat,
        lng=excluded.lng,
        sale_date=excluded.sale_date,
        start_time=excluded.start_time,
        end_time=excluded.end_time,
        categories=excluded.categories,
        address_visible=excluded.address_visible,
        location_approx=excluded.location_approx,
        expires_at=excluded.expires_at,
        sale_type=excluded.sale_type,
        status=excluded.status`,
    args: [
      sale.source,
      sale.source_url       ?? null,
      sale.source_id        ?? null,
      sale.title,
      sale.description      ?? '',
      sale.address          ?? null,
      sale.city,
      (sale.state || '').toUpperCase(),
      sale.zip              ?? null,
      sale.lat              ?? null,
      sale.lng              ?? null,
      sale.sale_date        ?? null,
      sale.start_time       ?? null,
      sale.end_time         ?? null,
      JSON.stringify(sale.categories  ?? []),
      sale.address_visible === false ? 0 : 1,
      sale.location_approx === true ? 1 : 0,
      sale.expires_at       ?? null,
      sale.sale_type        ?? 'garage_sale',
      sale.status           ?? 'active',
      sale.posted_by        ?? null,
      JSON.stringify(sale.photo_urls  ?? []),
    ],
  });
  return { lastInsertRowid: Number(result.lastInsertRowid) };
}

// Used by the OSM directory scraper to avoid double-pinning a physical store
// that's already in the DB from another source (e.g. the hand-curated chain
// list) — a coarse bounding-box pre-filter in SQL, then exact haversine
// distance in JS for the small candidate set. No spatial extension needed
// at this data volume.
function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000, toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Chain thrift stores legitimately cluster within a few hundred meters of
// unrelated independent shops in the same commercial district (observed
// directly: a Goodwill and an unrelated "Totally Recycled" 322m apart) —
// distance alone isn't a safe duplicate signal, since a false positive here
// means silently dropping a real, distinct store. Require a shared known-
// chain keyword too, so two different businesses that happen to be close
// never get treated as the same store.
const KNOWN_CHAINS = ['goodwill', 'salvation army', 'habitat for humanity', 'st vincent de paul', 'savers', 'value village'];
function chainKeyword(name) {
  const n = (name || '').toLowerCase();
  return KNOWN_CHAINS.find(k => n.includes(k)) || null;
}

export async function findNearbyThriftStore(lat, lng, name, radiusMeters = 400) {
  const keyword = chainKeyword(name);
  if (!keyword) return false; // not a recognized chain — never treat as a duplicate of something else

  // A degree of longitude covers fewer meters than a degree of latitude
  // except at the equator — using the same delta for both under-widens the
  // longitude bound at NorCal's latitude (~36-41°N), letting real nearby
  // matches fall outside the box before the haversine check ever runs.
  const latDeg = radiusMeters / 111000;
  const lngDeg = radiusMeters / (111000 * Math.cos(lat * Math.PI / 180));
  const result = await client.execute({
    sql: `SELECT lat, lng, title FROM sales WHERE sale_type = 'thrift_store' AND lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?`,
    args: [lat - latDeg, lat + latDeg, lng - lngDeg, lng + lngDeg],
  });
  return result.rows.some(row =>
    chainKeyword(row.title) === keyword && haversineMeters(lat, lng, row.lat, row.lng) < radiusMeters
  );
}

// Generic duplicate finder — unlike findNearbyThriftStore() above (tuned
// specifically for recognized chains at a wider 400m radius), this matches
// ANY thrift-store row by name similarity within a tight 150m radius, so
// it's safe to use for arbitrary independent stores without a keyword
// allowlist (used by directory.js's node/way merge; written generically so
// a future second store-discovery source could plug into the same check).
// Returns the matching row (deserialized) or null.
export async function findDuplicateThriftStore(lat, lng, name, radiusMeters = 150) {
  if (lat == null || lng == null || !name) return null;
  const latDeg = radiusMeters / 111000;
  const lngDeg = radiusMeters / (111000 * Math.cos(lat * Math.PI / 180));
  const result = await client.execute({
    sql: `SELECT * FROM sales WHERE sale_type = 'thrift_store' AND lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?`,
    args: [lat - latDeg, lat + latDeg, lng - lngDeg, lng + lngDeg],
  });
  let best = null, bestDist = Infinity;
  for (const row of result.rows) {
    if (row.lat == null || row.lng == null) continue;
    // Titles for every thrift-store-producing source follow the "Name —
    // City" convention (see directory.js/seed-thrift-stores*.js) — splitting
    // on the em dash recovers just the business name to compare.
    const storedName = String(row.title || '').split(' — ')[0];
    if (!sameStoreName(storedName, name)) continue;
    const dist = haversineMeters(lat, lng, row.lat, row.lng);
    if (dist < radiusMeters && dist < bestDist) { best = row; bestDist = dist; }
  }
  return best ? deserialize(best) : null;
}

// Narrow, safe enrichment for merging a richer cross-source match into an
// existing thrift-store row (see scrapers/storeDedupe.js) — deliberately
// touches only description/categories, never source/source_id/lat/lng/title,
// so it can never corrupt another source's row identity or position.
export async function enrichThriftStoreDescription(id, { description, categories }) {
  await client.execute({
    sql: `UPDATE sales SET description = ?, categories = ? WHERE id = ?`,
    args: [description, JSON.stringify(categories ?? []), id],
  });
}

// ---------- Query ----------

export async function searchSales(opts = {}) {
  const where = [
    `(expires_at IS NULL OR expires_at >= date('now'))`,
    ...(opts.status === 'all' ? [] : [`status = 'active'`]),
  ];
  const args = [];

  if (opts.state && opts.state !== 'All') {
    where.push('state = ?');
    args.push(opts.state.toUpperCase());
  }
  if (opts.city) {
    where.push('LOWER(city) LIKE ?');
    args.push(`%${opts.city.toLowerCase()}%`);
  }
  if (opts.zip) {
    where.push('zip = ?');
    args.push(opts.zip);
  }
  if (opts.q) {
    where.push('(LOWER(title) LIKE ? OR LOWER(description) LIKE ? OR LOWER(categories) LIKE ? OR LOWER(city) LIKE ? OR zip LIKE ?)');
    const q = `%${opts.q.toLowerCase()}%`;
    args.push(q, q, q, q, q);
  }
  if (opts.sale_type) {
    where.push('sale_type = ?');
    args.push(opts.sale_type);
  }

  // Offset-based pagination (homepage infinite scroll): opting in by passing
  // `offset` (even 0) switches to a single query over the full combined
  // dated+permanent set, ordered deterministically, so each page is exactly
  // the next N rows with no gaps or duplicates. Unlike the legacy path below,
  // permanent (undated) rows ARE reachable here — the client just has to
  // page far enough to reach them — so there's no need to split the query.
  // Callers that never pass `offset` (every pre-existing call site) fall
  // through to the unchanged legacy path further down.
  if (opts.offset != null) {
    const pagWhere = [...where];
    const pagArgs = [...args];
    // Undated (permanent) rows always pass a date filter, matching the
    // legacy path's behavior — a thrift store has no date to fall outside
    // a range.
    if (opts.from) { pagWhere.push('(sale_date IS NULL OR sale_date >= ?)'); pagArgs.push(opts.from); }
    if (opts.to)   { pagWhere.push('(sale_date IS NULL OR sale_date <= ?)'); pagArgs.push(opts.to); }

    const pageLimit = Math.min(Math.max(parseInt(opts.limit) || 20, 1), 500);
    const offset = Math.max(parseInt(opts.offset) || 0, 0);
    const result = await client.execute({
      sql: `
        SELECT * FROM sales
        WHERE ${pagWhere.join(' AND ')}
        ORDER BY
          CASE WHEN sale_date IS NULL THEN 1 ELSE 0 END,
          sale_date ASC,
          created_at DESC,
          id ASC
        LIMIT ${pageLimit} OFFSET ${offset}`,
      args: pagArgs,
    });
    return result.rows.map(deserialize);
  }

  // Legacy path (no `offset`): dated listings (garage/estate sales) are the volatile, fast-growing set —
  // subject to `limit` and to an explicit from/to date range when given.
  const datedWhere = [...where, 'sale_date IS NOT NULL'];
  const datedArgs = [...args];
  if (opts.from) { datedWhere.push('sale_date >= ?'); datedArgs.push(opts.from); }
  if (opts.to)   { datedWhere.push('sale_date <= ?'); datedArgs.push(opts.to); }

  // No pagination UI exists, so a caller that omits limit should get
  // everything up to this safety ceiling.
  const limit = Math.min(Math.max(parseInt(opts.limit) || 500, 1), 500);
  const datedResult = await client.execute({
    sql: `
      SELECT * FROM sales
      WHERE ${datedWhere.join(' AND ')}
      ORDER BY sale_date ASC, created_at DESC
      LIMIT ${limit}`,
    args: datedArgs,
  });

  // Permanent listings (thrift stores, other directory entries with no
  // sale_date) are a small, slow-growing set — deliberately NEVER subject to
  // `limit`, so they can't be crowded out as dated listings accumulate. This
  // silently happened twice before this fix: at LIMIT 100 (2026-08-07) and
  // again at LIMIT 500 once real volume passed it (2026-08-16) — a fixed cap
  // on a combined query will always eventually be crossed again. Also never
  // filtered by from/to — an undated row has no date to fall inside or
  // outside a range, matching the previous behavior where a date filter
  // always let `sale_date IS NULL` rows through regardless of the bound.
  const permanentWhere = [...where, 'sale_date IS NULL'];
  const permanentResult = await client.execute({
    sql: `
      SELECT * FROM sales
      WHERE ${permanentWhere.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT 2000`,
    args,
  });

  return [...datedResult.rows, ...permanentResult.rows].map(deserialize);
}

export async function getSaleById(id) {
  const result = await client.execute({
    sql: 'SELECT * FROM sales WHERE id = ? LIMIT 1',
    args: [id],
  });
  return result.rows.length ? deserialize(result.rows[0]) : null;
}

export async function deleteExpired() {
  const before = await countSales();
  await client.execute(`DELETE FROM sales WHERE expires_at < date('now')`);
  // Belt-and-suspenders cleanup: expires_at is source-specific (e.g. Craigslist
  // sets a flat 14-day expiry from scrape time, decoupled from the actual
  // sale_date), so a dated listing can outlive its sale_date there. Hard-delete
  // anything more than 1 day past its sale_date, leaving sale_date IS NULL rows
  // (thrift stores, other permanent directory entries) untouched.
  await client.execute(`DELETE FROM sales WHERE sale_date IS NOT NULL AND sale_date < date('now', '-1 day')`);
  return before - await countSales();
}

export async function countSales() {
  const result = await client.execute(`SELECT COUNT(*) as n FROM sales`);
  return Number(result.rows[0]?.n ?? 0);
}

function deserialize(row) {
  return {
    id:              row.id,
    source:          row.source,
    source_url:      row.source_url,
    source_id:       row.source_id,
    title:           row.title,
    description:     row.description,
    address:         row.address,
    city:            row.city,
    state:           row.state,
    zip:             row.zip,
    lat:             row.lat,
    lng:             row.lng,
    sale_date:       row.sale_date,
    start_time:      row.start_time,
    end_time:        row.end_time,
    categories:      JSON.parse(row.categories  || '[]'),
    address_visible: !!row.address_visible,
    location_approx: !!row.location_approx,
    created_at:      row.created_at,
    expires_at:      row.expires_at,
    posted_by:       row.posted_by,
    sale_type:       row.sale_type,
    status:          row.status,
    photo_urls:      JSON.parse(row.photo_urls  || '[]'),
  };
}

// ---------- Users ----------

export async function createUser({ name, email, passwordHash, role = 'customer' }) {
  try {
    const result = await client.execute({
      sql: `INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)`,
      args: [name, email.toLowerCase(), passwordHash, role],
    });
    const id = Number(result.lastInsertRowid);
    return { id, name, email: email.toLowerCase(), role };
  } catch (err) {
    if (err.message?.includes('UNIQUE constraint failed')) throw new Error('email_taken');
    throw err;
  }
}

export async function getUserByEmail(email) {
  const result = await client.execute({
    sql: 'SELECT * FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1',
    args: [email],
  });
  return result.rows.length ? result.rows[0] : null;
}

export async function getUserById(id) {
  const result = await client.execute({
    sql: 'SELECT * FROM users WHERE id = ? LIMIT 1',
    args: [id],
  });
  return result.rows.length ? result.rows[0] : null;
}

export async function countUsers() {
  const result = await client.execute(`SELECT COUNT(*) as n FROM users`);
  return Number(result.rows[0]?.n ?? 0);
}

// ---------- Favorites ----------

export async function getFavoriteIds(userId) {
  const result = await client.execute({
    sql: 'SELECT sale_id FROM favorites WHERE user_id = ?',
    args: [userId],
  });
  return result.rows.map(r => Number(r.sale_id));
}

export async function addFavorite(userId, saleId) {
  await client.execute({
    sql: 'INSERT OR IGNORE INTO favorites (user_id, sale_id) VALUES (?, ?)',
    args: [userId, saleId],
  });
}

export async function removeFavorite(userId, saleId) {
  await client.execute({
    sql: 'DELETE FROM favorites WHERE user_id = ? AND sale_id = ?',
    args: [userId, saleId],
  });
}

export async function hasFavorite(userId, saleId) {
  const result = await client.execute({
    sql: 'SELECT 1 FROM favorites WHERE user_id = ? AND sale_id = ? LIMIT 1',
    args: [userId, saleId],
  });
  return result.rows.length > 0;
}

// ---------- Admin ----------

export async function getAdminSales({ status = null, limit = 200 } = {}) {
  const where = [`(expires_at IS NULL OR expires_at >= date('now'))`];
  const args = [];
  if (status && status !== 'all') {
    where.push('status = ?');
    args.push(status);
  }
  const result = await client.execute({
    sql: `
      SELECT * FROM sales
      WHERE ${where.join(' AND ')}
      ORDER BY
        CASE WHEN status = 'pending' THEN 0 ELSE 1 END,
        created_at DESC
      LIMIT ${Math.min(parseInt(limit) || 200, 500)}`,
    args,
  });
  return result.rows.map(deserialize);
}

export async function updateSaleStatus(id, status) {
  await client.execute({
    sql: `UPDATE sales SET status = ? WHERE id = ?`,
    args: [status, id],
  });
}

export async function getAllUsers() {
  const result = await client.execute(
    `SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC`
  );
  return result.rows.map(r => ({
    id:         r.id,
    name:       r.name,
    email:      r.email,
    role:       r.role,
    created_at: r.created_at,
  }));
}

export async function updateUserRole(userId, role) {
  await client.execute({
    sql: `UPDATE users SET role = ? WHERE id = ?`,
    args: [role, userId],
  });
}

export async function countPendingSales() {
  const result = await client.execute(
    `SELECT COUNT(*) as n FROM sales WHERE status = 'pending' AND (expires_at IS NULL OR expires_at >= date('now'))`
  );
  return Number(result.rows[0]?.n ?? 0);
}

export async function getLastScraperRun() {
  const result = await client.execute(
    `SELECT MAX(created_at) as last_run FROM sales WHERE source != 'submission'`
  );
  return result.rows[0]?.last_run ?? null;
}

export async function getLastDirectoryRefresh() {
  const result = await client.execute(
    `SELECT MAX(created_at) as last_run FROM sales WHERE source = 'osm_directory'`
  );
  return result.rows[0]?.last_run ?? null;
}
