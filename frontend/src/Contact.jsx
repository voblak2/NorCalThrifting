import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, Mail, Send, Loader2, Sparkles, TreePine } from 'lucide-react';
import { API_URL } from './shared.js';
import { useSEO, SITE_URL, SITE_NAME } from './useSEO.js';
import Field from './Field.jsx';
import { btnStyle } from './styles.js';

// Keep in sync with CONTACT_SUBJECTS in backend/server.js.
const SUBJECTS = ['General Question', 'Report a Problem', 'Suggest a Store', 'Partnership Inquiry', 'Press & Media', 'Other'];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const AREA_SERVED = ['Sacramento', 'Northern California', 'Central Valley'];

function buildJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'ContactPage',
        name: 'Contact NorCal Thrifting',
        url: `${SITE_URL}/contact`,
        isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: SITE_URL },
      },
      {
        '@type': 'LocalBusiness',
        name: SITE_NAME,
        url: SITE_URL,
        email: 'hello@norcalthrifting.com',
        areaServed: AREA_SERVED,
      },
    ],
  };
}

// Small vintage-style section divider — echoes the pine tree + double-rule
// motif from the site's logo mark.
function Divider() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "12px", margin: "36px 0" }}>
      <div style={{ flex: 1, height: "1px", background: "#E8DCC8" }} />
      <TreePine size={16} color="#A8542C" />
      <div style={{ flex: 1, height: "1px", background: "#E8DCC8" }} />
    </div>
  );
}

export default function Contact() {
  useSEO({
    title: 'Contact Us | NorCal Thrifting',
    description: "Get in touch with NorCal Thrifting. Questions, suggestions, partnership inquiries, or just want to say hi — we'd love to hear from you.",
    path: '/contact',
    jsonLd: buildJsonLd(),
  });

  const [form, setForm] = useState({ name: '', email: '', subject: SUBJECTS[0], message: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  const update = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const canSubmit =
    form.name.trim().length > 0 &&
    EMAIL_RE.test(form.email.trim()) &&
    form.message.trim().length > 0;

  const submit = async (e) => {
    e.preventDefault();
    if (!canSubmit || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          err.error === 'too_many_messages'
            ? "You've hit the limit for messages this hour — try again later, or email us directly."
            : err.error === 'invalid_email'
            ? 'That email address looks invalid — please double-check it.'
            : (err.error || 'Something went wrong sending your message.')
        );
      }
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(180deg, #FBF5EC 0%, #F5EDDF 100%)",
      fontFamily: "'Nunito', system-ui, sans-serif",
      color: "#3D2E26",
    }}>
      <div style={{ maxWidth: "700px", margin: "0 auto", padding: "32px 24px 64px" }}>
        <Link to="/" style={{
          display: "inline-flex", alignItems: "center", gap: "6px",
          color: "#A8542C", fontSize: "14px", fontWeight: 700,
          textDecoration: "none", marginBottom: "24px",
        }}>
          <ChevronLeft size={16} /> Back to all listings
        </Link>

        <div style={{ textAlign: "center", marginBottom: "8px" }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: "10px",
            padding: "6px 14px", borderRadius: "999px",
            background: "rgba(198, 107, 61, 0.12)", color: "#A8542C",
            fontSize: "13px", fontWeight: 600, letterSpacing: "0.04em", marginBottom: "16px",
          }}>
            <Mail size={14} /> GET IN TOUCH
          </div>
          <h1 style={{
            fontFamily: "'Fraunces', serif", fontSize: "clamp(32px, 5vw, 48px)",
            fontWeight: 600, fontStyle: "italic", margin: "0 0 12px",
            letterSpacing: "-0.02em", color: "#2C1F17", lineHeight: 1.1,
          }}>
            Get in Touch
          </h1>
          <p style={{ fontSize: "16px", color: "#6B5444", maxWidth: "480px", margin: "0 auto", lineHeight: 1.5 }}>
            Have a question, suggestion, or just want to say hi? We'd love to hear from you.
          </p>
        </div>

        <div style={{
          marginTop: "32px", background: "#FFFCF6", border: "1px solid #E8DCC8",
          borderRadius: "20px", padding: "28px",
          boxShadow: "0 4px 20px rgba(61, 46, 38, 0.06), 0 1px 3px rgba(61, 46, 38, 0.04)",
        }}>
          {done ? (
            <div style={{ textAlign: "center", padding: "24px 0", color: "#5A6E50" }}>
              <Sparkles size={32} style={{ marginBottom: "10px" }} />
              <p style={{ margin: 0, fontFamily: "'Fraunces', serif", fontSize: "20px", fontStyle: "italic", color: "#2C1F17" }}>
                Thanks for reaching out!
              </p>
              <p style={{ margin: "8px 0 0", fontSize: "15px", lineHeight: 1.5 }}>
                We'll get back to you at <strong>{form.email}</strong> within a day or two.
              </p>
            </div>
          ) : (
            <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div className="contact-name-email" style={{ display: "grid", gap: "12px" }}>
                <Field label="Name *" value={form.name} onChange={v => update('name', v)} placeholder="Your name" />
                <Field label="Email *" type="email" value={form.email} onChange={v => update('email', v)} placeholder="you@example.com" />
              </div>
              <Field label="Subject" value={form.subject} onChange={v => update('subject', v)} options={SUBJECTS} />
              <Field label="Message *" value={form.message} onChange={v => update('message', v)} multiline placeholder="What's on your mind?" />

              {error && (
                <div style={{ padding: "10px 14px", borderRadius: "8px", background: "rgba(198, 107, 61, 0.1)", color: "#A8542C", fontSize: "13px" }}>
                  {error}
                </div>
              )}

              <button type="submit" disabled={submitting || !canSubmit} style={{
                ...btnStyle(false, "#A8542C", true),
                marginTop: "6px", justifyContent: "center", width: "100%",
                cursor: (submitting || !canSubmit) ? "not-allowed" : "pointer",
                opacity: (submitting || !canSubmit) ? 0.5 : 1,
              }}>
                {submitting ? <Loader2 size={18} className="spin" /> : <Send size={18} />}
                {submitting ? 'Sending…' : 'Send Message'}
              </button>
            </form>
          )}
        </div>

        <Divider />

        <div style={{ textAlign: "center" }}>
          <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: "20px", fontWeight: 600, margin: "0 0 10px", color: "#2C1F17" }}>
            Other Ways to Reach Us
          </h2>
          <a href="mailto:hello@norcalthrifting.com" style={{
            display: "inline-flex", alignItems: "center", gap: "8px",
            color: "#A8542C", fontWeight: 700, fontSize: "16px", textDecoration: "none",
          }}>
            <Mail size={16} /> hello@norcalthrifting.com
          </a>
          <p style={{ margin: "10px 0 0", fontSize: "14px", color: "#9A8472" }}>
            We typically respond within 1-2 business days.
          </p>
        </div>

        <Divider />

        <div style={{ textAlign: "center" }}>
          <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: "20px", fontWeight: 600, margin: "0 0 10px", color: "#2C1F17" }}>
            About NorCal Thrifting
          </h2>
          <p style={{ margin: 0, fontSize: "15px", color: "#6B5444", lineHeight: 1.6, maxWidth: "560px", marginLeft: "auto", marginRight: "auto" }}>
            NorCal Thrifting is a free, community-driven guide to garage sales, estate sales, and thrift
            stores across Sacramento, the Central Valley, and Northern California. Built and maintained
            by a local with a passion for the thrift scene — no corporate backing, no paid listings,
            just a genuine resource for NorCal treasure hunters.
          </p>
        </div>
      </div>

      <style>{`
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        .spin { animation: spin 1s linear infinite }
        .contact-name-email { grid-template-columns: 1fr 1fr; }
        @media (max-width: 480px) {
          .contact-name-email { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}
