// email.js — sends the contact form to hello@norcalthrifting.com via SMTP
// (nodemailer). Deliberately optional: SMTP_HOST/SMTP_USER/SMTP_PASS are not
// required to run this app locally or even in production on day one — the
// contact form itself doesn't depend on email delivery, since every message
// is written to contact_messages first (see db.js) regardless of what
// happens here. Without SMTP configured, this just logs and reports success
// so the form still works end-to-end while email is being set up.

import nodemailer from 'nodemailer';

const CONTACT_TO = process.env.CONTACT_TO_EMAIL || 'hello@norcalthrifting.com';

let transporter = null;
if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  console.log('[email] SMTP configured — contact form messages will be emailed.');
} else {
  console.log('[email] SMTP not configured (SMTP_HOST/SMTP_USER/SMTP_PASS unset) — contact form messages will be logged only.');
}

export async function sendContactEmail({ name, email, subject, message }) {
  if (!transporter) {
    console.log(`[email] (not sent — SMTP unconfigured) contact message from ${name} <${email}> [${subject}]: ${message}`);
    return { sent: false };
  }

  try {
    await transporter.sendMail({
      from: `"NorCal Thrifting" <${process.env.SMTP_USER}>`,
      to: CONTACT_TO,
      replyTo: email,
      subject: `[Contact] ${subject} — ${name}`,
      text: `From: ${name} <${email}>\nSubject: ${subject}\n\n${message}`,
    });
    return { sent: true };
  } catch (err) {
    // Never let an email failure fail the request — the message is already
    // safely in contact_messages by the time this runs.
    console.error('[email] failed to send contact email:', err.message);
    return { sent: false, error: err.message };
  }
}

// Deliberately does NOT catch — used only by the admin test-email endpoint,
// which needs the real, unmodified nodemailer success/error object (SMTP
// response code, server response text, etc.) to diagnose delivery problems.
// sendContactEmail() above stays swallowing/best-effort on purpose; this one
// is for debugging, not for the contact form's own request path.
export async function sendTestEmail(to) {
  if (!transporter) {
    const err = new Error('SMTP is not configured — SMTP_HOST/SMTP_USER/SMTP_PASS are unset.');
    err.code = 'SMTP_NOT_CONFIGURED';
    throw err;
  }
  return transporter.sendMail({
    from: `"NorCal Thrifting" <${process.env.SMTP_USER}>`,
    to,
    subject: 'NorCal Thrifting — test email',
    text: `This is a test email sent at ${new Date().toISOString()} to verify the SMTP configuration.`,
  });
}
