// auth.js — JWT middleware for NorCal Thrifting.
//
// Reads the signed token from the "nct_token" httpOnly cookie.
// Three middleware variants:
//   requireAuth  — 401 if not authenticated
//   requireAdmin — 403 if authenticated but not admin
//   optionalAuth — attaches req.user if authenticated, otherwise continues

import jwt from 'jsonwebtoken';

const secret = () => process.env.JWT_SECRET || 'dev-secret-please-set-JWT_SECRET-in-env';

export function signToken(payload) {
  return jwt.sign(payload, secret(), {
    expiresIn: process.env.JWT_EXPIRES_IN || '30d',
  });
}

export function requireAuth(req, res, next) {
  const token = req.cookies?.nct_token;
  if (!token) return res.status(401).json({ error: 'not_authenticated' });
  try {
    req.user = jwt.verify(token, secret());
    next();
  } catch {
    res.clearCookie('nct_token', {
      path: '/',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
    res.status(401).json({ error: 'invalid_token' });
  }
}

export function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
    next();
  });
}

export function optionalAuth(req, res, next) {
  const token = req.cookies?.nct_token;
  if (token) {
    try { req.user = jwt.verify(token, secret()); } catch {}
  }
  next();
}
