// routes/auth.js — Sign-up, sign-in, sign-out, session check, 2FA verification,
// and Google Sign-In.
//
// POST /api/auth/signup     — create account, returns user + sets cookie
// POST /api/auth/signin     — authenticate; sets cookie directly, UNLESS the
//                             account (admin only) has 2FA enabled, in which
//                             case it returns a short-lived tempToken instead
// POST /api/auth/verify-2fa — second step for a 2FA-enabled account: exchanges
//                             a valid TOTP/backup code + tempToken for the cookie
// POST /api/auth/google     — sign in / sign up via a verified Google ID token
//                             (regular users only — see the admin guard below)
// POST /api/auth/signout    — clears the auth cookie
// GET  /api/auth/me         — returns current user from cookie (or 401)

import { Router } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { verify as verifyTotp } from 'otplib';
import { OAuth2Client } from 'google-auth-library';
import {
  createUser, getUserByEmail, getUserById, updateBackupCodes,
  getUserByGoogleId, linkGoogleId, createGoogleUser,
} from '../db.js';
import { signToken, requireAuth, signPendingTwoFactorToken, verifyPendingTwoFactorToken } from '../auth.js';

const router = Router();
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// 10 attempts per IP per 15 minutes — a 6-digit TOTP code is only a 1-in-a-million
// guess per try, but that's still brute-forceable without a limiter; this also
// covers backup-code guessing on the same endpoint.
const twoFaLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'too_many_attempts' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Generous — a Google ID token is cryptographically verified, not guessable,
// so this is defense against abuse/DoS on the outbound Google verification
// call rather than a brute-force concern like the limiter above.
const googleAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'too_many_attempts' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Finds the account for a verified Google identity, creating or linking one
// as needed:
//   1. Already linked (google_id matches) -> that account, no changes.
//   2. An existing email/password account shares the email -> link google_id
//      onto it (their password keeps working; Google becomes a second way in).
//   3. Neither -> a brand-new, Google-only, role:'customer' account. Always
//      'customer' — Google Sign-In deliberately never checks ADMIN_EMAILS or
//      grants admin, regardless of which address signs in (see the explicit
//      admin guard in the /google route below, which is the second half of
//      that same guarantee for the linking case).
async function findOrCreateGoogleUser({ googleId, email, name }) {
  const byGoogleId = await getUserByGoogleId(googleId);
  if (byGoogleId) return byGoogleId;

  const byEmail = await getUserByEmail(email);
  if (byEmail) {
    await linkGoogleId(byEmail.id, googleId);
    return { ...byEmail, google_id: googleId };
  }

  // No usable password exists for a Google-only account — this random value
  // is never given to the user and can't be entered as a real password.
  const placeholderHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);
  return createGoogleUser({ name, email, passwordHash: placeholderHash, googleId });
}

const BACKUP_CODE_SHAPE = /^[A-Z2-9]{4}-[A-Z2-9]{4}$/;

// Checks `code` against the account's stored backup-code hashes. On a match,
// removes that one hash immediately (so it can never be redeemed twice) and
// leaves the rest untouched. bcrypt.compare is run sequentially rather than
// in parallel — there are at most 8 codes, and sequential keeps the "found it,
// stop and remove" logic simple without a race between concurrent compares.
async function tryConsumeBackupCode(user, code) {
  if (!user.backup_codes) return false;
  const hashes = JSON.parse(user.backup_codes);
  for (let i = 0; i < hashes.length; i++) {
    if (await bcrypt.compare(code, hashes[i])) {
      hashes.splice(i, 1);
      await updateBackupCodes(user.id, hashes);
      return true;
    }
  }
  return false;
}

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

  // A Google-only account's password_hash is an unguessable random placeholder
  // (see findOrCreateGoogleUser) — bcrypt.compare would just fail here anyway,
  // but has_password lets us tell the user why instead of a generic wrong-password.
  if (!user.has_password) return res.status(401).json({ error: 'google_account_no_password' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'invalid_credentials' });

  // 2FA is admin-only by construction (only the admin dashboard can ever set
  // totp_enabled), but the role check here is deliberate belt-and-suspenders:
  // regular user sign-in is untouched by this feature no matter what.
  if (user.role === 'admin' && user.totp_enabled) {
    const tempToken = signPendingTwoFactorToken({ id: user.id });
    return res.json({ requires2fa: true, tempToken });
  }

  const token = signToken({ id: user.id, email: user.email, name: user.name, role: user.role });
  res.cookie('nct_token', token, COOKIE_OPTS);
  res.json({ user: publicUser(user) });
});

// ─── 2FA verification (second step of sign-in for 2FA-enabled admins) ─────────

router.post('/verify-2fa', twoFaLimiter, async (req, res) => {
  const { tempToken, code } = req.body || {};
  if (!tempToken || !code) return res.status(400).json({ error: 'missing_fields' });

  let decoded;
  try {
    decoded = verifyPendingTwoFactorToken(tempToken);
  } catch {
    return res.status(401).json({ error: 'invalid_or_expired_token' });
  }

  const user = await getUserById(decoded.id);
  if (!user || user.role !== 'admin' || !user.totp_enabled) {
    return res.status(401).json({ error: 'invalid_token' });
  }

  const cleanCode = String(code).trim().toUpperCase();
  let usedBackupCode = false;
  let ok = false;

  // otplib throws on a malformed token (wrong length/non-digit) instead of
  // returning false — a backup code ("XXXX-XXXX") always takes this path.
  try {
    ok = (await verifyTotp({ secret: user.totp_secret, token: cleanCode, epochTolerance: 30 })).valid;
  } catch {
    ok = false;
  }

  if (!ok && BACKUP_CODE_SHAPE.test(cleanCode)) {
    ok = await tryConsumeBackupCode(user, cleanCode);
    usedBackupCode = ok;
  }

  if (!ok) return res.status(401).json({ error: 'invalid_code' });

  const token = signToken({ id: user.id, email: user.email, name: user.name, role: user.role });
  res.cookie('nct_token', token, COOKIE_OPTS);
  res.json({ user: publicUser(user), usedBackupCode });
});

// ─── Google Sign-In ───────────────────────────────────────────────────────────
//
// Regular users only. The admin account already has its own password (+
// optional 2FA) flow, and Google Sign-In must never become a way around that
// — so an email that already belongs to an admin account is explicitly
// refused here, on top of findOrCreateGoogleUser() above never creating a
// new account with role other than 'customer'.

router.post('/google', googleAuthLimiter, async (req, res) => {
  const { idToken } = req.body || {};
  if (!idToken) return res.status(400).json({ error: 'missing_id_token' });
  if (!process.env.GOOGLE_CLIENT_ID) {
    console.error('[auth] GOOGLE_CLIENT_ID is not configured — /auth/google cannot verify tokens');
    return res.status(500).json({ error: 'google_signin_not_configured' });
  }

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken, audience: process.env.GOOGLE_CLIENT_ID });
    payload = ticket.getPayload();
  } catch (err) {
    return res.status(401).json({ error: 'invalid_google_token' });
  }

  if (!payload?.sub || !payload?.email) return res.status(401).json({ error: 'invalid_google_token' });
  if (!payload.email_verified) return res.status(401).json({ error: 'google_email_not_verified' });

  // Refuse before touching the DB if this email already belongs to an admin —
  // never link Google to that account or sign in through this endpoint.
  const existing = await getUserByEmail(payload.email);
  if (existing?.role === 'admin') {
    return res.status(403).json({ error: 'use_admin_signin' });
  }

  const user = await findOrCreateGoogleUser({
    googleId: payload.sub,
    email: payload.email,
    name: payload.name || payload.email.split('@')[0],
  });

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
  return { id: u.id, name: u.name, email: u.email, role: u.role, hasPassword: !!u.has_password };
}

export default router;
