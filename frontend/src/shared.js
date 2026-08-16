// Shared constants/helpers used by the main app and the standalone
// listing/thrift-directory pages. Kept separate so route-level pages
// (ListingDetail, ThriftDirectory) don't need to import the whole
// single-file norcal_thrifting.jsx component just for these.

// In dev, Vite proxies /api → localhost:3001. In production set VITE_API_URL
// to the Render backend URL (e.g. https://norcal-thrifting-api.onrender.com/api).
export const API_URL = import.meta.env.VITE_API_URL || '/api';
// Uploaded photo paths come back from the API as host-relative ("/uploads/x.jpg").
// They live on the backend, not the frontend's own origin, so resolve them against
// the API's host whenever VITE_API_URL points at a different domain (e.g. Vercel + Render).
export const API_ORIGIN = API_URL.startsWith('http') ? new URL(API_URL).origin : '';

// Photo URLs are now absolute (Cloudflare R2). Older rows may still have the
// legacy host-relative form ("/uploads/x.jpg") — resolve those against the API host.
export function resolvePhotoUrl(url) {
  return url.startsWith('http') ? url : `${API_ORIGIN}${url}`;
}

export function formatDate(s) {
  if (!s) return "Date TBD";
  const d = new Date(s + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}
export function formatTime(t) {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${m.toString().padStart(2, "0")} ${period}`;
}
export function buildMapUrl(sale) {
  const parts = [sale.address, sale.city, sale.state, sale.zip].filter(Boolean);
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parts.join(', '))}`;
}
export function initials(name) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}
