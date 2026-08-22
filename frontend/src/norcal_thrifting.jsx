import { lazy, Suspense, useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  Search, MapPin, Calendar, X, Sparkles,
  Heart, Filter, Plus, Loader2, AlertCircle, Map, Home, Zap, ShoppingBag,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { API_URL, formatDate, formatTime, buildMapUrl } from './shared.js';
import { useSEO } from './useSEO.js';
import SaleCard from './SaleCard.jsx';
import { LOCATIONS } from './locations.js';
import { useAuth } from './AuthContext.jsx';
import SubmitModal from './SubmitModal.jsx';
import { btnStyle, selectStyle } from './styles.js';

// MapView (react-leaflet + leaflet) is lazy-loaded: it's the heaviest,
// most rarely-needed piece of the bundle — most visits never open the map.
const MapView = lazy(() => import('./MapView.jsx'));

function LoadingFallback({ minHeight = '200px' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight, color: '#9A8472' }}>
      <Loader2 size={24} className="spin" />
    </div>
  );
}

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

// Guest (not-logged-in) favorites persist per-browser via localStorage, not
// across devices — that's the intended scope. Logged-in favorites live in
// the DB instead (see toggleFave) and never touch these keys.
const GUEST_FAVORITES_KEY = 'nct_guest_favorites';
// Session-only flag (cleared when the tab/browser closes) so the sign-in
// nudge shows at most once per session, not every time a guest hearts something.
const NUDGE_SHOWN_KEY = 'nct_guest_nudge_shown';

// Infinite scroll: how many listings to fetch per batch.
const PAGE_SIZE = 20;
// Where the "how far had the user scrolled" state lives for back-button
// restoration — session-scoped (not permanent), one slot shared across the
// whole feed since only one filter combination can be "current" at a time.
const FEED_SCROLL_KEY = 'nct_feed_scroll';
function feedSignature({ query, cityFilter, dateFrom, dateTo, saleType }) {
  return JSON.stringify({ query, cityFilter, dateFrom, dateTo, saleType });
}

function loadGuestFavorites() {
  try {
    const stored = localStorage.getItem(GUEST_FAVORITES_KEY);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch (err) {
    console.error('[favorites] failed to read guest favorites from localStorage:', err);
    return new Set();
  }
}

// State filter disabled — every listing is CA, so a 50-state dropdown was
// pure dead weight. Left commented (not deleted) in case coverage ever
// expands beyond California. Replaced with a City filter (see cityFilter).
// const STATES = [
//   "All", "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS",
//   "KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC",
//   "ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"
// ];

export default function NorCalThrifting() {
  useSEO({
    title: 'NorCal Thrifting — Garage Sales, Estate Sales & Thrift Stores in Northern California',
    description: 'Browse live garage sales, estate sales, and thrift stores across Sacramento, the Central Valley, and Northern California — updated daily.',
    path: '/',
  });

  const [query, setQuery]           = useState("");
  // const [stateFilter, setStateFilter] = useState("All"); // disabled — see STATES comment above
  const [cityFilter, setCityFilter] = useState("All");
  const [allCities, setAllCities]   = useState([]); // populated once on mount, independent of active filters — see effect below
  const [showFilters, setShowFilters] = useState(false);
  const [favorites, setFavorites]   = useState(loadGuestFavorites);
  const [showFaveNudge, setShowFaveNudge] = useState(false);
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [showFaves, setShowFaves]   = useState(false);
  const [sortBy, setSortBy]         = useState("date");
  const [sales, setSales]           = useState(SAMPLE_SALES);
  const [loading, setLoading]       = useState(false);
  const [usingFallback, setUsingFallback] = useState(false);
  const [showSubmit, setShowSubmit] = useState(false);
  const [viewMode, setViewMode]     = useState('cards'); // 'cards' | 'map'

  // Advanced filters
  const [dateFrom, setDateFrom]   = useState('');
  const [dateTo, setDateTo]       = useState('');
  const [saleType, setSaleType]   = useState('');
  const [openNow, setOpenNow]     = useState(false);

  // Weekend date range (Sat–Sun of current or next weekend)
  const weekendDates = useMemo(() => {
    const today = new Date();
    const dow = today.getDay(); // 0=Sun, 6=Sat
    const daysToSat = dow === 6 ? 0 : dow === 0 ? -1 : 6 - dow;
    const sat = new Date(today);
    sat.setDate(today.getDate() + daysToSat);
    const sun = new Date(sat);
    sun.setDate(sat.getDate() + 1);
    return { from: sat.toISOString().slice(0, 10), to: sun.toISOString().slice(0, 10) };
  }, []);

  const weekendActive = dateFrom === weekendDates.from && dateTo === weekendDates.to;
  const toggleWeekend = () => {
    if (weekendActive) { setDateFrom(''); setDateTo(''); }
    else { setDateFrom(weekendDates.from); setDateTo(weekendDates.to); }
  };

  const activeFilterCount = [
    cityFilter !== 'All', dateFrom, dateTo, saleType, openNow,
  ].filter(Boolean).length;

  // City filter options — fetched once, unfiltered, so picking a city doesn't
  // collapse the dropdown down to just that one option on the next render.
  useEffect(() => {
    fetch(`${API_URL}/sales?limit=500`, { credentials: 'include' })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (!data) return;
        const cities = [...new Set(data.sales.map(s => s.city).filter(Boolean))].sort();
        setAllCities(cities);
      })
      .catch(err => console.error('[cities] failed to load city filter options:', err));
  }, []);

  // Auth — session/sign-in state lives in AuthContext (shared with the nav
  // header); this page just reacts to `user` for its own favorites logic.
  const { user, setAuthMode, setShowAuth } = useAuth();

  // ─── Favorites: server-backed when signed in, guest/localStorage otherwise ─
  // Reruns whenever `user` transitions (mount-time restore, sign-in, sign-out),
  // replacing what used to be three separate call sites for the same fetch.
  useEffect(() => {
    if (!user) {
      setFavorites(loadGuestFavorites());
      return;
    }
    fetch(`${API_URL}/favorites`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : { ids: [] })
      .then(fav => setFavorites(new Set(fav.ids || [])))
      .catch(err => console.error('[favorites] failed to load favorites for signed-in user:', err));
  }, [user]);

  // ─── Persist guest favorites ───────────────────────────────────────────────
  // Only while signed out — logged-in favorites live server-side (see
  // toggleFave), so this must not overwrite the guest's saved list with the
  // server list while a session is active.
  useEffect(() => {
    if (user) return;
    try {
      localStorage.setItem(GUEST_FAVORITES_KEY, JSON.stringify([...favorites]));
    } catch (err) {
      console.error('[favorites] failed to persist guest favorites to localStorage:', err);
    }
  }, [favorites, user]);

  // ─── Fetch sales (paginated, with infinite scroll) ─────────────────────────
  // Real server-side pagination only applies to the default, most-common view
  // (sortBy date, no Saved/Open-Now filter, real API reachable) — those modes
  // are client-side-only filters/sorts over whatever's been loaded, and "only
  // the next 20 rows" doesn't make sense for "all of my favorites",
  // "everything open right now", a client-side city sort, or the bundled
  // 6-item sample-data fallback. Those fall back to the original
  // single-fetch-up-to-500 behavior, unchanged.
  const pagination = !showFaves && !openNow && sortBy === 'date' && !usingFallback;
  const [offset, setOffset]         = useState(0);
  const [hasMore, setHasMore]       = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Back-button restoration target — read (and immediately cleared) via a
  // lazy useState initializer, which React guarantees runs synchronously,
  // exactly once, during this component instance's very first render. That
  // matters here specifically: browsers can end up rendering this page more
  // than once around a back-navigation (bfcache resuming a frozen instance
  // racing a fresh mount, a route transition rendering twice, etc.), and an
  // async effect-based "have I already restored" check can't tell those
  // apart. Doing the read/clear synchronously at the earliest possible
  // moment, with sessionStorage.removeItem as the actual source of truth,
  // means at most one instance — whichever happens to render first — ever
  // sees a saved position; every other one just finds nothing and proceeds
  // normally. On a fresh mount the filters are always at their hardcoded
  // defaults (nothing here is driven by URL params), so the signature check
  // can be a plain constant rather than needing state that isn't in scope yet.
  const [restoreTarget, setRestoreTarget] = useState(() => {
    try {
      const raw = sessionStorage.getItem(FEED_SCROLL_KEY);
      if (!raw) return null;
      sessionStorage.removeItem(FEED_SCROLL_KEY);
      const saved = JSON.parse(raw);
      const defaultSig = feedSignature({ query: '', cityFilter: 'All', dateFrom: '', dateTo: '', saleType: '' });
      return (saved.signature === defaultSig && saved.itemCount > PAGE_SIZE) ? saved : null;
    } catch (err) {
      console.error('[feed] failed to read saved scroll position:', err);
      return null;
    }
  });

  const debounceRef = useRef(null);
  // Guards fetchNextPage against running before fetchSales has ever
  // established a real page 1 for the current generation. Without this, the
  // scroll sentinel's IntersectionObserver can fire immediately on mount —
  // e.g. the browser attempting native scroll restoration to a deep scrollY
  // on a page that's still just the initial `sales` placeholder — appending
  // fetched rows onto stale/placeholder state instead of a real first page.
  const firstPageLoadedRef = useRef(false);
  // Bumped by every fetchSales() call; fetchSales/fetchNextPage capture the
  // value at call time and discard their result if it no longer matches when
  // the request resolves — guards against a slow/overlapping request (e.g.
  // one still in flight from just before a navigation) applying stale data
  // on top of whatever a newer request already set.
  const fetchGenerationRef = useRef(0);
  // Belt-and-suspenders on top of the generation check above: browsers can
  // genuinely keep two instances of this component transiently alive around
  // a back-navigation (e.g. a frozen bfcache instance resuming right as a
  // fresh mount also occurs), each with its own independent generation
  // counter that can't see the other's. React's unmount cleanup is a hard
  // guarantee regardless of how that happens, so track it directly and
  // refuse to touch state from a fetch that outlived its own instance.
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  const buildParams = useCallback((extra = {}) => {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    // if (stateFilter && stateFilter !== 'All') params.set('state', stateFilter); // disabled — see STATES comment above
    if (cityFilter && cityFilter !== 'All') params.set('city', cityFilter);
    if (dateFrom) params.set('from', dateFrom);
    if (dateTo)   params.set('to',   dateTo);
    if (saleType) params.set('sale_type', saleType);
    for (const [k, v] of Object.entries(extra)) params.set(k, v);
    return params;
  }, [query, cityFilter, dateFrom, dateTo, saleType]);

  const fetchWithRetry = useCallback(async (url) => {
    const tryFetch = (timeoutMs) => fetch(url, { credentials: 'include', signal: AbortSignal.timeout(timeoutMs) })
      .then(res => { if (!res.ok) throw new Error('bad status'); return res.json(); });
    // First attempt is fast — the common case is an already-warm server. If that
    // fails, the retry uses a much longer timeout: Render's free tier can take
    // 30-50s to cold-start, and falling back to fake sample data after only a
    // few seconds is worse than a longer wait for real data.
    return tryFetch(4000).catch(async () => {
      await new Promise(r => setTimeout(r, 1000));
      return tryFetch(45000);
    });
  }, []);

  // First page (or a full fetch, for the non-paginated modes) — runs whenever
  // a filter changes, resetting the feed back to the start. Restoring a
  // deeper scroll position (see `restoreTarget` above) is handled separately,
  // by chaining fetchNextPage() calls after this lands — this function
  // always just loads one normal first page.
  // True only if this exact instance is both still mounted AND still the
  // most recent fetch this instance kicked off — either condition failing
  // means the caller should silently drop its result instead of applying it.
  const stillCurrent = useCallback((myGeneration) =>
    isMountedRef.current && fetchGenerationRef.current === myGeneration
  , []);

  const fetchSales = useCallback(async () => {
    const myGeneration = ++fetchGenerationRef.current;
    firstPageLoadedRef.current = false; // a new page 1 is being established — block fetchNextPage until it actually lands
    setLoading(true);
    const params = buildParams(pagination ? { limit: PAGE_SIZE, offset: 0 } : { limit: 500 });
    const url = `${API_URL}/sales?${params.toString()}`;

    try {
      const data = await fetchWithRetry(url);
      if (!stillCurrent(myGeneration)) return; // superseded by a newer fetch, or this instance unmounted
      const rows = data.sales || [];
      setSales(rows);
      setUsingFallback(false);
      if (pagination) {
        setOffset(rows.length);
        setHasMore(rows.length === PAGE_SIZE);
        firstPageLoadedRef.current = true;
      } else {
        setHasMore(false);
      }
    } catch (err) {
      if (!stillCurrent(myGeneration)) return;
      console.error('[sales] fetch failed, falling back to bundled sample data:', err);
      setSales(SAMPLE_SALES);
      setUsingFallback(true);
      setHasMore(false);
    } finally {
      if (stillCurrent(myGeneration)) setLoading(false);
    }
  }, [buildParams, fetchWithRetry, pagination, stillCurrent]);

  // Next page — called by the scroll sentinel below as the user nears the
  // bottom of the feed. Appends rather than replacing.
  const fetchNextPage = useCallback(async () => {
    if (!firstPageLoadedRef.current || loadingMore || !hasMore || !pagination) return;
    const myGeneration = fetchGenerationRef.current; // NOT incremented — this page load belongs to whatever generation fetchSales last established
    setLoadingMore(true);
    const params = buildParams({ limit: PAGE_SIZE, offset });
    const url = `${API_URL}/sales?${params.toString()}`;
    try {
      const data = await fetchWithRetry(url);
      if (!stillCurrent(myGeneration)) return; // a fresh fetchSales() reset the feed while this was in flight, or this instance unmounted
      const rows = data.sales || [];
      setSales(prev => [...prev, ...rows]);
      setOffset(prev => prev + rows.length);
      setHasMore(rows.length === PAGE_SIZE);
    } catch (err) {
      if (!stillCurrent(myGeneration)) return;
      // Leave hasMore untouched so scrolling again retries, rather than
      // silently declaring the feed finished on a transient failure.
      console.error('[feed] failed to load next page:', err);
    } finally {
      if (stillCurrent(myGeneration)) setLoadingMore(false);
    }
  }, [buildParams, fetchWithRetry, offset, hasMore, loadingMore, pagination, stillCurrent]);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(fetchSales, 250);
    return () => clearTimeout(debounceRef.current);
  }, [fetchSales]);

  // ─── Drive back-button restoration by chaining the normal pagination ───────
  // Reuses fetchNextPage() — the same, already-correct mechanism used for
  // regular scrolling — rather than a separate "fetch N at once" request
  // shape, so restoration can't drift out of sync with how paging actually
  // behaves. Fires again every time a fetch settles, requesting one more
  // page each time, until either enough rows are loaded to cover the saved
  // position or the feed genuinely runs out (hasMore goes false first).
  useEffect(() => {
    if (!restoreTarget) return;
    if (!pagination) { setRestoreTarget(null); return; } // filters changed before restoration finished
    if (loading || loadingMore) return; // wait for the in-flight fetch to settle
    if (sales.length < restoreTarget.itemCount && hasMore) {
      fetchNextPage();
      return;
    }
    const y = restoreTarget.scrollY;
    setRestoreTarget(null);
    // Double rAF: the first waits for React to commit, the second for the
    // browser to finish layout/paint of the newly-added rows.
    requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, y)));
  }, [restoreTarget, pagination, sales.length, hasMore, loading, loadingMore, fetchNextPage]);

  // ─── Infinite scroll: observe a sentinel near the bottom of the grid ───────
  const sentinelRef = useRef(null);
  useEffect(() => {
    if (!pagination || viewMode !== 'cards') return;
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      entries => { if (entries[0].isIntersecting) fetchNextPage(); },
      { rootMargin: '600px 0px' } // start loading before the user actually hits bottom
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [fetchNextPage, pagination, viewMode]);

  // ─── Scroll position tracking, for back-button restoration ─────────────────
  // A single passive listener for the component's lifetime (not re-subscribed
  // on every page load) — reads live filter/sales state via a ref so it stays
  // cheap on mobile. Written continuously (not just on navigate-away) so it
  // works regardless of how the user leaves the page — clicking a listing's
  // "Details" link, using "Back to all listings" from elsewhere, etc.
  const feedStateRef = useRef(null);
  useEffect(() => {
    feedStateRef.current = {
      signature: feedSignature({ query, cityFilter, dateFrom, dateTo, saleType }),
      salesLength: sales.length,
      pagination,
    };
  });
  useEffect(() => {
    let raf = null;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        const s = feedStateRef.current;
        if (!s?.pagination) return;
        try {
          sessionStorage.setItem(FEED_SCROLL_KEY, JSON.stringify({
            signature: s.signature,
            itemCount: s.salesLength,
            scrollY: window.scrollY,
          }));
        } catch (err) {
          console.error('[feed] failed to save scroll position:', err);
        }
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); if (raf) cancelAnimationFrame(raf); };
  }, []);

  // ─── Client-side filter + sort ────────────────────────────────────────────
  const filtered = useMemo(() => {
    let results = sales;
    if (usingFallback) {
      const q = query.trim().toLowerCase();
      const todayStr = new Date().toISOString().slice(0, 10);
      results = results.filter(s => {
        // if (stateFilter !== "All" && s.state !== stateFilter) return false; // disabled — see STATES comment above
        if (cityFilter !== "All" && s.city !== cityFilter) return false;
        if (saleType && s.sale_type && s.sale_type !== saleType) return false;
        if (dateFrom && s.sale_date && s.sale_date < dateFrom) return false;
        if (dateTo   && s.sale_date && s.sale_date > dateTo)   return false;
        if (!q) return true;
        return (
          s.city.toLowerCase().includes(q) || s.state.toLowerCase() === q ||
          s.zip === q || s.title.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.categories.some(c => c.toLowerCase().includes(q))
        );
      });
    }
    if (openNow) {
      const now = new Date();
      const todayStr = now.toISOString().slice(0, 10);
      const nowTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      results = results.filter(s => {
        if (s.sale_date !== todayStr) return false;
        const start = s.start_time || '00:00';
        const end   = s.end_time   || '23:59';
        return nowTime >= start && nowTime <= end;
      });
    }
    if (showFaves) results = results.filter(s => favorites.has(s.id));
    if (sortBy === "date") {
      results = [...results].sort((a, b) => (a.sale_date || '9999').localeCompare(b.sale_date || '9999'));
    } else if (sortBy === "city") {
      results = [...results].sort((a, b) => a.city.localeCompare(b.city));
    }
    return results;
  }, [sales, usingFallback, query, cityFilter, saleType, dateFrom, dateTo, openNow, showFaves, favorites, sortBy]);

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
      } catch (err) {
        console.error('[favorites] failed to sync favorite toggle:', err);
      }
    } else {
      // Not logged in — toggle locally (persisted to localStorage by the
      // effect above) and nudge them to sign in, once per session.
      const isAdding = !favorites.has(id);
      setFavorites(prev => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
      });
      if (isAdding && !sessionStorage.getItem(NUDGE_SHOWN_KEY)) {
        setShowFaveNudge(true);
        sessionStorage.setItem(NUDGE_SHOWN_KEY, '1');
      }
    }
  };

  // ─── Description expand/collapse ───────────────────────────────────────────
  const toggleExpanded = (id) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
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
      color: "#3D2E26",
    }}>
      {/* Paper grain */}
      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none",
        backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.4 0 0 0 0 0.3 0 0 0 0 0.2 0 0 0 0.04 0'/></filter><rect width='200' height='200' filter='url(%23n)'/></svg>")`,
        opacity: 0.6, mixBlendMode: "multiply", zIndex: 0,
      }} />

      {/* ─── Homepage hero (site nav/logo/sign-in live in the shared <Header>
           rendered once at the App root — see Header.jsx) ─────────────────── */}
      <div style={{ position: "relative", zIndex: 1, padding: "16px 24px", maxWidth: "1100px", margin: "0 auto" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: "10px",
            padding: "6px 14px", borderRadius: "999px",
            background: "rgba(198, 107, 61, 0.12)", color: "#A8542C",
            fontSize: "13px", fontWeight: 600, letterSpacing: "0.04em", marginBottom: "20px",
          }}>
            <Sparkles size={14} /> WEEKEND TREASURE HUNTING
          </div>
          {/* Visually hidden — keeps a real <h1> for SEO/screen readers now
              that the brand name is conveyed by the logo image below. */}
          <h1 style={{
            position: "absolute", width: "1px", height: "1px", padding: 0,
            margin: "-1px", overflow: "hidden", clip: "rect(0,0,0,0)",
            whiteSpace: "nowrap", border: 0,
          }}>
            NorCal Thrifting
          </h1>
          <img
            src="/logo-header.png"
            alt="NorCal Thrifting — Garage Sales, Estate Sales & Thrift Stores in Northern California"
            className="hero-logo"
          />
        </div>
      </div>

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
              {/* "state" dropped from the placeholder — every listing is CA, same reason the State filter is disabled above */}
              <input type="text" placeholder="Search by city, ZIP, or what you're hunting for…"
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
            <button onClick={() => setShowFilters(s => !s)} style={{ ...btnStyle(showFilters || activeFilterCount > 0, "#A8542C"), position: 'relative' }}>
              <Filter size={18} /> Filters
              {activeFilterCount > 0 && (
                <span style={{
                  position: 'absolute', top: '-6px', right: '-6px',
                  width: '18px', height: '18px', borderRadius: '50%',
                  background: '#C66B3D', color: '#FFFCF6',
                  fontSize: '11px', fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>{activeFilterCount}</span>
              )}
            </button>
            <button onClick={() => setShowFaves(s => !s)} style={btnStyle(showFaves, "#7A8B6F")}>
              <Heart size={18} fill={showFaves ? "#FFFCF6" : "none"} />
              Saved {favorites.size > 0 && `(${favorites.size})`}
            </button>
            <button onClick={openAddSale} style={btnStyle(false, "#A8542C", true)}>
              <Plus size={18} /> Add a Sale
            </button>
            <button onClick={() => setViewMode(v => v === 'map' ? 'cards' : 'map')} style={btnStyle(viewMode === 'map', "#7A8B6F")}>
              <Map size={18} /> {viewMode === 'map' ? 'Cards' : 'Map'}
            </button>
          </div>

          {showFilters && (
            <div style={{
              marginTop: "16px", paddingTop: "16px", borderTop: "1px dashed #E8DCC8",
              display: "flex", gap: "16px", flexWrap: "wrap", alignItems: "center",
            }}>
              {/* State filter disabled — every listing is CA, so a 50-state dropdown
                  was pure dead weight. City filter below replaces it.
              <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", fontWeight: 600 }}>
                State:
                <select value={stateFilter} onChange={e => setStateFilter(e.target.value)} style={selectStyle}>
                  {STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              */}
              <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", fontWeight: 600 }}>
                City:
                <select value={cityFilter} onChange={e => setCityFilter(e.target.value)} style={selectStyle}>
                  <option value="All">All cities</option>
                  {allCities.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", fontWeight: 600 }}>
                Sale type:
                <select value={saleType} onChange={e => setSaleType(e.target.value)} style={selectStyle}>
                  <option value="">All types</option>
                  <option value="garage_sale">Garage sale</option>
                  <option value="estate_sale">Estate sale</option>
                  <option value="moving_sale">Moving sale</option>
                  <option value="yard_sale">Yard sale</option>
                  <option value="rummage_sale">Rummage sale</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", fontWeight: 600 }}>
                From:
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={selectStyle} />
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", fontWeight: 600 }}>
                To:
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={selectStyle} />
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", fontWeight: 600 }}>
                Sort by:
                <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={selectStyle}>
                  <option value="date">Date (soonest first)</option>
                  <option value="city">City (A–Z)</option>
                </select>
              </label>
              {activeFilterCount > 0 && (
                <button
                  onClick={() => { setCityFilter('All'); setDateFrom(''); setDateTo(''); setSaleType(''); setOpenNow(false); }}
                  style={{ background: 'none', border: 'none', color: '#A8542C', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', padding: 0, textDecoration: 'underline' }}
                >
                  Clear all filters
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ─── Quick filter chips ───────────────────────────────────────────── */}
      <div style={{ position: "relative", zIndex: 1, maxWidth: "1100px", margin: "12px auto 0", padding: "0 24px" }}>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {[
            { label: 'This Weekend',  icon: <Calendar size={14} />,     active: weekendActive,                  onClick: toggleWeekend },
            { label: 'Open Now',      icon: <Zap size={14} />,          active: openNow,                         onClick: () => setOpenNow(v => !v) },
            { label: 'Estate Sales',  icon: <Home size={14} />,         active: saleType === 'estate_sale',      onClick: () => setSaleType(v => v === 'estate_sale'   ? '' : 'estate_sale') },
            { label: 'Thrift Stores', icon: <ShoppingBag size={14} />,  active: saleType === 'thrift_store',     onClick: () => setSaleType(v => v === 'thrift_store'  ? '' : 'thrift_store'), teal: true },
          ].map(chip => {
            const activeColor = chip.teal ? '#3A8A6E' : '#A8542C';
            return (
              <button key={chip.label} onClick={chip.onClick} style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '6px 14px', borderRadius: '999px',
                background: chip.active ? activeColor : '#FFFCF6',
                color: chip.active ? '#FFFCF6' : '#6B5444',
                border: `1px solid ${chip.active ? activeColor : '#E8DCC8'}`,
                fontSize: '13px', fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
                transition: 'all 0.15s',
              }}>
                {chip.icon} {chip.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── Browse by region ────────────────────────────────────────────── */}
      <div style={{ position: "relative", zIndex: 1, maxWidth: "1100px", margin: "24px auto 0", padding: "0 24px" }}>
        <p style={{ fontSize: "12.5px", fontWeight: 700, color: "#9A8472", textTransform: "uppercase",
          letterSpacing: "0.04em", margin: "0 0 10px" }}>
          Browse by Region
        </p>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          {Object.entries(LOCATIONS).map(([key, loc]) => (
            <Link key={key} to={loc.path} style={{
              display: "flex", alignItems: "center", gap: "7px",
              padding: "10px 18px", borderRadius: "12px",
              background: "#FFFCF6", border: "1px solid #E8DCC8", color: "#3D2E26",
              fontSize: "14px", fontWeight: 700, textDecoration: "none",
              transition: "border-color 0.15s, transform 0.15s",
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "#C66B3D"; e.currentTarget.style.transform = "translateY(-1px)"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "#E8DCC8"; e.currentTarget.style.transform = "translateY(0)"; }}
            >
              <MapPin size={15} color="#A8542C" /> {loc.shortLabel}
            </Link>
          ))}
        </div>
      </div>

      {/* ─── Not-logged-in favorites nudge — shows once per session, dismissible ── */}
      {!user && showFaveNudge && (
        <div style={{
          position: "relative", zIndex: 1, maxWidth: "1100px",
          margin: "10px auto 0", padding: "0 24px",
        }}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: "10px",
            flexWrap: "wrap", padding: "10px 16px", borderRadius: "12px", border: "1px dashed #C9B89E",
            background: "rgba(200, 160, 100, 0.07)", color: "#7A5C44",
            fontSize: "13px", fontWeight: 600,
          }}>
            <Heart size={14} fill="#C66B3D" color="#C66B3D" style={{ flexShrink: 0 }} />
            <span>
              Create a free account to save favorites permanently and access them on any device —{" "}
              <button
                onClick={() => { setAuthMode('signin'); setShowAuth(true); }}
                style={{
                  background: "none", border: "none", padding: 0, cursor: "pointer",
                  fontFamily: "inherit", fontSize: "inherit", fontWeight: 700,
                  color: "#A8542C", textDecoration: "underline",
                }}
              >
                Sign In
              </button>
              {" "}or{" "}
              <button
                onClick={() => { setAuthMode('signup'); setShowAuth(true); }}
                style={{
                  background: "none", border: "none", padding: 0, cursor: "pointer",
                  fontFamily: "inherit", fontSize: "inherit", fontWeight: 700,
                  color: "#A8542C", textDecoration: "underline",
                }}
              >
                Create Account
              </button>
            </span>
            <button
              onClick={() => setShowFaveNudge(false)}
              aria-label="Dismiss"
              style={{
                background: "none", border: "none", cursor: "pointer", color: "#9A8472",
                padding: "4px", display: "flex", marginLeft: "auto", flexShrink: 0,
              }}
            >
              <X size={14} />
            </button>
          </div>
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
          {filtered.length}{pagination && hasMore ? "+" : ""} {filtered.length === 1 ? "sale" : "sales"} found
        </span>
      </div>

      {/* ─── Map view ─────────────────────────────────────────────────────── */}
      {viewMode === 'map' && (
        <Suspense fallback={<LoadingFallback minHeight="400px" />}>
          <MapView sales={filtered} />
        </Suspense>
      )}

      {/* ─── Sale cards ───────────────────────────────────────────────────── */}
      {viewMode === 'cards' && (
      <div style={{
        position: "relative", zIndex: 1, maxWidth: "1100px", margin: "0 auto", padding: "0 24px",
        display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: "20px",
        alignItems: "start",
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
          <SaleCard
            key={sale.id}
            sale={sale}
            favorited={favorites.has(sale.id)}
            onToggleFave={toggleFave}
            expanded={expandedIds.has(sale.id)}
            onToggleExpanded={() => toggleExpanded(sale.id)}
            showDetailsLink={!usingFallback}
          />
        ))}
      </div>
      )}

      {/* ─── Infinite scroll sentinel / status row ─────────────────────────── */}
      {viewMode === 'cards' && pagination && filtered.length > 0 && (
        <div style={{ position: "relative", zIndex: 1, maxWidth: "1100px", margin: "0 auto", padding: "24px 24px 0" }}>
          <div ref={sentinelRef} style={{ height: "1px" }} aria-hidden="true" />
          {loadingMore && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", padding: "12px", color: "#9A8472", fontSize: "13px" }}>
              <Loader2 size={16} className="spin" /> Loading more…
            </div>
          )}
          {!loadingMore && !hasMore && (
            <p style={{ textAlign: "center", color: "#9A8472", fontSize: "13px", padding: "12px", margin: 0 }}>
              You've reached the end — that's every sale we've got right now.
            </p>
          )}
        </div>
      )}

      <footer style={{ position: "relative", zIndex: 1, maxWidth: "1100px", margin: "60px auto 0", padding: "0 24px", textAlign: "center" }}>
        <p style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: "16px", color: "#9A8472", margin: "0 0 20px" }}>
          One person's clutter is another person's treasure.
        </p>
        <div style={{ display: "flex", justifyContent: "center", flexWrap: "wrap", gap: "8px" }}>
          {Object.entries(LOCATIONS).map(([key, loc]) => (
            <Link key={key} to={loc.path} style={{
              padding: "5px 12px", borderRadius: "999px",
              border: "1px solid #E8DCC8", color: "#9A8472",
              fontSize: "12.5px", fontWeight: 600, textDecoration: "none",
            }}>
              {loc.shortLabel}
            </Link>
          ))}
        </div>
      </footer>

      {showSubmit && <SubmitModal onClose={() => setShowSubmit(false)} onSuccess={fetchSales} />}

      <footer style={{
        textAlign: "center", padding: "24px 16px",
        fontSize: "13px", color: "#A08060",
        borderTop: "1px solid #E8DCC8", marginTop: "40px",
      }}>
        © {new Date().getFullYear()} NorCal Thrifting. All rights reserved.
      </footer>

      <style>{`
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        .spin { animation: spin 1s linear infinite }
        .hero-logo {
          display: block; width: 100%; max-width: 600px;
          margin: 12px auto 16px; height: auto;
        }
        @media (max-width: 768px) {
          .hero-logo { max-width: 440px; }
        }
        @media (max-width: 480px) {
          .hero-logo { max-width: 320px; }
        }
      `}</style>
    </div>
  );
}
