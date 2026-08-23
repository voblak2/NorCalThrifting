// email.js — sends the contact form to hello@norcalthrifting.com via Resend.
//
// Render's free tier blocks outbound SMTP connections at the network level
// (nodemailer/SMTP attempts here failed with ETIMEDOUT), so email delivery
// goes through Resend's HTTPS API instead — no SMTP port involved.
//
// Deliberately optional: RESEND_API_KEY is not required to run this app —
// the contact form itself doesn't depend on email delivery, since every
// message is written to contact_messages first (see db.js) regardless of
// what happens here. Without it configured, this just logs and reports
// success so the form still works end-to-end.

import { Resend } from 'resend';

const CONTACT_TO = process.env.CONTACT_TO_EMAIL || 'hello@norcalthrifting.com';
// Domain is verified in Resend — sends must come from an address on it.
const FROM_ADDRESS = 'NorCal Thrifting <hello@norcalthrifting.com>';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
if (resend) {
  console.log('[email] Resend configured — contact form messages will be emailed.');
} else {
  console.log('[email] Resend not configured (RESEND_API_KEY unset) — contact form messages will be logged only.');
}

export async function sendContactEmail({ name, email, subject, message }) {
  if (!resend) {
    console.log(`[email] (not sent — Resend unconfigured) contact message from ${name} <${email}> [${subject}]: ${message}`);
    return { sent: false };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: CONTACT_TO,
      replyTo: email,
      subject: `[Contact] ${subject} — ${name}`,
      text: `From: ${name} <${email}>\nSubject: ${subject}\n\n${message}`,
    });
    if (error) {
      // Never let an email failure fail the request — the message is
      // already safely in contact_messages by the time this runs.
      console.error('[email] failed to send contact email:', error.message);
      return { sent: false, error: error.message };
    }
    return { sent: true, id: data?.id };
  } catch (err) {
    console.error('[email] failed to send contact email:', err.message);
    return { sent: false, error: err.message };
  }
}

// Deliberately does NOT catch/swallow — used only by the admin test-email
// endpoint, which needs the real, unmodified Resend success/error object to
// diagnose delivery problems. sendContactEmail() above stays swallowing/
// best-effort on purpose; this one is for debugging, not the contact form's
// own request path.
export async function sendTestEmail(to) {
  if (!resend) {
    const err = new Error('Resend is not configured — RESEND_API_KEY is unset.');
    err.code = 'RESEND_NOT_CONFIGURED';
    throw err;
  }

  const { data, error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to,
    subject: 'NorCal Thrifting — test email',
    text: `This is a test email sent at ${new Date().toISOString()} to verify the Resend configuration.`,
  });

  if (error) {
    // Resend's SDK returns API errors as a {data:null, error} object rather
    // than throwing — re-thrown here as a real Error, carrying every field
    // Resend gave us, so the caller sees exactly what Resend rejected and why.
    const e = new Error(error.message);
    e.name = error.name;
    e.statusCode = error.statusCode;
    e.resendError = error;
    throw e;
  }

  return data;
}
