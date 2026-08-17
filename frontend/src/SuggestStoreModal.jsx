// SuggestStoreModal.jsx — "Suggest a Store" modal on the thrift store
// directory page. Deliberately no auth required (unlike SubmitModal's "Add
// a Sale") — spam is handled by IP rate limiting on the backend instead, so
// this stays frictionless for a one-off visitor tip.
import { useState } from 'react';
import { X, Sparkles, Loader2 } from 'lucide-react';
import { API_URL } from './shared.js';
import Field from './Field.jsx';

// Keep in sync with STORE_TYPES in backend/server.js.
const STORE_TYPES = ['Thrift Store', 'Vintage Shop', 'Consignment Shop', 'Antique Store', 'Estate Sale Company', 'Other'];

const REQUIRED_FIELDS = ['name', 'address', 'city', 'state'];

export default function SuggestStoreModal({ onClose, onSuccess }) {
  const [form, setForm] = useState({
    name: '', address: '', city: '', state: 'CA', zip: '',
    website: '', store_type: 'Thrift Store', notes: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState(null);
  const [done, setDone]             = useState(false);

  const update = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const canSubmit = REQUIRED_FIELDS.every(k => form[k].trim().length > 0);

  const submit = async () => {
    if (!canSubmit) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/suggestions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          err.error === 'too_many_suggestions'
            ? "You've hit the limit for suggestions this hour — try again later."
            : (err.error || 'submission failed')
        );
      }
      setDone(true);
      setTimeout(() => { onSuccess?.(); onClose(); }, 1800);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(44, 31, 23, 0.5)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 100, padding: "20px", backdropFilter: "blur(4px)",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "#FFFCF6", borderRadius: "20px", padding: "28px",
        maxWidth: "520px", width: "100%", maxHeight: "90vh", overflowY: "auto",
        boxShadow: "0 20px 60px rgba(44, 31, 23, 0.3)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: "26px", fontWeight: 600, margin: 0, color: "#2C1F17" }}>
            Suggest a Store
          </h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#9A8472" }}>
            <X size={24} />
          </button>
        </div>

        {done ? (
          <div style={{ textAlign: "center", padding: "20px 0", color: "#5A6E50", fontSize: "16px" }}>
            <Sparkles size={32} style={{ marginBottom: "8px" }} />
            <p style={{ margin: 0, fontFamily: "'Fraunces', serif", fontSize: "20px", fontStyle: "italic" }}>
              Thanks for the suggestion! We'll review it and add it to the directory soon.
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <p style={{ margin: "0 0 4px", color: "#6B5444", fontSize: "14px", lineHeight: 1.5 }}>
              Know a thrift, vintage, consignment, or antique store we're missing? Tell us about it — no account needed.
            </p>
            <Field label="Store name *" value={form.name} onChange={v => update('name', v)} placeholder="e.g., Second Chance Treasures" />
            <Field label="Street address *" value={form.address} onChange={v => update('address', v)} placeholder="123 Main St" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 120px", gap: "10px" }}>
              <Field label="City *" value={form.city} onChange={v => update('city', v)} />
              <Field label="State *" value={form.state} onChange={v => update('state', v.toUpperCase().slice(0, 2))} />
              <Field label="ZIP" value={form.zip} onChange={v => update('zip', v)} />
            </div>
            <Field label="Website" value={form.website} onChange={v => update('website', v)} placeholder="https://…" />
            <Field label="Store type" value={form.store_type} onChange={v => update('store_type', v)} options={STORE_TYPES} />
            <Field label="Any additional notes" value={form.notes} onChange={v => update('notes', v)} multiline placeholder="e.g., great furniture section, cash only" />

            {error && (
              <div style={{ padding: "10px 14px", borderRadius: "8px", background: "rgba(198, 107, 61, 0.1)", color: "#A8542C", fontSize: "13px" }}>
                {error}
              </div>
            )}

            <button onClick={submit} disabled={submitting || !canSubmit} style={{
              marginTop: "8px", padding: "14px", borderRadius: "12px",
              background: "#A8542C", color: "#FFFCF6", border: "none",
              fontSize: "16px", fontWeight: 700, fontFamily: "inherit",
              cursor: (submitting || !canSubmit) ? "not-allowed" : "pointer",
              opacity: (submitting || !canSubmit) ? 0.5 : 1,
              display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
            }}>
              {submitting && <Loader2 size={16} className="spin" />}
              {submitting ? 'Sending…' : 'Submit Suggestion'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
