import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Search, MapPin, Calendar, Clock, Tag, ExternalLink, X, Sparkles, Heart, Filter, Plus, Loader2, AlertCircle } from 'lucide-react';

// ─── Backend configuration ─────────────────────────────────────────────────
// Relative path — Vite dev server proxies /api → http://localhost:3001/api.
// Production: configure your host (nginx, Caddy, etc.) the same way.
const API_URL = '/api';

// ─── Bundled fallback data ─────────────────────────────────────────────────
const SAMPLE_SALES = [
  { id: 1, title: "Three-Family Block Sale", address: "1247 Maple Grove Lane",
    city: "Sacramento", state: "CA", zip: "95825",
    sale_date: "2026-05-02", start_time: "08:00", end_time: "14:00",
    description: "Three families combining for one massive sale! Vintage vinyl records (jazz, soul, classic rock), a mid-century walnut credenza, KitchenAid mixer, kids' clothes sizes 4-12, hand tools, and an upright piano (free to good home — you haul).",
    categories: ["Furniture", "Vintage", "Kids", "Music"], source: "Facebook Marketplace", address_visible: true },
  { id: 2, title: "Downsizing After 40 Years", address: "892 Hawthorne Road",
    city: "Rancho Cordova", state: "CA", zip: "95670",
    sale_date: "2026-05-03", start_time: "07:00", end_time: "13:00",
    description: "Moving to a condo, everything must go. Antique sewing machine, hand-stitched quilts, cast iron cookware, gardening equipment, holiday decorations, and a workbench full of woodworking tools.",
    categories: ["Antiques", "Tools", "Home Goods"], source: "Craigslist", address_visible: true },
  { id: 3, title: "Estate Sale — Mid-Century Collector", address: "55 Larkspur Drive",
    city: "Portland", state: "OR", zip: "97214",
    sale_date: "2026-05-02", start_time: "09:00", end_time: "16:00",
    description: "Estate of a longtime architect. Eames-era furniture, Heath ceramics, original artwork, drafting tables, slide rules, an extensive jazz collection, and a 1968 Mercedes (sold separately, inquire inside).",
    categories: ["Estate Sale", "Vintage", "Art", "Furniture"], source: "EstateSales.net", address_visible: true },
  { id: 4, title: "Neighborhood-Wide Garage Sale", address: "Riverbend Subdivision (start at Clubhouse)",
    city: "Austin", state: "TX", zip: "78745",
    sale_date: "2026-05-09", start_time: "07:30", end_time: "15:00",
    description: "Over 40 homes participating! Maps available at the clubhouse. Expect everything: baby gear, electronics, sporting goods, books, furniture, plants, and a community bake sale fundraiser.",
    categories: ["Multi-Family", "Community", "Everything"], source: "Nextdoor", address_visible: true },
  { id: 5, title: "Books, Books, and More Books", address: "412 Elm Street",
    city: "Madison", state: "WI", zip: "53703",
    sale_date: "2026-05-04", start_time: "10:00", end_time: "17:00",
    description: "Retired English professor liquidating personal library. Over 3,000 books — literary fiction, poetry, philosophy, history, and rare first editions. All paperbacks $1, hardcovers $3, rare books priced individually.",
    categories: ["Books", "Collectibles"], source: "Local Newspaper", address_visible: true },
  { id: 6, title: "Moving Sale — Everything Must Go", address: "1820 Cherry Blossom Way",
    city: "Seattle", state: "WA", zip: "98103",
    sale_date: "2026-05-10", start_time: "09:00", end_time: "15:00",
    description: "Relocating overseas. Modern furniture (couch, bed, dining set), full kitchen, two bicycles, camping gear, plants. Make reasonable offers.",
    categories: ["Furniture", "Outdoor", "Home Goods"], source: "Facebook Marketplace", address_visible: true },
  { id: 7, title: "Kid Stuff Mega-Sale", address: "67 Sycamore Court",
    city: "Denver", state: "CO", zip: "80206",
    sale_date: "2026-05-03", start_time: "08:00", end_time: "12:00",
    description: "Twins outgrew everything! Strollers, car seats, high chairs, toys for ages 0-5, clothes (NB to 4T), books, and a like-new wooden play kitchen.",
    categories: ["Kids", "Baby Gear"], source: "Nextdoor", address_visible: true },
  { id: 8, title: "Garage Workshop Liquidation", address: "3340 Industrial Park Road",
    city: "Phoenix", state: "AZ", zip: "85016",
    sale_date: "2026-05-09", start_time: "06:30", end_time: "14:00",
    description: "Retiring contractor. Power tools (DeWalt, Milwaukee, Makita), hand tools, ladders, scaffolding, work benches, two tool chests, and assorted lumber. Cash preferred for tools over $50.",
    categories: ["Tools", "Workshop"], source: "Craigslist", address_visible: true },
  { id: 9, title: "Vintage Clothing & Jewelry", address: "228 Magnolia Avenue",
    city: "Charleston", state: "SC", zip: "29401",
    sale_date: "2026-05-04", start_time: "10:00", end_time: "16:00",
    description: "Curated collection from a longtime vintage hunter. 1940s–1980s clothing (all sizes), costume jewelry, hats, handbags, scarves, and a rack of formal wear. Everything cleaned and pressed.",
    categories: ["Clothing", "Vintage", "Jewelry"], source: "Instagram", address_visible: true },
  { id: 10, title: "Plants, Pots & Garden Goods", address: "1501 Greenwood Place",
    city: "Asheville", state: "NC", zip: "28801",
    sale_date: "2026-05-02", start_time: "09:00", end_time: "13:00",
    description: "Plant parent moving to apartment. 100+ houseplants (philodendrons, monsteras, snake plants, orchids), terracotta pots, grow lights, soil, and gardening books.",
    categories: ["Plants", "Garden"], source: "Facebook Marketplace", address_visible: true },
  { id: 11, title: "Record & Stereo Equipment Sale", address: "918 Beacon Street",
    city: "Boston", state: "MA", zip: "02215",
    sale_date: "2026-05-10", start_time: "11:00", end_time: "17:00",
    description: "Audiophile downsizing collection. 800+ LPs (jazz, classical, rock), Technics turntable, McIntosh amplifier, Klipsch speakers, hundreds of CDs.",
    categories: ["Music", "Electronics", "Vintage"], source: "Craigslist", address_visible: true },
  { id: 12, title: "Sports & Outdoor Gear", address: "76 Pinecrest Drive",
    city: "Boulder", state: "CO", zip: "80302",
    sale_date: "2026-05-03", start_time: "08:30", end_time: "14:00",
    description: "Skis, snowboards, climbing gear, two kayaks, mountain bikes, camping tents (2-6 person), backpacks, and ski apparel (M/L). Most gear gently used.",
    categories: ["Outdoor", "Sports"], source: "Nextdoor", address_visible: true },
  { id: 13, title: "Artist's Studio Sale", address: "1145 Industrial Loft #4B",
    city: "Brooklyn", state: "NY", zip: "11211",
    sale_date: "2026-05-04", start_time: "12:00", end_time: "18:00",
    description: "Painter clearing studio. Original canvases (small to large), art supplies, easels, frames, vintage art books, and a flat file cabinet. Cash or Venmo.",
    categories: ["Art", "Vintage"], source: "Instagram", address_visible: true },
  { id: 14, title: "Holiday Decoration Extravaganza", address: "2207 Birch Hollow Lane",
    city: "Minneapolis", state: "MN", zip: "55408",
    sale_date: "2026-05-09", start_time: "08:00", end_time: "13:00",
    description: "Decades of accumulated holiday decor. Christmas (tree, ornaments, lights, nativity), Halloween (costumes, animatronics, lawn decor), Thanksgiving, Easter — even Fourth of July.",
    categories: ["Holiday", "Home Goods"], source: "Local Newspaper", address_visible: true },
  { id: 15, title: "Multi-Family Suburban Sale", address: "488 Willowbrook Court",
    city: "Naperville", state: "IL", zip: "60540",
    sale_date: "2026-05-10", start_time: "07:00", end_time: "15:00",
    description: "Four families on one cul-de-sac. Furniture, electronics, kitchen items, toys, video games, books, exercise equipment, and a fully stocked beverage table for shoppers.",
    categories: ["Multi-Family", "Furniture", "Electronics"], source: "Facebook Marketplace", address_visible: true },
  { id: 16, title: "Crafter's Estate Sale", address: "33 Heritage Lane",
    city: "Nashville", state: "TN", zip: "37205",
    sale_date: "2026-05-02", start_time: "09:00", end_time: "15:00",
    description: "Lifelong quilter and crafter. Sewing machines (Singer, Bernina), thousands of yards of fabric, yarn, beading supplies, scrapbooking materials, and craft furniture.",
    categories: ["Crafts", "Estate Sale"], source: "EstateSales.net", address_visible: true },
];

const STATES = [
  "All", "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS",
  "KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC",
  "ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"
];

function formatDate(s) {
  if (!s) return "Date TBD";
  const d = new Date(s + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}
function formatTime(t) {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${m.toString().padStart(2, "0")} ${period}`;
}
function buildMapUrl(sale) {
  const parts = [sale.address, sale.city, sale.state, sale.zip].filter(Boolean);
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parts.join(', '))}`;
}

export default function NorCalThrifting() {
  const [query, setQuery] = useState("");
  const [stateFilter, setStateFilter] = useState("All");
  const [showFilters, setShowFilters] = useState(false);
  const [favorites, setFavorites] = useState(new Set());
  const [showFaves, setShowFaves] = useState(false);
  const [sortBy, setSortBy] = useState("date");
  const [sales, setSales] = useState(SAMPLE_SALES);
  const [loading, setLoading] = useState(false);
  const [usingFallback, setUsingFallback] = useState(false);
  const [showSubmit, setShowSubmit] = useState(false);

  // Debounced API fetch — refetches whenever search params change.
  // If the API isn't reachable, falls back to the bundled SAMPLE_SALES.
  const debounceRef = useRef(null);
  const fetchSales = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      if (stateFilter && stateFilter !== 'All') params.set('state', stateFilter);
      const res = await fetch(`${API_URL}/sales?${params.toString()}`, { signal: AbortSignal.timeout(4000) });
      if (!res.ok) throw new Error('bad status');
      const data = await res.json();
      setSales(data.sales || []);
      setUsingFallback(false);
    } catch (err) {
      // API unreachable — use bundled samples and let the user know.
      setSales(SAMPLE_SALES);
      setUsingFallback(true);
    } finally {
      setLoading(false);
    }
  }, [query, stateFilter]);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(fetchSales, 250);
    return () => clearTimeout(debounceRef.current);
  }, [fetchSales]);

  // Client-side filtering for favorites + sorting (server already handled q/state)
  const filtered = useMemo(() => {
    let results = sales;

    // If using fallback, do all filtering client-side
    if (usingFallback) {
      const q = query.trim().toLowerCase();
      results = results.filter(s => {
        if (stateFilter !== "All" && s.state !== stateFilter) return false;
        if (!q) return true;
        return (
          s.city.toLowerCase().includes(q) || s.state.toLowerCase() === q ||
          s.zip === q || s.title.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.categories.some(c => c.toLowerCase().includes(q))
        );
      });
    }

    if (showFaves) results = results.filter(s => favorites.has(s.id));

    if (sortBy === "date") {
      results = [...results].sort((a, b) => (a.sale_date || '9999').localeCompare(b.sale_date || '9999'));
    } else if (sortBy === "city") {
      results = [...results].sort((a, b) => a.city.localeCompare(b.city));
    }
    return results;
  }, [sales, usingFallback, query, stateFilter, showFaves, favorites, sortBy]);

  const toggleFave = (id) => {
    setFavorites(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const openMap = (sale, e) => {
    e.preventDefault();
    window.open(buildMapUrl(sale), "_blank", "noopener,noreferrer");
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(180deg, #FBF5EC 0%, #F5EDDF 100%)",
      fontFamily: "'Nunito', system-ui, sans-serif",
      color: "#3D2E26", paddingBottom: "80px",
    }}>
      {/* Paper grain */}
      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none",
        backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.4 0 0 0 0 0.3 0 0 0 0 0.2 0 0 0 0.04 0'/></filter><rect width='200' height='200' filter='url(%23n)'/></svg>")`,
        opacity: 0.6, mixBlendMode: "multiply", zIndex: 0,
      }} />

      <header style={{ position: "relative", zIndex: 1, padding: "32px 24px 16px", maxWidth: "1100px", margin: "0 auto", textAlign: "center" }}>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: "10px",
          padding: "6px 14px", borderRadius: "999px",
          background: "rgba(198, 107, 61, 0.12)", color: "#A8542C",
          fontSize: "13px", fontWeight: 600, letterSpacing: "0.04em", marginBottom: "20px",
        }}>
          <Sparkles size={14} /> WEEKEND TREASURE HUNTING
        </div>
        <h1 style={{
          fontFamily: "'Fraunces', serif", fontSize: "clamp(48px, 7vw, 80px)",
          fontWeight: 600, fontStyle: "italic", margin: "0 0 12px",
          letterSpacing: "-0.02em", color: "#2C1F17", lineHeight: 1,
        }}>
          NorCal Thrifting
        </h1>
        <p style={{ fontSize: "17px", color: "#6B5444", maxWidth: "560px", margin: "0 auto", lineHeight: 1.5 }}>
          Your NorCal guide to garage sales, estate sales, thrift stores, and curbside treasures.
        </p>
      </header>

      {/* Status banner when running on bundled data */}
      {usingFallback && (
        <div style={{
          position: "relative", zIndex: 1, maxWidth: "1100px",
          margin: "8px auto 0", padding: "0 24px",
        }}>
          <div style={{
            display: "flex", alignItems: "center", gap: "10px",
            padding: "10px 16px", borderRadius: "12px",
            background: "rgba(122, 139, 111, 0.12)", color: "#5A6E50",
            fontSize: "13px", border: "1px solid rgba(122, 139, 111, 0.25)",
          }}>
            <AlertCircle size={16} />
            <span>
              Showing bundled sample data — backend API at <code style={{ background: "rgba(0,0,0,0.05)", padding: "1px 6px", borderRadius: "4px", fontFamily: "monospace" }}>{API_URL}</code> isn't reachable.
            </span>
          </div>
        </div>
      )}

      {/* Search */}
      <div style={{ position: "relative", zIndex: 1, maxWidth: "1100px", margin: "24px auto 0", padding: "0 24px" }}>
        <div style={{
          background: "#FFFCF6", border: "1px solid #E8DCC8", borderRadius: "20px", padding: "20px",
          boxShadow: "0 4px 20px rgba(61, 46, 38, 0.06), 0 1px 3px rgba(61, 46, 38, 0.04)",
        }}>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "stretch" }}>
            <div style={{
              flex: "1 1 280px", display: "flex", alignItems: "center",
              background: "#FBF5EC", borderRadius: "12px", padding: "0 16px", border: "1px solid #E8DCC8",
            }}>
              {loading ? <Loader2 size={20} color="#A8542C" className="spin" /> : <Search size={20} color="#A8542C" />}
              <input type="text" placeholder="Search by city, state, ZIP, or what you're hunting for…"
                value={query} onChange={e => setQuery(e.target.value)}
                style={{ flex: 1, border: "none", outline: "none", background: "transparent",
                  padding: "14px 12px", fontSize: "16px", fontFamily: "inherit", color: "#3D2E26" }}
              />
              {query && (
                <button onClick={() => setQuery("")} style={{ background: "none", border: "none", cursor: "pointer", padding: "4px", color: "#9A8472" }}>
                  <X size={18} />
                </button>
              )}
            </div>
            <button onClick={() => setShowFilters(s => !s)} style={btnStyle(showFilters, "#A8542C")}>
              <Filter size={18} /> Filters
            </button>
            <button onClick={() => setShowFaves(s => !s)} style={btnStyle(showFaves, "#7A8B6F")}>
              <Heart size={18} fill={showFaves ? "#FFFCF6" : "none"} />
              Saved {favorites.size > 0 && `(${favorites.size})`}
            </button>
            <button onClick={() => setShowSubmit(true)} style={btnStyle(false, "#A8542C", true)}>
              <Plus size={18} /> Add a Sale
            </button>
          </div>

          {showFilters && (
            <div style={{
              marginTop: "16px", paddingTop: "16px", borderTop: "1px dashed #E8DCC8",
              display: "flex", gap: "16px", flexWrap: "wrap", alignItems: "center",
            }}>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", fontWeight: 600 }}>
                State:
                <select value={stateFilter} onChange={e => setStateFilter(e.target.value)} style={selectStyle}>
                  {STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", fontWeight: 600 }}>
                Sort by:
                <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={selectStyle}>
                  <option value="date">Date (soonest first)</option>
                  <option value="city">City (A–Z)</option>
                </select>
              </label>
            </div>
          )}
        </div>
      </div>

      <div style={{
        position: "relative", zIndex: 1, maxWidth: "1100px",
        margin: "32px auto 16px", padding: "0 24px",
        display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: "8px",
      }}>
        <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: "26px", fontWeight: 600, margin: 0, color: "#2C1F17" }}>
          {showFaves ? "Your saved sales" : "Sales near you"}
        </h2>
        <span style={{ color: "#6B5444", fontSize: "15px" }}>
          {filtered.length} {filtered.length === 1 ? "sale" : "sales"} found
        </span>
      </div>

      <div style={{
        position: "relative", zIndex: 1, maxWidth: "1100px", margin: "0 auto", padding: "0 24px",
        display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: "20px",
      }}>
        {filtered.length === 0 && !loading && (
          <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "60px 20px",
            background: "#FFFCF6", borderRadius: "20px", border: "1px dashed #E8DCC8" }}>
            <p style={{ fontFamily: "'Fraunces', serif", fontSize: "22px", fontStyle: "italic", color: "#6B5444", margin: "0 0 8px" }}>
              No treasures here yet
            </p>
            <p style={{ color: "#9A8472", fontSize: "15px", margin: 0 }}>
              Try a different city, state, or ZIP — or clear your filters.
            </p>
          </div>
        )}

        {filtered.map(sale => (
          <article key={sale.id} style={{
            background: "#FFFCF6", border: "1px solid #E8DCC8", borderRadius: "18px", padding: "22px",
            display: "flex", flexDirection: "column",
            boxShadow: "0 2px 12px rgba(61, 46, 38, 0.05)",
            transition: "transform 0.2s, box-shadow 0.2s", position: "relative",
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.boxShadow = "0 8px 24px rgba(61, 46, 38, 0.1)"; }}
          onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 2px 12px rgba(61, 46, 38, 0.05)"; }}>
            <button onClick={() => toggleFave(sale.id)} aria-label="Save sale" style={{
              position: "absolute", top: "16px", right: "16px",
              background: "none", border: "none", cursor: "pointer", padding: "4px",
              color: favorites.has(sale.id) ? "#C66B3D" : "#C9B89E",
              transition: "color 0.2s, transform 0.2s",
            }}
            onMouseEnter={e => e.currentTarget.style.transform = "scale(1.15)"}
            onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}>
              <Heart size={22} fill={favorites.has(sale.id) ? "#C66B3D" : "none"} />
            </button>

            <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: "22px", fontWeight: 600,
              margin: "0 32px 14px 0", lineHeight: 1.2, color: "#2C1F17" }}>
              {sale.title}
            </h3>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "14px" }}>
              <div style={infoRowStyle}>
                <MapPin size={16} color="#A8542C" style={{ marginTop: "2px", flexShrink: 0 }} />
                <span>
                  {sale.address_visible !== false && sale.address ? (<>{sale.address}<br /></>) :
                    <em style={{ color: "#9A8472" }}>Contact poster for full address<br /></em>}
                  {sale.city}, {sale.state} {sale.zip}
                </span>
              </div>
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
            </div>

            <p style={{ fontSize: "14.5px", lineHeight: 1.55, color: "#3D2E26", margin: "0 0 16px", flex: 1 }}>
              {sale.description}
            </p>

            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "16px" }}>
              {sale.categories.map(cat => (
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
              <a href={buildMapUrl(sale)} onClick={(e) => openMap(sale, e)}
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
          </article>
        ))}
      </div>

      <footer style={{ position: "relative", zIndex: 1, maxWidth: "1100px", margin: "60px auto 0", padding: "0 24px", textAlign: "center" }}>
        <p style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: "16px", color: "#9A8472", margin: 0 }}>
          One person's clutter is another person's treasure.
        </p>
      </footer>

      {showSubmit && <SubmitModal onClose={() => setShowSubmit(false)} onSuccess={fetchSales} />}

      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} } .spin{animation:spin 1s linear infinite}`}</style>
    </div>
  );
}

// ─── Submit modal ───────────────────────────────────────────────────────────
function SubmitModal({ onClose, onSuccess }) {
  const [form, setForm] = useState({
    title: '', address: '', city: '', state: 'CA', zip: '',
    sale_date: '', start_time: '08:00', end_time: '14:00',
    description: '', categories: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  const update = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/sales`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          categories: form.categories.split(',').map(s => s.trim()).filter(Boolean),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'submission failed');
      }
      setDone(true);
      setTimeout(() => { onSuccess?.(); onClose(); }, 1200);
    } catch (err) {
      setError(err.message + ' (is the backend running on port 3001?)');
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
              {submitting ? 'Posting…' : 'Post Sale'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = 'text', multiline = false }) {
  const Tag = multiline ? 'textarea' : 'input';
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "13px", fontWeight: 600, color: "#6B5444" }}>
      {label}
      <Tag type={type} value={value} placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        rows={multiline ? 3 : undefined}
        style={{
          padding: "10px 12px", borderRadius: "10px",
          border: "1px solid #E8DCC8", background: "#FBF5EC",
          fontFamily: "inherit", fontSize: "14px", color: "#3D2E26",
          fontWeight: 400, resize: "vertical",
        }}
      />
    </label>
  );
}

// ─── Style helpers ──────────────────────────────────────────────────────────
const btnStyle = (active, color, primary = false) => ({
  display: "flex", alignItems: "center", gap: "8px",
  padding: "0 20px", borderRadius: "12px",
  background: primary ? color : (active ? color : "#FBF5EC"),
  color: primary || active ? "#FFFCF6" : "#3D2E26",
  border: "1px solid #E8DCC8",
  fontSize: "15px", fontWeight: 600, fontFamily: "inherit",
  cursor: "pointer", transition: "all 0.2s",
});
const selectStyle = {
  padding: "8px 12px", borderRadius: "8px",
  border: "1px solid #E8DCC8", background: "#FBF5EC",
  fontFamily: "inherit", fontSize: "14px", color: "#3D2E26", cursor: "pointer",
};
const infoRowStyle = { display: "flex", alignItems: "flex-start", gap: "10px", color: "#6B5444", fontSize: "14px" };
