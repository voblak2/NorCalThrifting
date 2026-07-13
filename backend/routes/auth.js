// routes/auth.js — Sign-up, sign-in, sign-out, and session check.
//
// POST /api/auth/signup  — create account, returns user + sets cookie
// POST /api/auth/signin  — authenticate, returns user + sets cookie
// POST /api/auth/signout — clears the auth cookie
// GET  /api/auth/me      — returns current user from cookie (or 401)

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { createUser, getUserByEmail, getUserById } from '../db.js';
import { signToken, requireAuth } from '../auth.js';

const router = Router();

// Emails listed in ADMIN_EMAILS env var are auto-elevated to admin on signup.
// Comma-separated: ADMIN_EMAILS=you@example.com,other@example.com
const ADMIN_EMAILS = new Set(
  (process.env.ADMIN_EMAILS || '')
    .split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
);

// Frontend (Vercel) and backend (Render) live on different domains, so every
// authenticated fetch is cross-site — SameSite=Lax would silently drop the
// cookie on all of them except the response that sets it. SameSite=None
// requires Secure, which is already tied to NODE_ENV=production.
const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  path: '/',
};

// ─── Sign up ──────────────────────────────────────────────────────────────────

router.post('/signup', async (req, res) => {
  const { name, email, password } = req.body || {};

  if (!name || !email || !password) {
    const fields = ['name', 'email', 'password'].filter(f => !req.body?.[f]);
    return res.status(400).json({ error: 'missing_fields', fields });
  }
  if (typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 80) {
    return res.status(400).json({ error: 'invalid_name' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'invalid_email' });
  }
  if (typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'password_too_short', min: 8 });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const role = ADMIN_EMAILS.has(email.toLowerCase()) ? 'admin' : 'customer';
    const user = await createUser({ name: name.trim(), email, passwordHash, role });
    const token = signToken({ id: user.id, email: user.email, name: user.name, role: user.role });
    res.cookie('nct_token', token, COOKIE_OPTS);
    res.status(201).json({ user: publicUser(user) });
  } catch (err) {
    if (err.message === 'email_taken') return res.status(409).json({ error: 'email_taken' });
    console.error('[auth] signup error:', err);
    res.status(500).json({ error: 'signup_failed' });
  }
});

// ─── Sign in ──────────────────────────────────────────────────────────────────

router.post('/signin', async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) return res.status(400).json({ error: 'missing_fields' });

  const user = await getUserByEmail(email);
  if (!user) return res.status(401).json({ error: 'invalid_credentials' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'invalid_credentials' });

  const token = signToken({ id: user.id, email: user.email, name: user.name, role: user.role });
  res.cookie('nct_token', token, COOKIE_OPTS);
  res.json({ user: publicUser(user) });
});

// ─── Sign out ─────────────────────────────────────────────────────────────────

router.post('/signout', (req, res) => {
  res.clearCookie('nct_token', { path: '/', sameSite: COOKIE_OPTS.sameSite, secure: COOKIE_OPTS.secure });
  res.json({ ok: true });
});

// ─── Current session ──────────────────────────────────────────────────────────

router.get('/me', requireAuth, async (req, res) => {
  const user = await getUserById(req.user.id);
  if (!user) {
    res.clearCookie('nct_token', { path: '/', sameSite: COOKIE_OPTS.sameSite, secure: COOKIE_OPTS.secure });
    return res.status(401).json({ error: 'user_not_found' });
  }
  res.json({ user: publicUser(user) });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function publicUser(u) {
  return { id: u.id, name: u.name, email: u.email, role: u.role };
}

export default router;
