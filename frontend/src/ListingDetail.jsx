import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { MapPin, Calendar, Clock, Tag, ExternalLink, ShoppingBag, ChevronLeft, Loader2, AlertCircle } from 'lucide-react';
import { API_URL, resolvePhotoUrl, formatDate, formatTime, buildMapUrl } from './shared.js';
import { useSEO, SITE_URL, SITE_NAME } from './useSEO.js';

const infoRowStyle = { display: "flex", alignItems: "flex-start", gap: "10px", color: "#6B5444", fontSize: "15px" };

function toISODateTime(date, time) {
  if (!date) return undefined;
  return time ? `${date}T${time}:00` : date;
}

function buildJsonLd(sale, url, image) {
  const address = {
    '@type': 'PostalAddress',
    ...(sale.address_visible !== false && sale.address ? { streetAddress: sale.address } : {}),
    addressLocality: sale.city,
    addressRegion: sale.state,
    ...(sale.zip ? { postalCode: sale.zip } : {}),
    addressCountry: 'US',
  };

  if (sale.sale_type === 'thrift_store') {
    return {
      '@context': 'https://schema.org',
      '@type': 'LocalBusiness',
      name: sale.title,
      description: sale.description || undefined,
      address,
      url,
      ...(sale.lat != null && sale.lng != null
        ? { geo: { '@type': 'GeoCoordinates', latitude: sale.lat, longitude: sale.lng } }
        : {}),
      ...(image ? { image: [image] } : {}),
    };
  }

  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: sale.title,
    description: sale.description || undefined,
    startDate: toISODateTime(sale.sale_date, sale.start_time),
    endDate: toISODateTime(sale.sale_date, sale.end_time) || toISODateTime(sale.sale_date, sale.start_time),
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    eventStatus: 'https://schema.org/EventScheduled',
    location: {
      '@type': 'Place',
      name: sale.title,
      address,
    },
    url,
    ...(image ? { image: [image] } : {}),
  };
}

// Render's free tier can take 30-50s to cold-start (see keepalive/UptimeRobot
// history) — give a real listing fetch more room than a default browser
// timeout before treating it as a failure, so a slow-but-alive backend isn't
// mistaken for a dead listing.
const FETCH_TIMEOUT_MS = 12000;

export default function ListingDetail() {
  const { id } = useParams();
  const [sale, setSale] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    setFetchError(false);
    setSale(null);

    fetch(`${API_URL}/sales/${id}`, { credentials: 'include', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
      .then(res => {
        // Only a confirmed 404 means the listing genuinely doesn't exist —
        // that's the one case that should ever produce a noindex tag below.
        // Any other failure (5xx, network error, timeout, bad JSON) is a
        // transient problem, not proof the listing is gone, so it must NOT
        // be treated the same way.
        if (res.status === 404) { setNotFound(true); return null; }
        if (!res.ok) throw new Error(`bad status ${res.status}`);
        return res.json();
      })
      .then(data => { if (!cancelled && data?.sale) setSale(data.sale); })
      .catch(() => { if (!cancelled) setFetchError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [id, retryTick]);

  const isThrift = sale?.sale_type === 'thrift_store';
  const image = sale?.photo_urls?.[0] ? resolvePhotoUrl(sale.photo_urls[0]) : undefined;
  const url = `${SITE_URL}/listing/${id}`;

  const title = sale
    ? isThrift
      ? `${sale.title} — Thrift Store in ${sale.city}, CA | ${SITE_NAME}`
      : `${sale.title} — ${sale.city}, CA on ${formatDate(sale.sale_date)} | ${SITE_NAME}`
    : notFound
      ? `Listing not found | ${SITE_NAME}`
      : fetchError
        ? `Couldn't load listing | ${SITE_NAME}`
        : undefined;

  const description = sale
    ? (sale.description?.slice(0, 155) || (isThrift
        ? `${sale.title}, a thrift store in ${sale.city}, CA.`
        : `${sale.title} in ${sale.city}, CA on ${formatDate(sale.sale_date)}.`))
    : undefined;

  useSEO({
    title,
    description,
    path: `/listing/${id}`,
    image,
    robots: notFound ? 'noindex, follow' : 'index, follow',
    jsonLd: sale ? buildJsonLd(sale, url, image) : undefined,
  });

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(180deg, #FBF5EC 0%, #F5EDDF 100%)",
      fontFamily: "'Nunito', system-ui, sans-serif",
      color: "#3D2E26",
    }}>
      <div style={{ maxWidth: "720px", margin: "0 auto", padding: "32px 24px" }}>
        <Link to="/" style={{
          display: "inline-flex", alignItems: "center", gap: "6px",
          color: "#A8542C", fontSize: "14px", fontWeight: 700,
          textDecoration: "none", marginBottom: "24px",
        }}>
          <ChevronLeft size={16} /> Back to all listings
        </Link>

        {loading && (
          <div style={{ display: "flex", alignItems: "center", gap: "10px", color: "#9A8472", padding: "40px 0" }}>
            <Loader2 size={20} className="spin" /> Loading listing…
          </div>
        )}

        {!loading && notFound && (
          <div style={{
            textAlign: "center", padding: "60px 20px",
            background: "#FFFCF6", borderRadius: "20px", border: "1px dashed #E8DCC8",
          }}>
            <AlertCircle size={28} color="#C66B3D" style={{ marginBottom: "12px" }} />
            <p style={{ fontFamily: "'Fraunces', serif", fontSize: "22px", fontStyle: "italic", color: "#6B5444", margin: "0 0 8px" }}>
              This listing isn't available anymore
            </p>
            <p style={{ color: "#9A8472", fontSize: "15px", margin: "0 0 20px" }}>
              It may have expired or been removed. Browse current sales instead.
            </p>
            <Link to="/" style={{
              display: "inline-flex", alignItems: "center", gap: "6px",
              padding: "10px 18px", borderRadius: "10px",
              background: "#A8542C", color: "#FFFCF6",
              textDecoration: "none", fontSize: "14px", fontWeight: 700,
            }}>
              Browse all listings
            </Link>
          </div>
        )}

        {!loading && fetchError && (
          <div style={{
            textAlign: "center", padding: "60px 20px",
            background: "#FFFCF6", borderRadius: "20px", border: "1px dashed #E8DCC8",
          }}>
            <AlertCircle size={28} color="#C66B3D" style={{ marginBottom: "12px" }} />
            <p style={{ fontFamily: "'Fraunces', serif", fontSize: "22px", fontStyle: "italic", color: "#6B5444", margin: "0 0 8px" }}>
              Couldn't load this listing
            </p>
            <p style={{ color: "#9A8472", fontSize: "15px", margin: "0 0 20px" }}>
              Something went wrong reaching the server. Please try again.
            </p>
            <button onClick={() => setRetryTick(t => t + 1)} style={{
              display: "inline-flex", alignItems: "center", gap: "6px",
              padding: "10px 18px", borderRadius: "10px",
              background: "#A8542C", color: "#FFFCF6", border: "none", cursor: "pointer",
              fontSize: "14px", fontWeight: 700, fontFamily: "inherit",
            }}>
              Try again
            </button>
          </div>
        )}

        {!loading && sale && (
          <article style={{
            background: "#FFFCF6", border: "1px solid #E8DCC8", borderRadius: "18px",
            padding: "28px", boxShadow: "0 2px 12px rgba(61, 46, 38, 0.05)",
          }}>
            {image && (
              <div style={{ margin: "-28px -28px 20px", height: "320px" }}>
                <img src={image} alt={sale.title} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "18px 18px 0 0" }} />
              </div>
            )}

            {isThrift && (
              <div style={{
                display: "inline-flex", alignItems: "center", gap: "6px",
                padding: "5px 12px", borderRadius: "999px",
                background: "rgba(58, 138, 110, 0.12)", color: "#3A8A6E",
                fontSize: "12px", fontWeight: 700, marginBottom: "14px",
              }}>
                <ShoppingBag size={13} /> THRIFT STORE
              </div>
            )}

            <h1 style={{
              fontFamily: "'Fraunces', serif", fontSize: "32px", fontWeight: 600,
              margin: "0 0 16px", lineHeight: 1.15, color: "#2C1F17",
            }}>
              {sale.title}
            </h1>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "20px" }}>
              <div style={infoRowStyle}>
                <MapPin size={17} color="#A8542C" style={{ marginTop: "2px", flexShrink: 0 }} />
                <span>
                  {sale.address_visible !== false && sale.address
                    ? <>{sale.address}<br /></>
                    : <em style={{ color: "#9A8472" }}>Contact poster for full address<br /></em>}
                  {sale.city}, {sale.state} {sale.zip}
                </span>
              </div>
              {isThrift ? (
                <div style={infoRowStyle}>
                  <ShoppingBag size={17} color="#3A8A6E" style={{ flexShrink: 0 }} />
                  <span style={{ color: '#3A8A6E', fontWeight: 600 }}>Permanent Location</span>
                </div>
              ) : (
                <>
                  <div style={infoRowStyle}>
                    <Calendar size={17} color="#A8542C" style={{ flexShrink: 0 }} />
                    <span>{formatDate(sale.sale_date)}</span>
                  </div>
                  {(sale.start_time || sale.end_time) && (
                    <div style={infoRowStyle}>
                      <Clock size={17} color="#A8542C" style={{ flexShrink: 0 }} />
                      <span>{[formatTime(sale.start_time), formatTime(sale.end_time)].filter(Boolean).join(' – ')}</span>
                    </div>
                  )}
                </>
              )}
            </div>

            {sale.description && (
              <p style={{ fontSize: "15.5px", lineHeight: 1.6, color: "#3D2E26", margin: "0 0 20px" }}>
                {sale.description}
              </p>
            )}

            {sale.categories?.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "20px" }}>
                {sale.categories.map(cat => (
                  <span key={cat} style={{
                    padding: "4px 10px", borderRadius: "999px",
                    background: "#F0E6D6", color: "#7A5C44", fontSize: "12px", fontWeight: 600,
                  }}>{cat}</span>
                ))}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
              paddingTop: "16px", borderTop: "1px dashed #E8DCC8" }}>
              {sale.source && (
                <span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#9A8472" }}>
                  <Tag size={12} /> via {sale.source}
                </span>
              )}
              <a href={buildMapUrl(sale)} target="_blank" rel="noopener noreferrer"
                style={{
                  display: "inline-flex", alignItems: "center", gap: "6px",
                  padding: "10px 16px", borderRadius: "10px",
                  background: "#A8542C", color: "#FFFCF6",
                  textDecoration: "none", fontSize: "14px", fontWeight: 700,
                }}
              >
                <MapPin size={15} /> Open in Maps <ExternalLink size={13} />
              </a>
            </div>
          </article>
        )}
      </div>

      <style>{`
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        .spin { animation: spin 1s linear infinite }
      `}</style>
    </div>
  );
}
