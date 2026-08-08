import { Link } from 'react-router-dom';
import { MapPin, Calendar, Clock, Tag, ExternalLink, Heart, ShoppingBag } from 'lucide-react';
import { API_ORIGIN, formatDate, formatTime, buildMapUrl } from './shared.js';

const infoRowStyle = { display: "flex", alignItems: "flex-start", gap: "10px", color: "#6B5444", fontSize: "14px" };

/**
 * The sale/thrift-store card used on the homepage and on location landing
 * pages. `favorited`/`onToggleFave` are optional — pages that don't have a
 * meaningful (persisted) favorites concept (e.g. location landing pages)
 * can omit them and the heart button is simply not shown, rather than
 * faking local-only state that disappears on refresh.
 */
export default function SaleCard({
  sale, favorited, onToggleFave, expanded, onToggleExpanded, showDetailsLink = true,
}) {
  const openMap = (e) => {
    e.preventDefault();
    window.open(buildMapUrl(sale), "_blank", "noopener,noreferrer");
  };

  return (
    <article style={{
      background: "#FFFCF6", border: "1px solid #E8DCC8", borderRadius: "18px", padding: "22px",
      display: "flex", flexDirection: "column", overflow: "hidden",
      boxShadow: "0 2px 12px rgba(61, 46, 38, 0.05)",
      transition: "transform 0.2s, box-shadow 0.2s", position: "relative",
    }}
    onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.boxShadow = "0 8px 24px rgba(61, 46, 38, 0.1)"; }}
    onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 2px 12px rgba(61, 46, 38, 0.05)"; }}>

      {sale.photo_urls && sale.photo_urls.length > 0 && (
        <div style={{ margin: "-22px -22px 16px", height: "200px", position: "relative", flexShrink: 0 }}>
          <img src={`${API_ORIGIN}${sale.photo_urls[0]}`} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          {sale.photo_urls.length > 1 && (
            <span style={{
              position: "absolute", bottom: "8px", right: "8px",
              background: "rgba(44,31,23,0.65)", color: "#FFFCF6",
              fontSize: "11px", fontWeight: 700, padding: "3px 9px", borderRadius: "999px",
            }}>
              +{sale.photo_urls.length - 1} more
            </span>
          )}
        </div>
      )}

      {onToggleFave && (
        <button onClick={() => onToggleFave(sale.id)} aria-label="Save sale" style={{
          position: "absolute", top: "16px", right: "16px", zIndex: 1,
          background: sale.photo_urls?.length > 0 ? "rgba(255,252,246,0.75)" : "none",
          backdropFilter: sale.photo_urls?.length > 0 ? "blur(4px)" : "none",
          border: "none", cursor: "pointer", padding: "4px", borderRadius: "50%",
          color: favorited ? "#C66B3D" : "#C9B89E",
          transition: "color 0.2s, transform 0.2s",
        }}
        onMouseEnter={e => e.currentTarget.style.transform = "scale(1.15)"}
        onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}>
          <Heart size={22} fill={favorited ? "#C66B3D" : "none"} />
        </button>
      )}

      <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: "22px", fontWeight: 600,
        margin: "0 32px 14px 0", lineHeight: 1.2, color: "#2C1F17" }}>
        {sale.title}
      </h3>

      <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "14px" }}>
        <div style={infoRowStyle}>
          <MapPin size={16} color="#A8542C" style={{ marginTop: "2px", flexShrink: 0 }} />
          <span>
            {sale.address_visible !== false && sale.address
              ? <>{sale.address}<br /></>
              : <em style={{ color: "#9A8472" }}>Contact poster for full address<br /></em>}
            {sale.city}, {sale.state} {sale.zip}
          </span>
        </div>
        {sale.sale_type === 'thrift_store' ? (
          <div style={infoRowStyle}>
            <ShoppingBag size={16} color="#3A8A6E" style={{ flexShrink: 0 }} />
            <span style={{ color: '#3A8A6E', fontWeight: 600 }}>Thrift Store · Permanent Location</span>
          </div>
        ) : (
          <>
            <div style={infoRowStyle}>
              <Calendar size={16} color="#A8542C" style={{ flexShrink: 0 }} />
              <span>{formatDate(sale.sale_date)}</span>
            </div>
            {(sale.start_time || sale.end_time) && (
              <div style={infoRowStyle}>
                <Clock size={16} color="#A8542C" style={{ flexShrink: 0 }} />
                <span>{[formatTime(sale.start_time), formatTime(sale.end_time)].filter(Boolean).join(' – ')}</span>
              </div>
            )}
          </>
        )}
      </div>

      {(() => {
        const isLong = sale.description && sale.description.length > 160;
        return (
          <>
            <p style={{
              fontSize: "14.5px", lineHeight: 1.55, color: "#3D2E26", flex: 1,
              margin: isLong ? "0 0 4px" : "0 0 16px",
              ...(isLong && !expanded
                ? { display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }
                : {}),
            }}>
              {sale.description}
            </p>
            {isLong && onToggleExpanded && (
              <button onClick={onToggleExpanded} style={{
                alignSelf: "flex-start", background: "none", border: "none", padding: 0,
                margin: "0 0 16px", cursor: "pointer",
                color: "#A8542C", fontSize: "13px", fontWeight: 600, textDecoration: "underline",
              }}>
                {expanded ? "Show less" : "Read more"}
              </button>
            )}
          </>
        );
      })()}

      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "16px" }}>
        {sale.categories?.map(cat => (
          <span key={cat} style={{
            padding: "4px 10px", borderRadius: "999px",
            background: "#F0E6D6", color: "#7A5C44", fontSize: "12px", fontWeight: 600,
          }}>{cat}</span>
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
        paddingTop: "14px", borderTop: "1px dashed #E8DCC8" }}>
        <span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#9A8472" }}>
          <Tag size={12} /> via {sale.source}
        </span>
        <div style={{ display: "flex", gap: "8px" }}>
          {showDetailsLink && (
            <Link to={`/listing/${sale.id}`}
              style={{
                display: "inline-flex", alignItems: "center", gap: "6px",
                padding: "8px 14px", borderRadius: "10px",
                background: "none", border: "1px solid #E8DCC8", color: "#6B5444",
                textDecoration: "none", fontSize: "13px", fontWeight: 700,
              }}
            >
              Details
            </Link>
          )}
          <a href={buildMapUrl(sale)} onClick={openMap}
            style={{
              display: "inline-flex", alignItems: "center", gap: "6px",
              padding: "8px 14px", borderRadius: "10px",
              background: "#A8542C", color: "#FFFCF6",
              textDecoration: "none", fontSize: "13px", fontWeight: 700,
              transition: "background 0.2s",
            }}
            onMouseEnter={e => e.currentTarget.style.background = "#8E4521"}
            onMouseLeave={e => e.currentTarget.style.background = "#A8542C"}
          >
            <MapPin size={14} /> Open in Maps <ExternalLink size={12} />
          </a>
        </div>
      </div>
    </article>
  );
}
