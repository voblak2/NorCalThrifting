import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, ShoppingBag, ChevronLeft, ExternalLink, Loader2 } from 'lucide-react';
import { buildMapUrl } from './shared.js';
import { useSEO } from './useSEO.js';
import { useSales } from './useSales.js';

export default function ThriftDirectory() {
  const { sales, loading, error } = useSales('sale_type=thrift_store&limit=500');
  const stores = useMemo(
    () => [...sales].sort((a, b) => a.city.localeCompare(b.city) || a.title.localeCompare(b.title)),
    [sales]
  );

  useSEO({
    title: 'Thrift Store Directory — Goodwill, Salvation Army & Independent Shops in Northern California | NorCal Thrifting',
    description: 'A directory of thrift, vintage, and secondhand stores across Sacramento, the Central Valley, and Northern California — Goodwill, Salvation Army, Habitat ReStore, and independent shops.',
    path: '/thrift-stores',
  });

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(180deg, #FBF5EC 0%, #F5EDDF 100%)",
      fontFamily: "'Nunito', system-ui, sans-serif",
      color: "#3D2E26",
    }}>
      <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "32px 24px" }}>
        <Link to="/" style={{
          display: "inline-flex", alignItems: "center", gap: "6px",
          color: "#A8542C", fontSize: "14px", fontWeight: 700,
          textDecoration: "none", marginBottom: "24px",
        }}>
          <ChevronLeft size={16} /> Back to all listings
        </Link>

        <div style={{
          display: "inline-flex", alignItems: "center", gap: "10px",
          padding: "6px 14px", borderRadius: "999px",
          background: "rgba(58, 138, 110, 0.12)", color: "#3A8A6E",
          fontSize: "13px", fontWeight: 600, letterSpacing: "0.04em", marginBottom: "16px",
        }}>
          <ShoppingBag size={14} /> THRIFT STORE DIRECTORY
        </div>
        <h1 style={{
          fontFamily: "'Fraunces', serif", fontSize: "clamp(32px, 5vw, 48px)",
          fontWeight: 600, fontStyle: "italic", margin: "0 0 12px",
          letterSpacing: "-0.02em", color: "#2C1F17", lineHeight: 1.1,
        }}>
          Thrift &amp; secondhand stores across Northern California
        </h1>
        <p style={{ fontSize: "16px", color: "#6B5444", maxWidth: "640px", margin: "0 0 32px", lineHeight: 1.5 }}>
          Goodwill, Salvation Army, Habitat ReStore, and independent thrift, vintage, and antique shops around Sacramento and the Central Valley.
        </p>

        {loading && (
          <div style={{ display: "flex", alignItems: "center", gap: "10px", color: "#9A8472", padding: "20px 0" }}>
            <Loader2 size={20} className="spin" /> Loading stores…
          </div>
        )}

        {!loading && stores.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px 20px",
            background: "#FFFCF6", borderRadius: "20px", border: "1px dashed #E8DCC8" }}>
            <p style={{ color: "#9A8472", fontSize: "15px", margin: 0 }}>
              {error ? "Couldn't load stores right now — try again shortly." : "No stores found right now — check back soon."}
            </p>
          </div>
        )}

        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "16px",
        }}>
          {stores.map(store => (
            <article key={store.id} style={{
              background: "#FFFCF6", border: "1px solid #E8DCC8", borderRadius: "16px", padding: "20px",
              display: "flex", flexDirection: "column", gap: "10px",
              boxShadow: "0 2px 12px rgba(61, 46, 38, 0.05)",
            }}>
              <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: "19px", fontWeight: 600, margin: 0, color: "#2C1F17" }}>
                <Link to={`/listing/${store.id}`} style={{ color: "inherit", textDecoration: "none" }}>
                  {store.title}
                </Link>
              </h2>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "8px", color: "#6B5444", fontSize: "13.5px" }}>
                <MapPin size={15} color="#3A8A6E" style={{ marginTop: "2px", flexShrink: 0 }} />
                <span>
                  {store.address && <>{store.address}<br /></>}
                  {store.city}, {store.state} {store.zip}
                </span>
              </div>
              <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
                <Link to={`/listing/${store.id}`} style={{
                  padding: "6px 12px", borderRadius: "8px", border: "1px solid #E8DCC8",
                  color: "#6B5444", textDecoration: "none", fontSize: "12.5px", fontWeight: 700,
                }}>
                  Details
                </Link>
                <a href={buildMapUrl(store)} target="_blank" rel="noopener noreferrer" style={{
                  display: "inline-flex", alignItems: "center", gap: "5px",
                  padding: "6px 12px", borderRadius: "8px",
                  background: "#3A8A6E", color: "#FFFCF6",
                  textDecoration: "none", fontSize: "12.5px", fontWeight: 700,
                }}>
                  Maps <ExternalLink size={11} />
                </a>
              </div>
            </article>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        .spin { animation: spin 1s linear infinite }
      `}</style>
    </div>
  );
}
