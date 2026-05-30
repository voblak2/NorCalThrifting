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
//   POST /api/admin/refresh               — trigger manual scraper run (admin)

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import cron from 'node-cron';
import { searchSales, getSaleById, upsertSale, countSales } from './db.js';
import { geocode } from './geocode.js';
import { requireAuth } from './auth.js';
import authRoutes from './routes/auth.js';
import favoritesRoutes from './routes/favorites.js';
import adminRoutes from './routes/admin.js';
import uploadsRoutes from './routes/uploads.js';
import { refreshAll } from './refresh.js';

const app = express();
const PORT = parseInt(process.env.PORT) || 3001;

// 5 sale submissions per IP per hour — prevents spam from authenticated accounts
const submitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: 'too_many_submissions' },
  standardHeaders: true,
  legacyHeaders: false,
});

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

app.get('/api/health', (req, res) => {
  res.json({ ok: true, sales: countSales(), now: new Date().toISOString() });
});

app.get('/api/sales', (req, res) => {
  try {
    const sales = searchSales({
      q:         req.query.q,
      city:      req.query.city,
      state:     req.query.state,
      zip:       req.query.zip,
      from:      req.query.from,
      to:        req.query.to,
      sale_type: req.query.sale_type,
      limit:     req.query.limit,
    });
    res.set('Cache-Control', 'public, max-age=300');
    res.json({ count: sales.length, sales });
  } catch (err) {
    console.error('[api] /sales error:', err);
    res.status(500).json({ error: 'search_failed' });
  }
});

app.get('/api/sales/:id', (req, res) => {
  const sale = getSaleById(parseInt(req.params.id));
  if (!sale) return res.status(404).json({ error: 'not_found' });
  res.set('Cache-Control', 'public, max-age=300');
  res.json({ sale });
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

app.listen(PORT, () => {
  console.log(`NorCal Thrifting API listening on http://localhost:${PORT}`);
  console.log(`  ${countSales()} sales currently in DB`);
});

// ---------- Helpers ----------

function addDays(isoDate, n) {
  const d = new Date(isoDate + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
