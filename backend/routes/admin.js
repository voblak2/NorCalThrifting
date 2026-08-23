import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { generateSecret, generateURI, verify as verifyTotp } from 'otplib';
import QRCode from 'qrcode';
import { requireAdmin } from '../auth.js';
import {
  getAdminSales, updateSaleStatus,
  getAllUsers, updateUserRole,
  countSales, countUsers, countPendingSales, getLastScraperRun,
  getStoreSuggestions, getStoreSuggestionById, updateStoreSuggestionStatus,
  countPendingStoreSuggestions, upsertSale,
  getUserById, setTotpSecret, enableTotp, disableTotp,
  getContactMessages,
} from '../db.js';
import { refreshAll } from '../refresh.js';
import { geocode, geocodeApprox } from '../geocode.js';
import { sendTestEmail } from '../email.js';

const router = Router();

const TOTP_ISSUER = 'NorCal Thrifting';
// Excludes 0/O/1/I/L — every character has to be told apart by ear or on a
// low-quality printout of a code someone's copying by hand from a screen.
const BACKUP_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generateBackupCode() {
  let out = '';
  for (let i = 0; i < 8; i++) {
    if (i === 4) out += '-';
    out += BACKUP_CODE_ALPHABET[crypto.randomInt(BACKUP_CODE_ALPHABET.length)];
  }
  return out;
}

// Store-suggestion "type" dropdown label → the `categories` tag vocabulary
// the rest of the directory already uses (curated batch, OSM scraper) — kept
// distinct from the dropdown labels so "Vintage Shop"/"Antique Store" etc.
// (friendlier for a public form) don't create near-duplicate tag variants
// alongside the existing "Vintage"/"Antiques".
const STORE_TYPE_CATEGORY = {
  'Thrift Store':        'Thrift Store',
  'Vintage Shop':        'Vintage',
  'Consignment Shop':    'Consignment',
  'Antique Store':       'Antiques',
  'Estate Sale Company': 'Estate Sale Company',
  'Other':               'Other',
};

// Stats overview
router.get('/stats', requireAdmin, async (req, res) => {
  try {
    const [totalSales, pendingSales, totalUsers, lastScraperRun, pendingSuggestions] = await Promise.all([
      countSales(),
      countPendingSales(),
      countUsers(),
      getLastScraperRun(),
      countPendingStoreSuggestions(),
    ]);
    res.json({ totalSales, pendingSales, totalUsers, lastScraperRun, pendingSuggestions });
  } catch (err) {
    console.error('[api] admin/stats error:', err);
    res.status(500).json({ error: 'stats_failed' });
  }
});

// List sales (all statuses)
router.get('/sales', requireAdmin, async (req, res) => {
  try {
    const sales = await getAdminSales({ status: req.query.status || null });
    res.json({ count: sales.length, sales });
  } catch (err) {
    console.error('[api] admin/sales error:', err);
    res.status(500).json({ error: 'query_failed' });
  }
});

// Update sale status
router.patch('/sales/:id', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const { status } = req.body || {};
  const allowed = ['active', 'pending', 'rejected'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: 'invalid_status', allowed });
  }
  try {
    await updateSaleStatus(id, status);
    res.json({ ok: true, id, status });
  } catch (err) {
    console.error('[api] admin/sales patch error:', err);
    res.status(500).json({ error: 'update_failed' });
  }
});

// List users
router.get('/users', requireAdmin, async (req, res) => {
  try {
    const users = await getAllUsers();
    res.json({ count: users.length, users });
  } catch (err) {
    console.error('[api] admin/users error:', err);
    res.status(500).json({ error: 'query_failed' });
  }
});

// Update user role
router.patch('/users/:id/role', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const { role } = req.body || {};
  const allowed = ['customer', 'admin'];
  if (!allowed.includes(role)) {
    return res.status(400).json({ error: 'invalid_role', allowed });
  }
  try {
    await updateUserRole(id, role);
    res.json({ ok: true, id, role });
  } catch (err) {
    console.error('[api] admin/users patch error:', err);
    res.status(500).json({ error: 'update_failed' });
  }
});

// List store suggestions (defaults to the pending moderation queue)
router.get('/suggestions', requireAdmin, async (req, res) => {
  try {
    const suggestions = await getStoreSuggestions({ status: req.query.status || 'pending' });
    res.json({ count: suggestions.length, suggestions });
  } catch (err) {
    console.error('[api] admin/suggestions error:', err);
    res.status(500).json({ error: 'query_failed' });
  }
});

// Approve a suggestion — geocodes the (optionally admin-edited) address and
// publishes it as a permanent curated directory entry. Request body fields
// are optional overrides on top of the original suggestion, so the admin
// can clean up a typo'd name/address before it goes live without having to
// resubmit the whole thing.
router.post('/suggestions/:id/approve', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const suggestion = await getStoreSuggestionById(id);
    if (!suggestion) return res.status(404).json({ error: 'not_found' });

    const body      = req.body || {};
    const name      = String(body.name ?? suggestion.name).slice(0, 200);
    const address   = String(body.address ?? suggestion.address).slice(0, 200);
    const city      = String(body.city ?? suggestion.city).slice(0, 80);
    const state     = String(body.state ?? suggestion.state).toUpperCase().slice(0, 2);
    const zip       = (body.zip !== undefined ? body.zip : suggestion.zip) || null;
    const website   = (body.website !== undefined ? body.website : suggestion.website) || null;
    const notes     = (body.notes !== undefined ? body.notes : suggestion.notes) || null;
    const storeType = body.store_type ?? suggestion.store_type;
    const category  = STORE_TYPE_CATEGORY[storeType] || 'Other';

    // Same exact-then-approximate fallback the scrapers/other submission
    // paths use — a user-submitted address is no more reliably geocodable
    // than a scraped one, so it shouldn't skip the fallback they get.
    let lat = null, lng = null, locationApprox = false;
    const g = await geocode({ address, city, state, zip });
    if (g) {
      lat = g.lat; lng = g.lng;
    } else {
      const ga = await geocodeApprox({ city, state, zip });
      if (ga) { lat = ga.lat; lng = ga.lng; locationApprox = true; }
    }

    const descriptionBits = [`${name} is a ${category.toLowerCase()} shop, suggested by a visitor.`];
    if (website) descriptionBits.push(`Website: ${website}.`);
    if (notes) descriptionBits.push(notes);

    const result = await upsertSale({
      source:          'suggested',
      source_url:      null,
      source_id:       `sug_${id}`, // stable per suggestion — re-approving (e.g. after an edit) upserts the same row rather than duplicating it
      title:           `${name} — ${city}`,
      description:     descriptionBits.join(' ').slice(0, 1000),
      address,
      address_visible: true,
      location_approx: locationApprox,
      city, state, zip,
      lat, lng,
      sale_date:  null,
      start_time: null,
      end_time:   null,
      categories: [category],
      sale_type:  'thrift_store',
      status:     'active',
      expires_at: null, // permanent — never expires
    });

    await updateStoreSuggestionStatus(id, 'approved');
    res.json({ ok: true, saleId: result.lastInsertRowid });
  } catch (err) {
    console.error('[api] admin/suggestions approve error:', err);
    res.status(500).json({ error: 'approve_failed' });
  }
});

// Reject a suggestion — stays in store_suggestions for reference (status
// change only), just drops out of the pending queue.
router.post('/suggestions/:id/reject', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const suggestion = await getStoreSuggestionById(id);
    if (!suggestion) return res.status(404).json({ error: 'not_found' });
    await updateStoreSuggestionStatus(id, 'rejected');
    res.json({ ok: true });
  } catch (err) {
    console.error('[api] admin/suggestions reject error:', err);
    res.status(500).json({ error: 'reject_failed' });
  }
});

// ─── Two-factor authentication (admin accounts only) ───────────────────────
//
// Setup is two calls: /2fa/setup stages a secret + QR code (2FA is NOT yet
// enabled), then /2fa/confirm proves the admin actually scanned it correctly
// before flipping totp_enabled on. A half-finished setup that never gets
// confirmed just leaves an unused staged secret sitting in the DB — it has
// no effect on login either way, since login only checks totp_enabled.

router.get('/2fa/status', requireAdmin, async (req, res) => {
  try {
    const user = await getUserById(req.user.id);
    const backupCodes = user.backup_codes ? JSON.parse(user.backup_codes) : [];
    res.json({
      enabled: !!user.totp_enabled,
      backupCodesRemaining: user.totp_enabled ? backupCodes.length : 0,
    });
  } catch (err) {
    console.error('[api] 2fa/status error:', err);
    res.status(500).json({ error: 'status_failed' });
  }
});

router.post('/2fa/setup', requireAdmin, async (req, res) => {
  try {
    const user = await getUserById(req.user.id);
    const secret = generateSecret();
    await setTotpSecret(user.id, secret);
    const otpauthUrl = generateURI({ issuer: TOTP_ISSUER, label: user.email, secret });
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);
    res.json({ secret, qrCodeDataUrl });
  } catch (err) {
    console.error('[api] 2fa/setup error:', err);
    res.status(500).json({ error: 'setup_failed' });
  }
});

router.post('/2fa/confirm', requireAdmin, async (req, res) => {
  const { code } = req.body || {};
  if (!code) return res.status(400).json({ error: 'missing_code' });
  try {
    const user = await getUserById(req.user.id);
    if (!user.totp_secret) return res.status(400).json({ error: 'no_pending_setup' });

    let ok = false;
    try {
      ok = (await verifyTotp({ secret: user.totp_secret, token: String(code).trim(), epochTolerance: 30 })).valid;
    } catch {
      ok = false;
    }
    if (!ok) return res.status(400).json({ error: 'invalid_code' });

    // Shown to the admin exactly once in this response — only the bcrypt
    // hashes are persisted, so there is no way to redisplay these later.
    const backupCodes = Array.from({ length: 8 }, generateBackupCode);
    const hashed = await Promise.all(backupCodes.map(c => bcrypt.hash(c, 10)));
    await enableTotp(user.id, hashed);

    res.json({ ok: true, backupCodes });
  } catch (err) {
    console.error('[api] 2fa/confirm error:', err);
    res.status(500).json({ error: 'confirm_failed' });
  }
});

// Requires the current password (not just an active session) so that a
// hijacked/stolen session cookie alone can't strip 2FA off the account.
router.post('/2fa/disable', requireAdmin, async (req, res) => {
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: 'missing_password' });
  try {
    const user = await getUserById(req.user.id);
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'invalid_password' });
    await disableTotp(user.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('[api] 2fa/disable error:', err);
    res.status(500).json({ error: 'disable_failed' });
  }
});

// List contact form submissions — read-only, newest first.
router.get('/contact-messages', requireAdmin, async (req, res) => {
  try {
    const messages = await getContactMessages();
    res.json({ count: messages.length, messages });
  } catch (err) {
    console.error('[api] admin/contact-messages error:', err);
    res.status(500).json({ error: 'query_failed' });
  }
});

// Sends a real test email through the configured SMTP transport and returns
// the raw nodemailer result (success info or the full error, unmodified) —
// this is a debugging tool, so it deliberately does not sanitize/swallow
// anything the way the contact form's own send path does.
router.post('/test-email', requireAdmin, async (req, res) => {
  try {
    const info = await sendTestEmail('voblak2@gmail.com');
    res.json({ ok: true, info });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: {
        name: err.name,
        message: err.message,
        code: err.code,
        command: err.command,
        response: err.response,
        responseCode: err.responseCode,
        stack: err.stack,
      },
    });
  }
});

// Manual scraper trigger
router.post('/refresh', requireAdmin, async (req, res) => {
  try {
    const result = await refreshAll();
    res.json({ ok: true, result });
  } catch (err) {
    console.error('[api] refresh error:', err);
    res.status(500).json({ error: 'refresh_failed', message: err.message });
  }
});

export default router;
