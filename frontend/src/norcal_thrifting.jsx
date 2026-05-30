import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  Search, MapPin, Calendar, Clock, Tag, ExternalLink, X, Sparkles,
  Heart, Filter, Plus, Loader2, AlertCircle, Shield, LogOut, User,
  ChevronRight, LayoutDashboard, RefreshCw, Users, List,
} from 'lucide-react';

// ─── Backend configuration ─────────────────────────────────────────────────
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
    city: "Sacramento", state: "CA", zip: "95814",
    sale_date: "2026-05-02", start_time: "09:00", end_time: "16:00",
    description: "Estate of a longtime architect. Eames-era furniture, Heath ceramics, original artwork, drafting tables, slide rules, an extensive jazz collection.",
    categories: ["Estate Sale", "Vintage", "Art", "Furniture"], source: "EstateSales.net", address_visible: true },
  { id: 4, title: "Neighborhood-Wide Garage Sale", address: "Riverbend Subdivision (start at Clubhouse)",
    city: "Elk Grove", state: "CA", zip: "95758",
    sale_date: "2026-05-09", start_time: "07:30", end_time: "15:00",
    description: "Over 40 homes participating! Maps available at the clubhouse. Baby gear, electronics, sporting goods, books, furniture, plants, and a community bake sale fundraiser.",
    categories: ["Multi-Family", "Community", "Everything"], source: "Nextdoor", address_visible: true },
  { id: 5, title: "Books, Books, and More Books", address: "412 Elm Street",
    city: "Davis", state: "CA", zip: "95616",
    sale_date: "2026-05-04", start_time: "10:00", end_time: "17:00",
    description: "Retired professor liquidating personal library. Over 3,000 books — literary fiction, poetry, philosophy, history, and rare first editions. All paperbacks $1, hardcovers $3.",
    categories: ["Books", "Collectibles"], source: "Local Newspaper", address_visible: true },
  { id: 6, title: "Moving Sale — Everything Must Go", address: "1820 Cherry Blossom Way",
    city: "Folsom", state: "CA", zip: "95630",
    sale_date: "2026-05-10", start_time: "09:00", end_time: "15:00",
    description: "Relocating out of state. Modern furniture (couch, bed, dining set), full kitchen set, two bicycles, camping gear, plants. Make reasonable offers.",
    categories: ["Furniture", "Outdoor", "Home Goods"], source: "Facebook Marketplace", address_visible: true },
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
function initials(name) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

export default function NorCalThrifting() {
  const [query, setQuery]           = useState("");
  const [stateFilter, setStateFilter] = useState("All");
  const [showFilters, setShowFilters] = useState(false);
  const [favorites, setFavorites]   = useState(new Set());
  const [showFaves, setShowFaves]   = useState(false);
  const [sortBy, setSortBy]         = useState("date");
  const [sales, setSales]           = useState(SAMPLE_SALES);
  const [loading, setLoading]       = useState(false);
  const [usingFallback, setUsingFallback] = useState(false);
  const [showSubmit, setShowSubmit] = useState(false);
  const [showAdmin, setShowAdmin]   = useState(false);

  // Auth state
  const [user, setUser]         = useState(null);   // null = not logged in
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState('signin'); // 'signin' | 'signup'

  // ─── Restore session on mount ─────────────────────────────────────────────
  useEffect(() => {
    fetch(`${API_URL}/auth/me`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data?.user) return;
        setUser(data.user);
        return fetch(`${API_URL}/favorites`, { credentials: 'include' })
          .then(r => r.ok ? r.json() : { ids: [] })
          .then(fav => setFavorites(new Set(fav.ids || [])));
      })
      .catch(() => {});
  }, []);

  // ─── Fetch sales ──────────────────────────────────────────────────────────
  const debounceRef = useRef(null);
  const fetchSales = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      if (stateFilter && stateFilter !== 'All') params.set('state', stateFilter);
      const res = await fetch(`${API_URL}/sales?${params.toString()}`, {
        credentials: 'include',
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok) throw new Error('bad status');
      const data = await res.json();
      setSales(data.sales || []);
      setUsingFallback(false);
    } catch {
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

  // ─── Client-side filter + sort ────────────────────────────────────────────
  const filtered = useMemo(() => {
    let results = sales;
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

  // ─── Favorites ────────────────────────────────────────────────────────────
  const toggleFave = async (id) => {
    if (user) {
      try {
        const res = await fetch(`${API_URL}/favorites/${id}`, {
          method: 'POST', credentials: 'include',
        });
        const data = await res.json();
        setFavorites(prev => {
          const next = new Set(prev);
          data.favorited ? next.add(id) : next.delete(id);
          return next;
        });
      } catch {}
    } else {
      // Not logged in — toggle locally and nudge them to sign in
      setFavorites(prev => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
      });
    }
  };

  // ─── Sign out ─────────────────────────────────────────────────────────────
  const signOut = async () => {
    await fetch(`${API_URL}/auth/signout`, { method: 'POST', credentials: 'include' });
    setUser(null);
    setFavorites(new Set());
  };

  const openMap = (sale, e) => {
    e.preventDefault();
    window.open(buildMapUrl(sale), "_blank", "noopener,noreferrer");
  };

  const handleAuthSuccess = (loggedInUser) => {
    setUser(loggedInUser);
    setShowAuth(false);
    // Load server favorites
    fetch(`${API_URL}/favorites`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : { ids: [] })
      .then(fav => setFavorites(new Set(fav.ids || [])))
      .catch(() => {});
  };

  const openAddSale = () => {
    if (!user) {
      setAuthMode('signin');
      setShowAuth(true);
    } else {
      setShowSubmit(true);
    }
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

      {/* ─── Admin Banner ────────────────────────────────────────────────── */}
      {user?.role === 'admin' && (
        <div style={{
          position: "sticky", top: 0, zIndex: 200,
          background: "#A8542C", color: "#FFFCF6",
          padding: "10px 24px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
        }}>
          <span style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", fontWeight: 700 }}>
            <Shield size={16} />
            Admin — {user.name}
          </span>
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={() => setShowAdmin(true)} style={{
              display: "flex", alignItems: "center", gap: "6px",
              background: "rgba(255,252,246,0.15)", border: "1px solid rgba(255,252,246,0.3)",
              color: "#FFFCF6", borderRadius: "8px", padding: "5px 12px",
              fontSize: "13px", fontWeight: 600, fontFamily: "inherit", cursor: "pointer",
            }}>
              <LayoutDashboard size={14} /> Dashboard
            </button>
            <button onClick={signOut} style={{
              display: "flex", alignItems: "center", gap: "6px",
              background: "rgba(255,252,246,0.15)", border: "1px solid rgba(255,252,246,0.3)",
              color: "#FFFCF6", borderRadius: "8px", padding: "5px 12px",
              fontSize: "13px", fontWeight: 600, fontFamily: "inherit", cursor: "pointer",
            }}>
              <LogOut size={14} /> Sign out
            </button>
          </div>
        </div>
      )}

      <header style={{ position: "relative", zIndex: 1, padding: "32px 24px 16px", maxWidth: "1100px", margin: "0 auto" }}>
        {/* ─── User bar ────────────────────────────────────────────────── */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "16px" }}>
          {user && user.role !== 'admin' ? (
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{
                width: "32px", height: "32px", borderRadius: "50%",
                background: "#A8542C", color: "#FFFCF6",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "13px", fontWeight: 700,
              }}>
                {initials(user.name)}
              </div>
              <span style={{ fontSize: "14px", color: "#6B5444" }}>Hi, {user.name.split(' ')[0]}</span>
              <button onClick={signOut} style={{
                display: "flex", alignItems: "center", gap: "5px",
                background: "none", border: "1px solid #E8DCC8", borderRadius: "8px",
                padding: "5px 10px", fontSize: "13px", color: "#9A8472",
                fontFamily: "inherit", cursor: "pointer",
              }}>
                <LogOut size={13} /> Sign out
              </button>
            </div>
          ) : !user ? (
            <button
              onClick={() => { setAuthMode('signin'); setShowAuth(true); }}
              style={{
                display: "flex", alignItems: "center", gap: "6px",
                background: "none", border: "1px solid #E8DCC8", borderRadius: "8px",
                padding: "7px 14px", fontSize: "14px", fontWeight: 600,
                color: "#A8542C", fontFamily: "inherit", cursor: "pointer",
              }}
            >
              <User size={15} /> Sign in
            </button>
          ) : null}
        </div>

        <div style={{ textAlign: "center" }}>
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
        </div>
      </header>

      {/* Status banner when using fallback data */}
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
              Showing bundled sample data — backend API at{' '}
              <code style={{ background: "rgba(0,0,0,0.05)", padding: "1px 6px", borderRadius: "4px", fontFamily: "monospace" }}>
                {API_URL}
              </code>{' '}
              isn't reachable.
            </span>
          </div>
        </div>
      )}

      {/* ─── Search bar ──────────────────────────────────────────────────── */}
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
                <button onClick={() => setQuery("")}
                  style={{ background: "none", border: "none", cursor: "pointer", padding: "4px", color: "#9A8472" }}>
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
            <button onClick={openAddSale} style={btnStyle(false, "#A8542C", true)}>
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

      {/* ─── Not-logged-in favorites nudge ───────────────────────────────── */}
      {!user && favorites.size > 0 && (
        <div style={{
          position: "relative", zIndex: 1, maxWidth: "1100px",
          margin: "10px auto 0", padding: "0 24px",
        }}>
          <button
            onClick={() => { setAuthMode('signup'); setShowAuth(true); }}
            style={{
              width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
              padding: "10px 16px", borderRadius: "12px", border: "1px dashed #C9B89E",
              background: "rgba(200, 160, 100, 0.07)", color: "#7A5C44",
              fontSize: "13px", fontWeight: 600, fontFamily: "inherit", cursor: "pointer",
            }}
          >
            <Heart size={14} fill="#C66B3D" color="#C66B3D" />
            Sign in to save your {favorites.size} {favorites.size === 1 ? 'favorite' : 'favorites'} permanently
            <ChevronRight size={14} />
          </button>
        </div>
      )}

      {/* ─── Results header ───────────────────────────────────────────────── */}
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

      {/* ─── Sale cards ───────────────────────────────────────────────────── */}
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
                  {sale.address_visible !== false && sale.address
                    ? <>{sale.address}<br /></>
                    : <em style={{ color: "#9A8472" }}>Contact poster for full address<br /></em>}
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
      {showAdmin && <AdminDashboard user={user} onClose={() => setShowAdmin(false)} />}
      {showAuth && (
        <AuthModal
          mode={authMode}
          onSwitchMode={setAuthMode}
          onSuccess={handleAuthSuccess}
          onClose={() => setShowAuth(false)}
        />
      )}

      <style>{`
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        .spin { animation: spin 1s linear infinite }
      `}</style>
    </div>
  );
}

// ─── Auth Modal ─────────────────────────────────────────────────────────────
function AuthModal({ mode, onSwitchMode, onSuccess, onClose }) {
  const [name, setName]         = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]       = useState(null);

  const isSignUp = mode === 'signup';

  const submit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const body = isSignUp ? { name, email, password } : { email, password };
      const res = await fetch(`${API_URL}/auth/${isSignUp ? 'signup' : 'signin'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        const msgs = {
          missing_fields:     'Please fill in all fields.',
          invalid_email:      'Enter a valid email address.',
          password_too_short: 'Password must be at least 8 characters.',
          email_taken:        'That email is already registered. Sign in instead?',
          invalid_credentials:'Incorrect email or password.',
          invalid_name:       'Name must be between 1 and 80 characters.',
        };
        throw new Error(msgs[data.error] || 'Something went wrong. Try again.');
      }
      onSuccess(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleKey = (e) => { if (e.key === 'Enter') submit(); };

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(44, 31, 23, 0.5)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 100, padding: "20px", backdropFilter: "blur(4px)",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "#FFFCF6", borderRadius: "20px", padding: "28px",
        maxWidth: "400px", width: "100%",
        boxShadow: "0 20px 60px rgba(44, 31, 23, 0.3)",
      }}>
        {/* Tabs */}
        <div style={{ display: "flex", marginBottom: "24px", borderBottom: "1px solid #E8DCC8" }}>
          {['signin', 'signup'].map(m => (
            <button key={m} onClick={() => { onSwitchMode(m); setError(null); }} style={{
              flex: 1, padding: "10px", border: "none", background: "none",
              fontFamily: "inherit", fontSize: "15px", fontWeight: 700, cursor: "pointer",
              color: mode === m ? "#A8542C" : "#9A8472",
              borderBottom: mode === m ? "2px solid #A8542C" : "2px solid transparent",
              marginBottom: "-1px", transition: "all 0.15s",
            }}>
              {m === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          ))}
          <button onClick={onClose} style={{
            background: "none", border: "none", cursor: "pointer", color: "#9A8472", padding: "8px",
          }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {isSignUp && (
            <Field label="Your name" value={name} onChange={setName} placeholder="First Last" onKeyDown={handleKey} />
          )}
          <Field label="Email" type="email" value={email} onChange={setEmail} placeholder="you@example.com" onKeyDown={handleKey} />
          <Field label="Password" type="password" value={password} onChange={setPassword}
            placeholder={isSignUp ? "At least 8 characters" : "Your password"} onKeyDown={handleKey} />

          {error && (
            <div style={{
              padding: "10px 14px", borderRadius: "8px",
              background: "rgba(198, 107, 61, 0.1)", color: "#A8542C", fontSize: "13px",
            }}>
              {error}
            </div>
          )}

          <button onClick={submit} disabled={submitting} style={{
            marginTop: "4px", padding: "14px", borderRadius: "12px",
            background: "#A8542C", color: "#FFFCF6", border: "none",
            fontSize: "16px", fontWeight: 700, fontFamily: "inherit",
            cursor: submitting ? "wait" : "pointer", opacity: submitting ? 0.6 : 1,
            display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
          }}>
            {submitting && <Loader2 size={16} className="spin" />}
            {submitting ? (isSignUp ? 'Creating account…' : 'Signing in…') : (isSignUp ? 'Create account' : 'Sign in')}
          </button>

          <p style={{ textAlign: "center", fontSize: "13px", color: "#9A8472", margin: 0 }}>
            {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
            <button onClick={() => { onSwitchMode(isSignUp ? 'signin' : 'signup'); setError(null); }} style={{
              background: "none", border: "none", color: "#A8542C", fontWeight: 700,
              cursor: "pointer", fontSize: "13px", fontFamily: "inherit", padding: 0,
            }}>
              {isSignUp ? 'Sign in' : 'Sign up'}
            </button>
          </p>
        </div>
      </div>
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
        credentials: 'include',
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

function Field({ label, value, onChange, placeholder, type = 'text', multiline = false, onKeyDown }) {
  const Tag = multiline ? 'textarea' : 'input';
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "13px", fontWeight: 600, color: "#6B5444" }}>
      {label}
      <Tag type={type} value={value} placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        onKeyDown={onKeyDown}
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

// ─── Admin Dashboard ────────────────────────────────────────────────────────
function AdminDashboard({ user, onClose }) {
  const [tab, setTab]               = useState('listings');
  const [stats, setStats]           = useState(null);
  const [sales, setSales]           = useState([]);
  const [users, setUsers]           = useState([]);
  const [salesFilter, setSalesFilter] = useState('all');
  const [loading, setLoading]       = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const [scraperBusy, setScraperBusy] = useState(false);
  const [scraperResult, setScraperResult] = useState(null);

  const loadStats = useCallback(() => {
    fetch(`${API_URL}/admin/stats`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setStats(d))
      .catch(() => {});
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  useEffect(() => {
    setLoading(true);
    setFetchError(null);
    if (tab === 'listings') {
      const qs = salesFilter !== 'all' ? `?status=${salesFilter}` : '';
      fetch(`${API_URL}/admin/sales${qs}`, { credentials: 'include' })
        .then(r => {
          if (!r.ok) { setFetchError(`Error ${r.status}`); return null; }
          return r.json();
        })
        .then(d => d && setSales(d.sales || []))
        .catch(err => setFetchError(err.message))
        .finally(() => setLoading(false));
    } else if (tab === 'users') {
      fetch(`${API_URL}/admin/users`, { credentials: 'include' })
        .then(r => {
          if (!r.ok) { setFetchError(`Error ${r.status}`); return null; }
          return r.json();
        })
        .then(d => d && setUsers(d.users || []))
        .catch(err => setFetchError(err.message))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [tab, salesFilter]);

  const patchSale = async (id, status) => {
    await fetch(`${API_URL}/admin/sales/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      credentials: 'include', body: JSON.stringify({ status }),
    }).catch(() => {});
    setSales(prev => prev.map(s => s.id === id ? { ...s, status } : s));
    loadStats();
  };

  const patchUser = async (id, role) => {
    await fetch(`${API_URL}/admin/users/${id}/role`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      credentials: 'include', body: JSON.stringify({ role }),
    }).catch(() => {});
    setUsers(prev => prev.map(u => u.id === id ? { ...u, role } : u));
  };

  const runScraper = async () => {
    setScraperBusy(true);
    setScraperResult(null);
    try {
      const res = await fetch(`${API_URL}/admin/refresh`, { method: 'POST', credentials: 'include' });
      const text = await res.text();
      const data = text ? JSON.parse(text) : { ok: false, error: 'Empty response' };
      setScraperResult(data);
      loadStats();
    } catch (err) {
      setScraperResult({ ok: false, error: err.message || 'Request failed' });
    }
    setScraperBusy(false);
  };

  const badge = (value) => {
    const map = {
      active:   ['#5A6E50', 'rgba(90,110,80,0.12)'],
      pending:  ['#8C6B1F', 'rgba(140,107,31,0.12)'],
      rejected: ['#8C3A2A', 'rgba(140,58,42,0.12)'],
      admin:    ['#A8542C', 'rgba(168,84,44,0.12)'],
      customer: ['#6B5444', 'rgba(107,84,68,0.1)'],
    };
    const [color, bg] = map[value] || ['#666', '#eee'];
    return (
      <span style={{ padding: '2px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 700, color, background: bg }}>
        {value}
      </span>
    );
  };

  const actionBtn = (color, label, onClick) => (
    <button onClick={onClick} style={{
      padding: '4px 10px', borderRadius: '6px', border: 'none',
      background: color + '22', color, fontSize: '12px', fontWeight: 700,
      fontFamily: 'inherit', cursor: 'pointer',
    }}>{label}</button>
  );

  const TABS = [
    { key: 'listings', label: 'Listings', icon: <List size={14} /> },
    { key: 'users',    label: 'Users',    icon: <Users size={14} /> },
    { key: 'scraper',  label: 'Scraper',  icon: <RefreshCw size={14} /> },
  ];

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(44, 31, 23, 0.6)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      zIndex: 300, padding: '20px', backdropFilter: 'blur(4px)', overflowY: 'auto',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#FFFCF6', borderRadius: '20px', padding: '28px',
        maxWidth: '960px', width: '100%', marginTop: '20px',
        boxShadow: '0 20px 60px rgba(44, 31, 23, 0.3)',
      }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: '26px', fontWeight: 600, margin: 0, color: '#2C1F17', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Shield size={20} color="#A8542C" /> Admin Dashboard
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9A8472' }}>
            <X size={24} />
          </button>
        </div>

        {/* Stats */}
        {stats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '24px' }}>
            {[
              { label: 'Total sales',      value: stats.totalSales },
              { label: 'Pending review',   value: stats.pendingSales },
              { label: 'Registered users', value: stats.totalUsers },
              { label: 'Last scraper run', value: stats.lastScraperRun
                  ? new Date(stats.lastScraperRun.replace(' ', 'T')).toLocaleDateString()
                  : 'Never' },
            ].map(({ label, value }) => (
              <div key={label} style={{ background: '#FBF5EC', border: '1px solid #E8DCC8', borderRadius: '12px', padding: '14px 16px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#9A8472', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>{label}</div>
                <div style={{ fontSize: '22px', fontWeight: 700, color: '#2C1F17', fontFamily: "'Fraunces', serif" }}>{value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', marginBottom: '20px', borderBottom: '1px solid #E8DCC8' }}>
          {TABS.map(({ key, label, icon }) => (
            <button key={key} onClick={() => setTab(key)} style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '10px 20px', border: 'none', background: 'none',
              fontFamily: 'inherit', fontSize: '14px', fontWeight: 700, cursor: 'pointer',
              color: tab === key ? '#A8542C' : '#9A8472',
              borderBottom: tab === key ? '2px solid #A8542C' : '2px solid transparent',
              marginBottom: '-1px', transition: 'color 0.15s',
            }}>
              {icon} {label}
            </button>
          ))}
        </div>

        {fetchError && (
          <div style={{ padding: '14px 16px', borderRadius: '10px', marginBottom: '16px',
            background: 'rgba(140,58,42,0.08)', border: '1px solid rgba(140,58,42,0.2)', color: '#8C3A2A', fontSize: '14px' }}>
            <strong>Could not load data:</strong> {fetchError}
            {fetchError.includes('401') || fetchError.includes('403')
              ? ' — You may need to sign out and sign back in.'
              : ' — Is the backend server running?'}
          </div>
        )}
        {loading && (
          <div style={{ textAlign: 'center', padding: '40px', color: '#9A8472' }}>
            <Loader2 size={24} className="spin" />
          </div>
        )}

        {/* ── Listings tab ── */}
        {tab === 'listings' && !loading && (
          <div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              {['all', 'pending', 'active', 'rejected'].map(f => (
                <button key={f} onClick={() => setSalesFilter(f)} style={{
                  padding: '5px 14px', borderRadius: '8px', border: '1px solid #E8DCC8',
                  background: salesFilter === f ? '#A8542C' : '#FBF5EC',
                  color: salesFilter === f ? '#FFFCF6' : '#6B5444',
                  fontSize: '13px', fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
                  textTransform: 'capitalize',
                }}>{f}</button>
              ))}
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #E8DCC8', color: '#9A8472', textAlign: 'left' }}>
                    {['Title', 'Location', 'Date', 'Status', 'Source', 'Actions'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', fontWeight: 700 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sales.map(sale => (
                    <tr key={sale.id} style={{ borderBottom: '1px solid #F0E6D6' }}>
                      <td style={{ padding: '10px 12px', maxWidth: '200px' }}>
                        <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600, color: '#2C1F17' }}>
                          {sale.title}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', color: '#6B5444', whiteSpace: 'nowrap' }}>{sale.city}, {sale.state}</td>
                      <td style={{ padding: '10px 12px', color: '#6B5444', whiteSpace: 'nowrap' }}>{sale.sale_date || '—'}</td>
                      <td style={{ padding: '10px 12px' }}>{badge(sale.status)}</td>
                      <td style={{ padding: '10px 12px', color: '#9A8472' }}>{sale.source}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          {sale.status !== 'active'   && actionBtn('#5A6E50', 'Approve', () => patchSale(sale.id, 'active'))}
                          {sale.status !== 'rejected' && actionBtn('#8C3A2A', 'Reject',  () => patchSale(sale.id, 'rejected'))}
                          {sale.status === 'active'   && actionBtn('#8C6B1F', 'Pending', () => patchSale(sale.id, 'pending'))}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {sales.length === 0 && (
                    <tr><td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: '#9A8472' }}>No listings found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Users tab ── */}
        {tab === 'users' && !loading && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #E8DCC8', color: '#9A8472', textAlign: 'left' }}>
                  {['Name', 'Email', 'Role', 'Joined', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', fontWeight: 700 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} style={{ borderBottom: '1px solid #F0E6D6' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 600, color: '#2C1F17' }}>{u.name}</td>
                    <td style={{ padding: '10px 12px', color: '#6B5444' }}>{u.email}</td>
                    <td style={{ padding: '10px 12px' }}>{badge(u.role)}</td>
                    <td style={{ padding: '10px 12px', color: '#9A8472', whiteSpace: 'nowrap' }}>
                      {u.created_at ? new Date(u.created_at.replace(' ', 'T')).toLocaleDateString() : '—'}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      {u.id !== user.id && (
                        u.role === 'admin'
                          ? actionBtn('#8C3A2A', 'Remove admin', () => patchUser(u.id, 'customer'))
                          : actionBtn('#5A6E50', 'Make admin',   () => patchUser(u.id, 'admin'))
                      )}
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr><td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: '#9A8472' }}>No users yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Scraper tab ── */}
        {tab === 'scraper' && (
          <div style={{ padding: '8px 0' }}>
            <p style={{ color: '#6B5444', margin: '0 0 24px', fontSize: '15px', lineHeight: 1.6 }}>
              Manually trigger the Craigslist + EstateSales.net scrapers. This normally runs on the configured cron schedule.
            </p>
            <button onClick={runScraper} disabled={scraperBusy} style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '14px 28px', borderRadius: '12px', border: 'none',
              background: scraperBusy ? '#C9B89E' : '#A8542C', color: '#FFFCF6',
              fontSize: '16px', fontWeight: 700, fontFamily: 'inherit',
              cursor: scraperBusy ? 'wait' : 'pointer',
            }}>
              {scraperBusy ? <Loader2 size={18} className="spin" /> : <RefreshCw size={18} />}
              {scraperBusy ? 'Running scrapers…' : 'Run Scrapers Now'}
            </button>
            {scraperResult && (
              <div style={{
                marginTop: '20px', padding: '16px', borderRadius: '12px', fontSize: '13px',
                background: scraperResult.ok ? 'rgba(90,110,80,0.08)' : 'rgba(140,58,42,0.08)',
                border: `1px solid ${scraperResult.ok ? 'rgba(90,110,80,0.25)' : 'rgba(140,58,42,0.25)'}`,
                color: scraperResult.ok ? '#5A6E50' : '#8C3A2A',
              }}>
                <strong>{scraperResult.ok ? 'Scraper completed.' : 'Scraper failed.'}</strong>
                {scraperResult.ok
                  ? <pre style={{ margin: '8px 0 0', fontFamily: 'monospace', fontSize: '12px', whiteSpace: 'pre-wrap' }}>{JSON.stringify(scraperResult.result, null, 2)}</pre>
                  : <span> {scraperResult.error || scraperResult.message}</span>
                }
              </div>
            )}
            {stats?.lastScraperRun && (
              <p style={{ color: '#9A8472', fontSize: '13px', marginTop: '16px' }}>
                Last run: {new Date(stats.lastScraperRun.replace(' ', 'T')).toLocaleString()}
              </p>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

// ─── Style helpers ──────────────────────────────────────────────────────────
const btnStyle = (active, color, primary = false) => ({
  display: "flex", alignItems: "center", gap: "8px",
  padding: "0 20px", borderRadius: "12px", height: "52px",
  background: primary ? color : (active ? color : "#FBF5EC"),
  color: primary || active ? "#FFFCF6" : "#3D2E26",
  border: "1px solid #E8DCC8",
  fontSize: "15px", fontWeight: 600, fontFamily: "inherit",
  cursor: "pointer", transition: "all 0.2s",
  whiteSpace: "nowrap",
});
const selectStyle = {
  padding: "8px 12px", borderRadius: "8px",
  border: "1px solid #E8DCC8", background: "#FBF5EC",
  fontFamily: "inherit", fontSize: "14px", color: "#3D2E26", cursor: "pointer",
};
const infoRowStyle = { display: "flex", alignItems: "flex-start", gap: "10px", color: "#6B5444", fontSize: "14px" };
