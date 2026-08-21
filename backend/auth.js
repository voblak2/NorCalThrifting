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

// A password check that still needs a TOTP/backup code before a real session
// exists gets this instead of signToken() — short-lived, carries no role, and
// is only ever returned in a JSON body (never set as the nct_token cookie),
// so it can't itself be used to authenticate anywhere. The `purpose` claim is
// belt-and-suspenders: requireAuth/optionalAuth below explicitly refuse any
// token carrying it, so even a misplaced pending token can't slip through.
export function signPendingTwoFactorToken(payload) {
  return jwt.sign({ ...payload, purpose: '2fa_pending' }, secret(), { expiresIn: '5m' });
}

export function verifyPendingTwoFactorToken(token) {
  const decoded = jwt.verify(token, secret());
  if (decoded.purpose !== '2fa_pending') throw new Error('not_a_pending_2fa_token');
  return decoded;
}

export function requireAuth(req, res, next) {
  const token = req.cookies?.nct_token;
  if (!token) return res.status(401).json({ error: 'not_authenticated' });
  try {
    const decoded = jwt.verify(token, secret());
    if (decoded.purpose === '2fa_pending') throw new Error('pending_2fa_token_not_valid_here');
    req.user = decoded;
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
    try {
      const decoded = jwt.verify(token, secret());
      if (decoded.purpose !== '2fa_pending') req.user = decoded;
    } catch {}
  }
  next();
}
