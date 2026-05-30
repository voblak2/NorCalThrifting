import { Router } from 'express';
import { requireAdmin } from '../auth.js';
import {
  getAdminSales, updateSaleStatus,
  getAllUsers, updateUserRole,
  countSales, countUsers, countPendingSales, getLastScraperRun,
} from '../db.js';
import { refreshAll } from '../refresh.js';

const router = Router();

// Stats overview
router.get('/stats', requireAdmin, (req, res) => {
  try {
    res.json({
      totalSales:     countSales(),
      pendingSales:   countPendingSales(),
      totalUsers:     countUsers(),
      lastScraperRun: getLastScraperRun(),
    });
  } catch (err) {
    console.error('[api] admin/stats error:', err);
    res.status(500).json({ error: 'stats_failed' });
  }
});

// List sales (all statuses)
router.get('/sales', requireAdmin, (req, res) => {
  try {
    const sales = getAdminSales({ status: req.query.status || null });
    res.json({ count: sales.length, sales });
  } catch (err) {
    console.error('[api] admin/sales error:', err);
    res.status(500).json({ error: 'query_failed' });
  }
});

// Update sale status
router.patch('/sales/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  const { status } = req.body || {};
  const allowed = ['active', 'pending', 'rejected'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: 'invalid_status', allowed });
  }
  try {
    updateSaleStatus(id, status);
    res.json({ ok: true, id, status });
  } catch (err) {
    console.error('[api] admin/sales patch error:', err);
    res.status(500).json({ error: 'update_failed' });
  }
});

// List users
router.get('/users', requireAdmin, (req, res) => {
  try {
    const users = getAllUsers();
    res.json({ count: users.length, users });
  } catch (err) {
    console.error('[api] admin/users error:', err);
    res.status(500).json({ error: 'query_failed' });
  }
});

// Update user role
router.patch('/users/:id/role', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  const { role } = req.body || {};
  const allowed = ['customer', 'admin'];
  if (!allowed.includes(role)) {
    return res.status(400).json({ error: 'invalid_role', allowed });
  }
  try {
    updateUserRole(id, role);
    res.json({ ok: true, id, role });
  } catch (err) {
    console.error('[api] admin/users patch error:', err);
    res.status(500).json({ error: 'update_failed' });
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
