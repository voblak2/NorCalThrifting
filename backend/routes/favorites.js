// routes/favorites.js — Persistent favorites for authenticated users.
//
// GET  /api/favorites          — returns the current user's favorited sale IDs
// POST /api/favorites/:saleId  — toggle a favorite on/off, returns { favorited: boolean }

import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { getFavoriteIds, addFavorite, removeFavorite, hasFavorite } from '../db.js';

const router = Router();

router.get('/', requireAuth, (req, res) => {
  const ids = getFavoriteIds(req.user.id);
  res.json({ ids });
});

router.post('/:saleId', requireAuth, (req, res) => {
  const saleId = parseInt(req.params.saleId);
  if (!saleId || isNaN(saleId)) return res.status(400).json({ error: 'invalid_sale_id' });

  const already = hasFavorite(req.user.id, saleId);
  if (already) {
    removeFavorite(req.user.id, saleId);
    res.json({ favorited: false });
  } else {
    addFavorite(req.user.id, saleId);
    res.json({ favorited: true });
  }
});

export default router;
