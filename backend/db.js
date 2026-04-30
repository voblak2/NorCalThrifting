// db.js — SQLite via sql.js (pure JavaScript, no native compilation).
//
// This is a drop-in replacement for the better-sqlite3 version.
// Public API (upsertSale, searchSales, getSaleById, deleteExpired, countSales)
// is identical, so server.js, seed.js, and the scrapers don't change.
//
// Trade-off: sql.js loads the entire DB into memory and we persist to
// disk on every write. That's fine for tens of thousands of sales but
// would be slow at millions of rows. For that scale, install the
// Visual Studio Build Tools and switch back to better-sqlite3.

import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

const DB_PATH = process.env.DB_PATH || './data/sales.db';
mkdirSync(dirname(DB_PATH), { recursive: true });

// sql.js needs to load its WASM file. Tell it where to find it inside node_modules.
const SQL = await initSqlJs({
  locateFile: file => `./node_modules/sql.js/dist/${file}`,
});

// Load existing DB from disk, or create a new in-memory one.
let dbInstance;
if (existsSync(DB_PATH)) {
  const fileBuffer = readFileSync(DB_PATH);
  dbInstance = new SQL.Database(fileBuffer);
} else {
  dbInstance = new SQL.Database();
}

// Schema — same as the better-sqlite3 version.
dbInstance.run(`
  CREATE TABLE IF NOT EXISTS sales (
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
    created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    expires_at      TEXT,
    UNIQUE(source, source_id)
  );
  CREATE INDEX IF NOT EXISTS idx_sales_state    ON sales(state);
  CREATE INDEX IF NOT EXISTS idx_sales_city     ON sales(city);
  CREATE INDEX IF NOT EXISTS idx_sales_zip      ON sales(zip);
  CREATE INDEX IF NOT EXISTS idx_sales_date     ON sales(sale_date);
  CREATE INDEX IF NOT EXISTS idx_sales_expires  ON sales(expires_at);
`);

// Persist DB to disk. Called after every write.
function persist() {
  const data = dbInstance.export();
  writeFileSync(DB_PATH, Buffer.from(data));
}

// Save on graceful shutdown too.
process.on('SIGINT',  () => { persist(); process.exit(0); });
process.on('SIGTERM', () => { persist(); process.exit(0); });

// ---------- Insert / upsert ----------

export function upsertSale(sale) {
  const row = {
    source:          sale.source,
    source_url:      sale.source_url       ?? null,
    source_id:       sale.source_id        ?? null,
    title:           sale.title,
    description:     sale.description      ?? '',
    address:         sale.address          ?? null,
    city:            sale.city,
    state:           (sale.state || '').toUpperCase(),
    zip:             sale.zip              ?? null,
    lat:             sale.lat              ?? null,
    lng:             sale.lng              ?? null,
    sale_date:       sale.sale_date        ?? null,
    start_time:      sale.start_time       ?? null,
    end_time:        sale.end_time         ?? null,
    categories:      JSON.stringify(sale.categories ?? []),
    address_visible: sale.address_visible === false ? 0 : 1,
    expires_at:      sale.expires_at       ?? null,
  };

  const stmt = dbInstance.prepare(`
    INSERT INTO sales (
      source, source_url, source_id, title, description, address,
      city, state, zip, lat, lng, sale_date, start_time, end_time,
      categories, address_visible, expires_at
    ) VALUES (
      :source, :source_url, :source_id, :title, :description, :address,
      :city, :state, :zip, :lat, :lng, :sale_date, :start_time, :end_time,
      :categories, :address_visible, :expires_at
    )
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
      expires_at=excluded.expires_at
  `);

  // sql.js wants prefixed param names
  const params = {};
  for (const [k, v] of Object.entries(row)) params[':' + k] = v;
  stmt.run(params);
  stmt.free();

  // Get last inserted row id
  const idResult = dbInstance.exec('SELECT last_insert_rowid() AS id');
  const lastInsertRowid = idResult[0]?.values[0]?.[0] ?? null;

  persist();
  return { lastInsertRowid };
}

// ---------- Query ----------

export function searchSales(opts = {}) {
  const where = [`(expires_at IS NULL OR expires_at >= date('now'))`];
  const params = {};

  if (opts.state && opts.state !== 'All') {
    where.push(`state = :state`);
    params[':state'] = opts.state.toUpperCase();
  }
  if (opts.city) {
    where.push(`LOWER(city) LIKE :city`);
    params[':city'] = `%${opts.city.toLowerCase()}%`;
  }
  if (opts.zip) {
    where.push(`zip = :zip`);
    params[':zip'] = opts.zip;
  }
  if (opts.q) {
    where.push(`(LOWER(title) LIKE :q OR LOWER(description) LIKE :q OR LOWER(categories) LIKE :q OR LOWER(city) LIKE :q OR zip LIKE :q)`);
    params[':q'] = `%${opts.q.toLowerCase()}%`;
  }
  if (opts.from) {
    where.push(`(sale_date IS NULL OR sale_date >= :from)`);
    params[':from'] = opts.from;
  }
  if (opts.to) {
    where.push(`(sale_date IS NULL OR sale_date <= :to)`);
    params[':to'] = opts.to;
  }

  const limit = Math.min(Math.max(parseInt(opts.limit) || 100, 1), 500);
  const sql = `
    SELECT * FROM sales
    WHERE ${where.join(' AND ')}
    ORDER BY
      CASE WHEN sale_date IS NULL THEN 1 ELSE 0 END,
      sale_date ASC,
      created_at DESC
    LIMIT ${limit}
  `;

  const stmt = dbInstance.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows.map(deserialize);
}

export function getSaleById(id) {
  const stmt = dbInstance.prepare(`SELECT * FROM sales WHERE id = :id`);
  stmt.bind({ ':id': id });
  let result = null;
  if (stmt.step()) result = deserialize(stmt.getAsObject());
  stmt.free();
  return result;
}

export function deleteExpired() {
  const before = countSales();
  dbInstance.run(`DELETE FROM sales WHERE expires_at < date('now')`);
  const removed = before - countSales();
  if (removed > 0) persist();
  return removed;
}

export function countSales() {
  const result = dbInstance.exec(`SELECT COUNT(*) as n FROM sales`);
  return result[0]?.values[0]?.[0] ?? 0;
}

function deserialize(row) {
  return {
    ...row,
    categories: JSON.parse(row.categories || '[]'),
    address_visible: !!row.address_visible,
  };
}

// Export the underlying connection for advanced use (matches the old export name)
export const db = dbInstance;