// routes/favorites.js — Persistent favorites for authenticated users.
//
// GET  /api/favorites          — returns the current user's favorited sale IDs
// POST /api/favorites/:saleId  — toggle a favorite on/off, returns { favorited: boolean }

import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { getFavoriteIds, addFavorite, removeFavorite, hasFavorite, getSaleById } from '../db.js';

const router = Router();

// Express 4 doesn't catch rejected promises from async handlers — an
// uncaught DB error here takes down the whole process, so catch explicitly.
router.get('/', requireAuth, async (req, res) => {
  try {
    const ids = await getFavoriteIds(req.user.id);
    res.json({ ids });
  } catch (err) {
    console.error('[api] favorites list error:', err);
    res.status(500).json({ error: 'favorites_failed' });
  }
});

router.post('/:saleId', requireAuth, async (req, res) => {
  const saleId = parseInt(req.params.saleId);
  if (!saleId || isNaN(saleId)) return res.status(400).json({ error: 'invalid_sale_id' });

  try {
    const already = await hasFavorite(req.user.id, saleId);
    if (already) {
      await removeFavorite(req.user.id, saleId);
      return res.json({ favorited: false });
    }
    // The listing may have expired or been deleted since the page loaded.
    if (!(await getSaleById(saleId))) return res.status(404).json({ error: 'sale_not_found' });
    await addFavorite(req.user.id, saleId);
    res.json({ favorited: true });
  } catch (err) {
    console.error('[api] favorites toggle error:', err);
    res.status(500).json({ error: 'favorite_toggle_failed' });
  }
});

export default router;
