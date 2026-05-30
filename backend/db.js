// db.js — SQLite via Turso/libSQL (@libsql/client).
//
// TURSO_DATABASE_URL  — libsql://... from Turso dashboard (or file:./data/sales.db for local)
// TURSO_AUTH_TOKEN    — auth token from Turso dashboard (not needed for file: URLs)
//
// All exported functions are async. Schema is created on module load (top-level await).

import { createClient } from '@libsql/client';

const client = createClient({
  url:       process.env.TURSO_DATABASE_URL || 'file:./data/sales.db',
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// Schema — all columns declared upfront; IF NOT EXISTS is safe to re-run on every start.
await client.batch([
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
], 'write');

// ---------- Insert / upsert ----------

export async function upsertSale(sale) {
  const result = await client.execute({
    sql: `
      INSERT INTO sales (
        source, source_url, source_id, title, description, address,
        city, state, zip, lat, lng, sale_date, start_time, end_time,
        categories, address_visible, expires_at, sale_type, status, posted_by, photo_urls
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      sale.expires_at       ?? null,
      sale.sale_type        ?? 'garage_sale',
      sale.status           ?? 'active',
      sale.posted_by        ?? null,
      JSON.stringify(sale.photo_urls  ?? []),
    ],
  });
  return { lastInsertRowid: Number(result.lastInsertRowid) };
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
  if (opts.from) {
    where.push('(sale_date IS NULL OR sale_date >= ?)');
    args.push(opts.from);
  }
  if (opts.to) {
    where.push('(sale_date IS NULL OR sale_date <= ?)');
    args.push(opts.to);
  }
  if (opts.sale_type) {
    where.push('sale_type = ?');
    args.push(opts.sale_type);
  }

  const limit = Math.min(Math.max(parseInt(opts.limit) || 100, 1), 500);
  const result = await client.execute({
    sql: `
      SELECT * FROM sales
      WHERE ${where.join(' AND ')}
      ORDER BY
        CASE WHEN sale_date IS NULL THEN 1 ELSE 0 END,
        sale_date ASC,
        created_at DESC
      LIMIT ${limit}`,
    args,
  });
  return result.rows.map(deserialize);
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
