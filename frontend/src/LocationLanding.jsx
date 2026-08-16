import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, Loader2, MapPin } from 'lucide-react';
import { useSEO } from './useSEO.js';
import { LOCATIONS } from './locations.js';
import SaleCard from './SaleCard.jsx';
import { useSales } from './useSales.js';

export default function LocationLanding({ region }) {
  const config = LOCATIONS[region];
  const { sales, loading, error } = useSales('limit=500');
  const [expandedIds, setExpandedIds] = useState(new Set());

  const filtered = useMemo(() => {
    if (!config.cities) return sales;
    return sales.filter(s => s.city && config.cities.some(c => s.city.toLowerCase().includes(c)));
  }, [sales, config.cities]);

  const toggleExpanded = (id) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  useSEO({
    title: config.metaTitle,
    description: config.metaDescription,
    path: config.path,
  });

  const otherRegions = Object.entries(LOCATIONS).filter(([key]) => key !== region);

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

        <h1 style={{
          fontFamily: "'Fraunces', serif", fontSize: "clamp(32px, 5vw, 48px)",
          fontWeight: 600, fontStyle: "italic", margin: "0 0 20px",
          letterSpacing: "-0.02em", color: "#2C1F17", lineHeight: 1.1,
        }}>
          {config.h1}
        </h1>

        <div style={{ maxWidth: "760px", marginBottom: "36px" }}>
          {config.body.map((para, i) => (
            <p key={i} style={{ fontSize: "16px", color: "#6B5444", lineHeight: 1.6, margin: "0 0 16px" }}>
              {para}
            </p>
          ))}
        </div>

        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "baseline",
          flexWrap: "wrap", gap: "8px", marginBottom: "16px",
        }}>
          <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: "22px", fontWeight: 600, margin: 0, color: "#2C1F17" }}>
            Current listings
          </h2>
          {!loading && !error && (
            <span style={{ color: "#6B5444", fontSize: "15px" }}>
              {filtered.length} {filtered.length === 1 ? "listing" : "listings"} found
            </span>
          )}
        </div>

        {loading && (
          <div style={{ display: "flex", alignItems: "center", gap: "10px", color: "#9A8472", padding: "20px 0" }}>
            <Loader2 size={20} className="spin" /> Loading listings…
          </div>
        )}

        {!loading && error && (
          <div style={{ textAlign: "center", padding: "60px 20px",
            background: "#FFFCF6", borderRadius: "20px", border: "1px dashed #E8DCC8" }}>
            <p style={{ color: "#9A8472", fontSize: "15px", margin: 0 }}>
              Couldn't load listings right now — try the <Link to="/" style={{ color: "#A8542C", fontWeight: 700 }}>full site</Link> instead.
            </p>
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px 20px",
            background: "#FFFCF6", borderRadius: "20px", border: "1px dashed #E8DCC8" }}>
            <p style={{ fontFamily: "'Fraunces', serif", fontSize: "20px", fontStyle: "italic", color: "#6B5444", margin: "0 0 8px" }}>
              No listings in this area right now
            </p>
            <p style={{ color: "#9A8472", fontSize: "15px", margin: 0 }}>
              Check back soon, or browse the <Link to="/" style={{ color: "#A8542C", fontWeight: 700 }}>full map and listings</Link>.
            </p>
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: "20px",
            alignItems: "start", marginBottom: "48px",
          }}>
            {filtered.map(sale => (
              <SaleCard
                key={sale.id}
                sale={sale}
                expanded={expandedIds.has(sale.id)}
                onToggleExpanded={() => toggleExpanded(sale.id)}
              />
            ))}
          </div>
        )}

        <div style={{ paddingTop: "24px", borderTop: "1px dashed #E8DCC8" }}>
          <p style={{ fontSize: "13px", color: "#9A8472", marginBottom: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Explore other NorCal regions
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {otherRegions.map(([key, loc]) => (
              <Link key={key} to={loc.path} style={{
                display: "inline-flex", alignItems: "center", gap: "6px",
                padding: "6px 14px", borderRadius: "999px",
                background: "#FFFCF6", border: "1px solid #E8DCC8", color: "#6B5444",
                fontSize: "13px", fontWeight: 600, textDecoration: "none",
              }}>
                <MapPin size={13} color="#A8542C" /> {loc.shortLabel}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        .spin { animation: spin 1s linear infinite }
      `}</style>
    </div>
  );
}
