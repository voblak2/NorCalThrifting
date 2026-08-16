// SubmitModal.jsx — "Add a Sale" modal, split out of norcal_thrifting.jsx.
import { useState } from 'react';
import { X, Sparkles, Camera, Loader2 } from 'lucide-react';
import { API_URL } from './shared.js';
import Field from './Field.jsx';

export default function SubmitModal({ onClose, onSuccess }) {
  const [form, setForm] = useState({
    title: '', address: '', city: '', state: 'CA', zip: '',
    sale_date: '', start_time: '08:00', end_time: '14:00',
    description: '', categories: '',
  });
  const [photoFiles, setPhotoFiles]       = useState([]);
  const [photoPreviews, setPhotoPreviews] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [uploadStep, setUploadStep] = useState(false);
  const [error, setError]           = useState(null);
  const [done, setDone]             = useState(false);

  const update = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handlePhotoChange = (e) => {
    const files = Array.from(e.target.files || []).slice(0, 5);
    photoPreviews.forEach(u => URL.revokeObjectURL(u));
    setPhotoFiles(files);
    setPhotoPreviews(files.map(f => URL.createObjectURL(f)));
  };

  const removePhoto = (idx) => {
    URL.revokeObjectURL(photoPreviews[idx]);
    setPhotoFiles(prev => prev.filter((_, i) => i !== idx));
    setPhotoPreviews(prev => prev.filter((_, i) => i !== idx));
  };

  const submit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      let photo_urls = [];
      if (photoFiles.length > 0) {
        setUploadStep(true);
        const fd = new FormData();
        photoFiles.forEach(f => fd.append('photos', f));
        const upRes = await fetch(`${API_URL}/uploads`, {
          method: 'POST', credentials: 'include', body: fd,
        });
        if (!upRes.ok) {
          const err = await upRes.json().catch(() => ({}));
          throw new Error(err.error || 'photo_upload_failed');
        }
        const upData = await upRes.json();
        photo_urls = upData.urls || [];
        setUploadStep(false);
      }

      const res = await fetch(`${API_URL}/sales`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ...form,
          categories: form.categories.split(',').map(s => s.trim()).filter(Boolean),
          photo_urls,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'submission failed');
      }
      setDone(true);
      setTimeout(() => { onSuccess?.(); onClose(); }, 1200);
    } catch (err) {
      setError(err.message);
      setUploadStep(false);
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
            Add Your Sale
          </h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#9A8472" }}>
            <X size={24} />
          </button>
        </div>

        {done ? (
          <div style={{ textAlign: "center", padding: "20px 0", color: "#5A6E50", fontSize: "16px" }}>
            <Sparkles size={32} style={{ marginBottom: "8px" }} />
            <p style={{ margin: 0, fontFamily: "'Fraunces', serif", fontSize: "20px", fontStyle: "italic" }}>
              Your sale is up. Happy treasure hunting!
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <Field label="Sale title *" value={form.title} onChange={v => update('title', v)} placeholder="e.g., Multi-Family Garage Sale" />
            <Field label="Street address *" value={form.address} onChange={v => update('address', v)} placeholder="123 Main St" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 120px", gap: "10px" }}>
              <Field label="City *" value={form.city} onChange={v => update('city', v)} />
              <Field label="State *" value={form.state} onChange={v => update('state', v.toUpperCase().slice(0, 2))} />
              <Field label="ZIP" value={form.zip} onChange={v => update('zip', v)} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px" }}>
              <Field label="Date *" type="date" value={form.sale_date} onChange={v => update('sale_date', v)} />
              <Field label="Start time" type="time" value={form.start_time} onChange={v => update('start_time', v)} />
              <Field label="End time" type="time" value={form.end_time} onChange={v => update('end_time', v)} />
            </div>
            <Field label="Description" value={form.description} onChange={v => update('description', v)} multiline placeholder="What's for sale, special details..." />
            <Field label="Categories (comma-separated)" value={form.categories} onChange={v => update('categories', v)} placeholder="Furniture, Vintage, Tools" />

            {/* Photo upload */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <span style={{ fontSize: "13px", fontWeight: 600, color: "#6B5444" }}>
                Photos <span style={{ fontWeight: 400, color: "#9A8472" }}>(optional · up to 5)</span>
              </span>
              <label style={{
                display: "flex", alignItems: "center", gap: "8px",
                padding: "10px 14px", borderRadius: "10px",
                border: "1px dashed #C9B89E", background: "#FBF5EC",
                cursor: "pointer", fontSize: "14px", color: "#9A8472", fontFamily: "inherit",
              }}>
                <Camera size={16} />
                <span>{photoFiles.length > 0 ? `${photoFiles.length} photo${photoFiles.length > 1 ? 's' : ''} selected — click to change` : 'Choose photos…'}</span>
                <input type="file" accept="image/*" multiple style={{ display: "none" }} onChange={handlePhotoChange} />
              </label>
              {photoPreviews.length > 0 && (
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {photoPreviews.map((url, i) => (
                    <div key={i} style={{ position: "relative" }}>
                      <img src={url} alt="" style={{ width: 80, height: 80, objectFit: "cover", borderRadius: "8px", border: "1px solid #E8DCC8" }} />
                      <button onClick={() => removePhoto(i)} style={{
                        position: "absolute", top: "-6px", right: "-6px",
                        width: "20px", height: "20px", borderRadius: "50%",
                        background: "#A8542C", color: "#FFFCF6", border: "none",
                        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
                      }}>
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {error && (
              <div style={{ padding: "10px 14px", borderRadius: "8px", background: "rgba(198, 107, 61, 0.1)", color: "#A8542C", fontSize: "13px" }}>
                {error}
              </div>
            )}

            <button onClick={submit} disabled={submitting} style={{
              marginTop: "8px", padding: "14px", borderRadius: "12px",
              background: "#A8542C", color: "#FFFCF6", border: "none",
              fontSize: "16px", fontWeight: 700, fontFamily: "inherit",
              cursor: submitting ? "wait" : "pointer", opacity: submitting ? 0.6 : 1,
              display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
            }}>
              {submitting && <Loader2 size={16} className="spin" />}
              {uploadStep ? 'Uploading photos…' : submitting ? 'Posting…' : 'Post Sale'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
