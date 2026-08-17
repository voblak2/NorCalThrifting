// server.js — Express API for NorCal Thrifting.
//
// Routes:
//   GET  /api/health                      — liveness check
//   GET  /api/sales                       — search/list sales
//   GET  /api/sales/:id                   — get one sale
//   POST /api/sales                       — submit a new sale (requires auth)
//   GET  /api/auth/me                     — current session
//   POST /api/auth/signup                 — create account
//   POST /api/auth/signin                 — sign in
//   POST /api/auth/signout                — sign out
//   GET  /api/favorites                   — current user's favorited sale IDs
//   POST /api/favorites/:saleId           — toggle a favorite
//   POST /api/suggestions                 — suggest a store for the directory (no auth)
//   POST /api/admin/refresh               — trigger manual scraper run (admin)

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import cron from 'node-cron';
import { searchSales, getSaleById, upsertSale, countSales, getLastScraperRun, createStoreSuggestion } from './db.js';
import { geocode } from './geocode.js';
import { requireAuth } from './auth.js';
import authRoutes from './routes/auth.js';
import favoritesRoutes from './routes/favorites.js';
import adminRoutes from './routes/admin.js';
import uploadsRoutes from './routes/uploads.js';
import { refreshAll } from './refresh.js';
import { addDays } from './dateUtils.js';

const app = express();
const PORT = parseInt(process.env.PORT) || 3001;

// Render sits behind a reverse proxy; trust its single hop so express-rate-limit
// reads the real client IP from X-Forwarded-For instead of bucketing everyone together.
app.set('trust proxy', 1);

// 5 sale submissions per IP per hour — prevents spam from authenticated accounts
const submitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: 'too_many_submissions' },
  standardHeaders: true,
  legacyHeaders: false,
});

// 3 store suggestions per IP per hour — this endpoint is deliberately open
// (no sign-in required, unlike /api/sales above), so it leans on IP rate
// limiting alone to keep it frictionless without being spam-open.
const suggestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: { error: 'too_many_suggestions' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Keep in sync with the dropdown in frontend/src/SuggestStoreModal.jsx.
const STORE_TYPES = ['Thrift Store', 'Vintage Shop', 'Consignment Shop', 'Antique Store', 'Estate Sale Company', 'Other'];

// ---------- Middleware ----------

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '*').split(',').map(s => s.trim());
app.use(compression());
app.use(cors({
  origin: allowedOrigins.includes('*') ? true : allowedOrigins,
  credentials: true,  // required for httpOnly cookie exchange
}));
app.use(express.json({ limit: '64kb' }));
app.use(cookieParser());
app.use('/uploads', express.static('uploads'));

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    console.log(`${req.method} ${req.url} ${res.statusCode} ${Date.now() - start}ms`);
  });
  next();
});

// ---------- Routes ----------

app.use('/api/auth', authRoutes);
app.use('/api/favorites', favoritesRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', uploadsRoutes);

app.get('/api/health', async (req, res) => {
  try {
    res.json({ ok: true, sales: await countSales(), now: new Date().toISOString() });
  } catch (err) {
    console.error('[api] /health error:', err);
    res.status(500).json({ ok: false, error: 'health_check_failed' });
  }
});

app.get('/api/sales', async (req, res) => {
  try {
    const sales = await searchSales({
      q:         req.query.q,
      city:      req.query.city,
      state:     req.query.state,
      zip:       req.query.zip,
      from:      req.query.from,
      to:        req.query.to,
      sale_type: req.query.sale_type,
      limit:     req.query.limit,
      offset:    req.query.offset,
    });
    res.set('Cache-Control', 'public, max-age=300');
    res.json({ count: sales.length, sales });
  } catch (err) {
    console.error('[api] /sales error:', err);
    res.status(500).json({ error: 'search_failed' });
  }
});

app.get('/api/sales/:id', async (req, res) => {
  try {
    const sale = await getSaleById(parseInt(req.params.id));
    if (!sale) return res.status(404).json({ error: 'not_found' });
    res.set('Cache-Control', 'public, max-age=300');
    res.json({ sale });
  } catch (err) {
    console.error('[api] /sales/:id error:', err);
    res.status(500).json({ error: 'lookup_failed' });
  }
});

/**
 * Submit a new sale. Requires an authenticated user account.
 */
app.post('/api/sales', submitLimiter, requireAuth, async (req, res) => {
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
    const result = await upsertSale({
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
      sale_type:  body.sale_type || 'garage_sale',
      photo_urls: Array.isArray(body.photo_urls) ? body.photo_urls.slice(0, 5) : [],
      posted_by:  req.user.id,
      expires_at: expires,
    });

    res.status(201).json({ ok: true, id: result.lastInsertRowid });
  } catch (err) {
    console.error('[api] submit error:', err);
    res.status(500).json({ error: 'submit_failed' });
  }
});

/**
 * Crowdsourced "Suggest a Store" — no auth required, goes into a moderation
 * queue (store_suggestions table) for an admin to review; never auto-added
 * to the live directory.
 */
app.post('/api/suggestions', suggestLimiter, async (req, res) => {
  const body = req.body || {};
  const required = ['name', 'address', 'city', 'state'];
  const missing = required.filter(k => !body[k]);
  if (missing.length) {
    return res.status(400).json({ error: 'missing_fields', fields: missing });
  }
  if (!/^[A-Za-z]{2}$/.test(body.state)) {
    return res.status(400).json({ error: 'invalid_state' });
  }

  try {
    const { id } = await createStoreSuggestion({
      name:       String(body.name).slice(0, 200),
      address:    String(body.address).slice(0, 200),
      city:       String(body.city).slice(0, 80),
      state:      body.state.toUpperCase(),
      zip:        body.zip ? String(body.zip).slice(0, 10) : null,
      website:    body.website ? String(body.website).slice(0, 300) : null,
      store_type: STORE_TYPES.includes(body.store_type) ? body.store_type : 'Other',
      notes:      body.notes ? String(body.notes).slice(0, 1000) : null,
    });
    res.status(201).json({ ok: true, id });
  } catch (err) {
    console.error('[api] suggestion submit error:', err);
    res.status(500).json({ error: 'submit_failed' });
  }
});

// ---------- Startup ----------

const schedule = process.env.CRON_SCHEDULE || '0 6 * * *';
if (cron.validate(schedule)) {
  cron.schedule(schedule, async () => {
    console.log(`[cron] scheduled refresh starting at ${new Date().toISOString()}`);
    try { await refreshAll(); } catch (err) { console.error('[cron] refresh failed:', err); }
  });
  console.log(`[cron] auto-refresh scheduled: "${schedule}"`);
} else {
  console.warn(`[cron] invalid CRON_SCHEDULE "${schedule}" — auto-refresh disabled`);
}

// Render's free tier spins down on idle, which can silently swallow the single
// daily cron tick above with no catch-up — so also self-heal on boot if the
// last successful scrape is stale (covers both "process was asleep at 6am"
// and "this is a fresh deploy that's never run it").
(async () => {
  try {
    const lastRun = await getLastScraperRun();
    const lastRunMs = lastRun ? new Date(lastRun.replace(' ', 'T') + 'Z').getTime() : null;
    const staleMs = lastRunMs ? Date.now() - lastRunMs : Infinity;
    if (staleMs > 20 * 3600_000) {
      console.log(`[cron] last successful scrape was ${lastRun ?? 'never'} — running catch-up refresh on boot`);
      refreshAll().catch(err => console.error('[cron] catch-up refresh failed:', err));
    }
  } catch (err) {
    console.error('[cron] catch-up check failed:', err);
  }
})();

app.listen(PORT, async () => {
  console.log(`NorCal Thrifting API listening on http://localhost:${PORT}`);
  console.log(`  ${await countSales()} sales currently in DB`);
});
