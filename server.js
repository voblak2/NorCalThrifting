// server.js — Express API for Saturday Finds.
//
// Routes:
//   GET  /api/health                      — liveness check
//   GET  /api/sales                       — search/list sales
//   GET  /api/sales/:id                   — get one sale
//   POST /api/sales                       — submit a new sale (user contribution)
//   POST /api/admin/refresh               — trigger a manual scraper run
//
// Environment variables (see .env.example):
//   PORT              default 3001
//   ADMIN_TOKEN       required header value for /api/admin/* routes
//   ALLOWED_ORIGINS   comma-separated list of CORS origins (default: *)
//   DB_PATH           SQLite file path (default: ./data/sales.db)
//   CRON_SCHEDULE     cron expression for auto-refresh (default: '0 6 * * *')

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import { searchSales, getSaleById, upsertSale, countSales } from './db.js';
import { geocode } from './geocode.js';
import { refreshAll } from './refresh.js';

const app = express();
const PORT = parseInt(process.env.PORT) || 3001;

// ---------- Middleware ----------

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '*').split(',').map(s => s.trim());
app.use(cors({
  origin: allowedOrigins.includes('*') ? true : allowedOrigins,
}));
app.use(express.json({ limit: '64kb' }));

// Simple request logger
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    console.log(`${req.method} ${req.url} ${res.statusCode} ${Date.now() - start}ms`);
  });
  next();
});

// ---------- Routes ----------

app.get('/api/health', (req, res) => {
  res.json({ ok: true, sales: countSales(), now: new Date().toISOString() });
});

app.get('/api/sales', (req, res) => {
  try {
    const sales = searchSales({
      q:     req.query.q,
      city:  req.query.city,
      state: req.query.state,
      zip:   req.query.zip,
      from:  req.query.from,
      to:    req.query.to,
      limit: req.query.limit,
    });
    res.json({ count: sales.length, sales });
  } catch (err) {
    console.error('[api] /sales error:', err);
    res.status(500).json({ error: 'search_failed' });
  }
});

app.get('/api/sales/:id', (req, res) => {
  const sale = getSaleById(parseInt(req.params.id));
  if (!sale) return res.status(404).json({ error: 'not_found' });
  res.json({ sale });
});

/**
 * Submit a new sale. Validates required fields, geocodes the address,
 * stores in the DB. No auth required by default — add a captcha or
 * rate-limiter before exposing publicly.
 */
app.post('/api/sales', async (req, res) => {
  const body = req.body || {};
  const required = ['title', 'address', 'city', 'state', 'sale_date'];
  const missing = required.filter(k => !body[k]);
  if (missing.length) {
    return res.status(400).json({ error: 'missing_fields', fields: missing });
  }
  if (!/^[A-Za-z]{2}$/.test(body.state)) {
    return res.status(400).json({ error: 'invalid_state' });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.sale_date)) {
    return res.status(400).json({ error: 'invalid_date_format', expected: 'YYYY-MM-DD' });
  }

  try {
    const g = await geocode({
      address: body.address, city: body.city,
      state: body.state, zip: body.zip,
    });

    const expires = addDays(body.sale_date, 1);
    const result = upsertSale({
      source: 'submission',
      source_url: null,
      source_id: 'sub_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      title: String(body.title).slice(0, 200),
      description: String(body.description || '').slice(0, 1000),
      address: String(body.address).slice(0, 200),
      address_visible: true,
      city: String(body.city).slice(0, 80),
      state: body.state.toUpperCase(),
      zip: body.zip || null,
      lat: g?.lat ?? null,
      lng: g?.lng ?? null,
      sale_date: body.sale_date,
      start_time: body.start_time || null,
      end_time: body.end_time || null,
      categories: Array.isArray(body.categories) ? body.categories.slice(0, 6) : [],
      expires_at: expires,
    });

    res.status(201).json({ ok: true, id: result.lastInsertRowid });
  } catch (err) {
    console.error('[api] submit error:', err);
    res.status(500).json({ error: 'submit_failed' });
  }
});

/**
 * Manual scraper trigger. Protected by ADMIN_TOKEN.
 */
app.post('/api/admin/refresh', async (req, res) => {
  if (!process.env.ADMIN_TOKEN || req.headers['x-admin-token'] !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  try {
    const result = await refreshAll();
    res.json({ ok: true, result });
  } catch (err) {
    console.error('[api] refresh error:', err);
    res.status(500).json({ error: 'refresh_failed', message: err.message });
  }
});

// ---------- Startup ----------

// Schedule auto-refresh. Default: every day at 6 AM local time.
const schedule = process.env.CRON_SCHEDULE || '0 6 * * *';
if (cron.validate(schedule)) {
  cron.schedule(schedule, async () => {
    console.log(`[cron] scheduled refresh starting at ${new Date().toISOString()}`);
    try { await refreshAll(); } catch (err) { console.error('[cron] refresh failed:', err); }
  });
  console.log(`[cron] auto-refresh scheduled with cron expression "${schedule}"`);
} else {
  console.warn(`[cron] invalid CRON_SCHEDULE "${schedule}" — auto-refresh disabled`);
}

app.listen(PORT, () => {
  console.log(`Saturday Finds API listening on http://localhost:${PORT}`);
  console.log(`  health:  GET  http://localhost:${PORT}/api/health`);
  console.log(`  search:  GET  http://localhost:${PORT}/api/sales?city=Sacramento`);
  console.log(`  submit:  POST http://localhost:${PORT}/api/sales`);
  console.log(`  ${countSales()} sales currently in DB`);
});

// ---------- Helpers ----------

function addDays(isoDate, n) {
  const d = new Date(isoDate + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
