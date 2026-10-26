// scrapers/estatesales.js — Pull estate sale listings from EstateSales.net.
//
// EstateSales.net is Angular with SSR. The initial HTML is server-rendered and
// contains both the sale links on listing pages AND structured JSON-LD data on
// detail pages — so plain HTTP + cheerio is sufficient; no headless browser needed.
//
// Two-pass approach:
//   1. Collect sale URLs — primarily from the site's own sale-search JSON
//      endpoint (see ESTATESALES_SEARCHES), falling back to the city listing
//      pages if that returns nothing.
//   2. For each URL, fetch the detail page → parse the JSON-LD SaleEvent block
//      which contains structured title, address, start/end datetimes, and description.
//
// JSON-LD field mapping:
//   name        → title
//   startDate   → sale_date + start_time (converted from UTC to Pacific time)
//   endDate     → end_time (last-day close time) + expires_at
//   description → description
//   location.address → full PostalAddress for geocoding

import axios from 'axios';
import * as cheerio from 'cheerio';
import { upsertSale } from '../db.js';
import { geocode, geocodeApprox } from '../geocode.js';
import { HEADERS } from './shared.js';
import { sleep } from '../utils.js';
import { addDays } from '../dateUtils.js';

const BASE = 'https://www.estatesales.net';
const MAX_PER_CITY = 25;

// NorCal / Central Valley CA cities.
// slug = EstateSales URL path segment (hyphens for spaces).
//
// Bay Area note (verified directly, 2026-08-08): EstateSales.net groups
// nearby cities under shared metro pages rather than giving every city its
// own slug. A bare 'Oakland' slug 301-redirects to 'Oakland-Hayward-Fremont'
// (used directly below to skip the extra hop), and 'Berkeley' redirects to
// 'San-Francisco' — there's no separate Berkeley page, so Berkeley is
// already covered by the San Francisco entry and doesn't get its own row
// here (a literal 'Berkeley' entry would just re-fetch the same San-Francisco
// URL a second time).
export const ESTATESALES_CITIES = [
  { state: 'CA', city: 'Sacramento',  slug: 'Sacramento' },
  { state: 'CA', city: 'Stockton',    slug: 'Stockton' },
  { state: 'CA', city: 'Fresno',      slug: 'Fresno' },
  { state: 'CA', city: 'Modesto',     slug: 'Modesto' },
  { state: 'CA', city: 'Chico',       slug: 'Chico' },
  { state: 'CA', city: 'Redding',     slug: 'Redding' },
  { state: 'CA', city: 'Bakersfield', slug: 'Bakersfield' },
  { state: 'CA', city: 'Roseville',   slug: 'Roseville' },
  { state: 'CA', city: 'Elk Grove',   slug: 'Elk-Grove' },
  { state: 'CA', city: 'San Francisco', slug: 'San-Francisco' },
  { state: 'CA', city: 'Oakland',       slug: 'Oakland-Hayward-Fremont' },
  { state: 'CA', city: 'San Jose',      slug: 'San-Jose' },
];

// Radius searches against /api/sale-details — the endpoint the site's own
// city pages call from the browser. City-page HTML only server-renders the
// first ~20 sales of a metro (the rest load client-side), and neighboring
// city pages mostly repeat the same 20, so step 1 used to top out around 30
// unique NorCal links. The search endpoint returns every sale in the circle.
// radiusMi is in miles (verified: a 25mi search's farthest result was 24mi).
// Circles overlap on purpose; results are de-duplicated by sale ID. This is an
// undocumented internal endpoint, not a public API — if it stops returning
// results, refreshAll() falls back to the city pages below.
export const ESTATESALES_SEARCHES = [
  { name: 'Sacramento',       lat: 38.5816, lng: -121.4944, radiusMi: 75 },
  { name: 'Bay Area',         lat: 37.8044, lng: -122.2712, radiusMi: 60 },
  { name: 'Stockton/Modesto', lat: 37.8000, lng: -121.1000, radiusMi: 60 },
  { name: 'Fresno',           lat: 36.7378, lng: -119.7871, radiusMi: 75 },
  { name: 'Chico/Redding',    lat: 40.1000, lng: -122.1000, radiusMi: 100 },
];

// EstateSales.net sale `type` codes (from the city pages' embedded state).
// Only in-person sales belong on the map; online-only auctions (64) and
// online estate sales (16384) are dropped.
const IN_PERSON_SALE_TYPES = new Set([
  1,  // EstateSales
  4,  // MovingSales
  16, // MovedOffsiteToWarehouse — an in-person sale held at the company's warehouse
]);

export async function refreshAll() {
  let urls = await getSaleUrlsFromSearch();
  if (urls.length === 0) {
    console.warn('[estatesales] search endpoint returned no sales — falling back to city pages');
    const seen = new Set();
    for (const { state, slug } of ESTATESALES_CITIES) {
      for (const u of await getSaleUrls(state, slug)) seen.add(u);
      await sleep(1500);
    }
    urls = [...seen];
  }

  let total = 0, totalErrors = 0;

  for (const saleUrl of urls) {
    await sleep(1200 + Math.random() * 800); // 1.2–2s between detail pages
    const result = await processSale(saleUrl);
    if (result === 'inserted') total++;
    else if (result === 'error') totalErrors++;
  }

  return { total, totalErrors };
}

export async function refreshCity({ state, city, slug }) {
  const urls = await getSaleUrls(state, slug);
  let inserted = 0, errors = 0;
  for (const saleUrl of urls) {
    await sleep(1200 + Math.random() * 800);
    const result = await processSale(saleUrl);
    if (result === 'inserted') inserted++;
    else if (result === 'error') errors++;
  }
  console.log(`[estatesales] ${city}: ${inserted} listings, ${errors} errors`);
  return { inserted, errors };
}

// ---------- Step 1: collect sale URLs ----------

async function getSaleUrlsFromSearch() {
  const byId = new Map();
  let dropped = 0;
  for (const { name, lat, lng, radiusMi } of ESTATESALES_SEARCHES) {
    const url = `${BASE}/api/sale-details?bypass=bycoordinatesanddistance:${lat}_${lng}_${radiusMi}`
      + `&select=id,stateCode,cityName,postalCodeNumber,type&explicitTypes=DateTime`;
    try {
      const { data } = await axios.get(url, { headers: { ...HEADERS, Accept: 'application/json' }, timeout: 20000 });
      if (!Array.isArray(data)) throw new Error('unexpected response shape');
      let kept = 0;
      for (const s of data) {
        const zip = String(s.postalCodeNumber || '');
        if (s.stateCode !== 'CA' || !/^\d{5}$/.test(zip) || !isNorCalZip(zip) || !IN_PERSON_SALE_TYPES.has(s.type)) {
          dropped++;
          continue;
        }
        const citySlug = String(s.cityName || 'CA').trim().replace(/\s+/g, '-');
        byId.set(s.id, `/CA/${citySlug}/${zip}/${s.id}`); // wrong city slug just 301s to the canonical URL
        kept++;
      }
      console.log(`[estatesales] search ${name} (${radiusMi}mi): ${data.length} sales, ${kept} in-person NorCal`);
    } catch (err) {
      console.error(`[estatesales] search ${name} failed —`, err.message);
    }
    await sleep(1500);
  }
  console.log(`[estatesales] search: ${byId.size} unique sales (${dropped} online-only/out-of-area results skipped)`);
  return [...byId.values()];
}

// Fallback only: a city listing page's server-rendered links.

async function getSaleUrls(state, slug) {
  const url = `${BASE}/${state}/${slug}`;
  let html;
  try {
    const resp = await axios.get(url, { headers: HEADERS, timeout: 15000 });
    html = resp.data;
  } catch (err) {
    console.error(`[estatesales] ${slug}: list page failed —`, err.message);
    return [];
  }

  const $ = cheerio.load(html);
  const urls = new Set();
  const pat  = new RegExp(`^/${state}/[\\w-]+/(\\d{5})/\\d+$`);
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const m = href.match(pat);
    if (m && isNorCalZip(m[1])) urls.add(href);
  });

  const result = [...urls].slice(0, MAX_PER_CITY);
  console.log(`[estatesales] ${slug}: ${result.length} sale links`);
  return result;
}

// City pages also link "nearby" sales — the Bakersfield page is mostly LA /
// Ventura / Santa Maria. Keep only Central Valley + NorCal ZIP prefixes:
// 932–933 (Visalia/Bakersfield) and 936–961; drops SoCal (900–931) and the
// Central Coast / high desert (934–935).
function isNorCalZip(zip) {
  const p = parseInt(zip.slice(0, 3), 10);
  return p === 932 || p === 933 || (p >= 936 && p <= 961);
}

// ---------- Step 2: fetch a detail page and extract JSON-LD ----------

async function processSale(saleUrl) {
  let html;
  try {
    const resp = await axios.get(`${BASE}${saleUrl}`, { headers: HEADERS, timeout: 15000 });
    html = resp.data;
  } catch (err) {
    console.error(`[estatesales] ${saleUrl}: fetch failed —`, err.message);
    return 'error';
  }

  const $ = cheerio.load(html);

  // Parse the JSON-LD SaleEvent block — this is the authoritative structured data
  let jsonLd = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    if (jsonLd) return; // already found one
    try {
      const data = JSON.parse($(el).html());
      if (data['@type'] === 'SaleEvent') jsonLd = data;
    } catch (_) {}
  });

  if (!jsonLd) {
    // No structured data — probably a page error or a listing type we don't handle
    return 'skip';
  }

  const addr = jsonLd.location?.address;
  if (!addr) return 'skip';

  // Parse dates from ISO UTC timestamps, convert to Pacific local time
  const { saleDate, startTime } = parsePacificDateTime(jsonLd.startDate);
  const { startTime: endTime }  = parsePacificDateTime(jsonLd.endDate);
  const expiresAt = jsonLd.endDate ? addDays(jsonLd.endDate.slice(0, 10), 2) : null;

  // Extract sale ID from the URL for the source_id
  const idMatch = saleUrl.match(/\/(\d+)$/);
  const saleId = idMatch ? idMatch[1] : saleUrl;

  // jsonLd.description is a short, "…"-truncated SEO preview, not the real listing
  // text. The full text lives in a separate Angular transfer-state JSON blob
  // embedded on the same page — pull that instead, falling back to the JSON-LD
  // preview if the page structure ever changes.
  const fullDescription = extractFullDescription(html, saleId) || jsonLd.description || '';

  // Geocode using the structured PostalAddress. Many listings withhold the
  // exact street address until the sale day (addr.streetAddress missing) —
  // fall back to an approximate city/ZIP-centroid pin in that case (see
  // geocodeApprox()'s comment in geocode.js for why geocode() can't do this).
  let lat = null, lng = null, locationApprox = false;
  try {
    const g = await geocode({
      address: addr.streetAddress,
      city:    addr.addressLocality,
      state:   addr.addressRegion,
      zip:     addr.postalCode,
    });
    if (g) { lat = g.lat; lng = g.lng; }
  } catch (_) {}
  if (lat == null) {
    try {
      const g = await geocodeApprox({ city: addr.addressLocality, state: addr.addressRegion, zip: addr.postalCode });
      if (g) { lat = g.lat; lng = g.lng; locationApprox = true; }
    } catch (_) {}
  }

  try {
    await upsertSale({
      source:          'estatesales',
      source_url:      `${BASE}${saleUrl}`,
      source_id:       `es_${addr.addressRegion}_${addr.postalCode}_${saleId}`,
      title:           (jsonLd.name || '').slice(0, 200),
      description:     fullDescription.slice(0, 5000),
      address:         addr.streetAddress || null,
      address_visible: !!addr.streetAddress,
      location_approx: locationApprox,
      city:            addr.addressLocality,
      state:           addr.addressRegion,
      zip:             addr.postalCode,
      lat, lng,
      sale_date:       saleDate,
      start_time:      startTime,
      end_time:        endTime,
      categories:      ['Estate Sale'],
      sale_type:       'estate_sale',
      status:          'active',
      expires_at:      expiresAt,
    });
    return 'inserted';
  } catch (err) {
    console.error(`[estatesales] ${saleUrl}: upsert failed —`, err.message);
    return 'error';
  }
}

// ---------- Helpers ----------

/**
 * Pull the full (untruncated) plain-text description out of the Angular
 * transfer-state JSON EstateSales.net embeds on each detail page. This is
 * undocumented internal app state, not a public API — if it ever disappears
 * or moves, callers should fall back to jsonLd.description.
 */
function extractFullDescription(html, saleId) {
  try {
    const marker = '<script id="estatesales-net-state" type="application/json">';
    const start = html.indexOf(marker);
    if (start === -1) return null;
    const jsonStart = start + marker.length;
    const jsonEnd = html.indexOf('</script>', jsonStart);
    if (jsonEnd === -1) return null;

    const state = JSON.parse(html.slice(jsonStart, jsonEnd));
    const entities = state?.NGRX_STATE?.['feature.traditionalSaleViewState']?.entitiesById;
    const text = entities?.[saleId]?.plainTextDescription;
    return typeof text === 'string' && text.trim() ? text.trim() : null;
  } catch (_) {
    return null;
  }
}

/**
 * Convert a UTC ISO datetime string to Pacific local date + time strings.
 * Uses the Intl API — available in Node.js 20+ without external packages.
 */
function parsePacificDateTime(isoString) {
  if (!isoString) return { saleDate: null, startTime: null };
  try {
    const d = new Date(isoString);
    const tz = 'America/Los_Angeles';
    const saleDate = d.toLocaleDateString('en-CA', { timeZone: tz }); // YYYY-MM-DD
    const hh = d.toLocaleString('en-US', { timeZone: tz, hour: '2-digit', hour12: false });
    const mm = d.toLocaleString('en-US', { timeZone: tz, minute: '2-digit' }).padStart(2, '0');
    const startTime = `${hh.padStart(2, '0')}:${mm}`;
    return { saleDate, startTime };
  } catch (_) {
    return { saleDate: null, startTime: null };
  }
}

