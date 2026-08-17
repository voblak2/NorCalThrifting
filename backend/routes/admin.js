import { Router } from 'express';
import { requireAdmin } from '../auth.js';
import {
  getAdminSales, updateSaleStatus,
  getAllUsers, updateUserRole,
  countSales, countUsers, countPendingSales, getLastScraperRun,
  getStoreSuggestions, getStoreSuggestionById, updateStoreSuggestionStatus,
  countPendingStoreSuggestions, upsertSale,
} from '../db.js';
import { refreshAll } from '../refresh.js';
import { geocode, geocodeApprox } from '../geocode.js';

const router = Router();

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
