// ApproveSuggestionModal.jsx — admin-only "Approve & Add" flow for a
// crowdsourced store suggestion. Pre-fills an editable form from the
// suggestion so a typo'd name/address can be cleaned up before it's
// published to the live directory, rather than publishing user input as-is.
import { useState } from 'react';
import { X, Check, Loader2 } from 'lucide-react';
import { API_URL } from './shared.js';
import Field from './Field.jsx';

const STORE_TYPES = ['Thrift Store', 'Vintage Shop', 'Consignment Shop', 'Antique Store', 'Estate Sale Company', 'Other'];

export default function ApproveSuggestionModal({ suggestion, onClose, onApproved }) {
  const [form, setForm] = useState({
    name:       suggestion.name || '',
    address:    suggestion.address || '',
    city:       suggestion.city || '',
    state:      suggestion.state || 'CA',
    zip:        suggestion.zip || '',
    website:    suggestion.website || '',
    store_type: suggestion.store_type || 'Other',
    notes:      suggestion.notes || '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState(null);

  const update = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const canSubmit = ['name', 'address', 'city', 'state'].every(k => form[k].trim().length > 0);

  const confirm = async () => {
    if (!canSubmit) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/admin/suggestions/${suggestion.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'approve failed');
      }
      const data = await res.json();
      onApproved(data.saleId);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(44, 31, 23, 0.6)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 400, padding: "20px", backdropFilter: "blur(4px)",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "#FFFCF6", borderRadius: "20px", padding: "28px",
        maxWidth: "520px", width: "100%", maxHeight: "90vh", overflowY: "auto",
        boxShadow: "0 20px 60px rgba(44, 31, 23, 0.3)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: "22px", fontWeight: 600, margin: 0, color: "#2C1F17" }}>
            Approve &amp; Add to Directory
          </h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#9A8472" }}>
            <X size={24} />
          </button>
        </div>

        <p style={{ margin: "0 0 16px", color: "#6B5444", fontSize: "13px", lineHeight: 1.5 }}>
          Clean up anything before it goes live — this becomes a permanent directory entry.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <Field label="Store name *" value={form.name} onChange={v => update('name', v)} />
          <Field label="Street address *" value={form.address} onChange={v => update('address', v)} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 120px", gap: "10px" }}>
            <Field label="City *" value={form.city} onChange={v => update('city', v)} />
            <Field label="State *" value={form.state} onChange={v => update('state', v.toUpperCase().slice(0, 2))} />
            <Field label="ZIP" value={form.zip} onChange={v => update('zip', v)} />
          </div>
          <Field label="Website" value={form.website} onChange={v => update('website', v)} />
          <Field label="Store type" value={form.store_type} onChange={v => update('store_type', v)} options={STORE_TYPES} />
          <Field label="Notes" value={form.notes} onChange={v => update('notes', v)} multiline />

          {error && (
            <div style={{ padding: "10px 14px", borderRadius: "8px", background: "rgba(198, 107, 61, 0.1)", color: "#A8542C", fontSize: "13px" }}>
              {error}
            </div>
          )}

          <div style={{ display: "flex", gap: "10px", marginTop: "8px" }}>
            <button onClick={onClose} style={{
              flex: 1, padding: "12px", borderRadius: "12px",
              background: "#FBF5EC", color: "#6B5444", border: "1px solid #E8DCC8",
              fontSize: "14px", fontWeight: 700, fontFamily: "inherit", cursor: "pointer",
            }}>
              Cancel
            </button>
            <button onClick={confirm} disabled={submitting || !canSubmit} style={{
              flex: 2, padding: "12px", borderRadius: "12px", border: "none",
              background: "#5A6E50", color: "#FFFCF6",
              fontSize: "14px", fontWeight: 700, fontFamily: "inherit",
              cursor: (submitting || !canSubmit) ? "not-allowed" : "pointer",
              opacity: (submitting || !canSubmit) ? 0.6 : 1,
              display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
            }}>
              {submitting ? <Loader2 size={16} className="spin" /> : <Check size={16} />}
              {submitting ? 'Publishing…' : 'Confirm & Publish'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
