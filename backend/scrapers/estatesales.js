// scrapers/estatesales.js — Pull estate sale listings from EstateSales.net.
//
// EstateSales.net is Angular with SSR. The initial HTML is server-rendered and
// contains both the sale links on listing pages AND structured JSON-LD data on
// detail pages — so plain HTTP + cheerio is sufficient; no headless browser needed.
//
// Two-pass approach:
//   1. Fetch each city's listing page → collect individual sale URLs.
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
import { geocode } from '../geocode.js';

const BASE = 'https://www.estatesales.net';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
};
const MAX_PER_CITY = 25;

// NorCal / Central Valley CA cities.
// slug = EstateSales URL path segment (hyphens for spaces).
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
];

export async function refreshAll() {
  // Collect all unique sale URLs across all cities first (avoids duplicate fetches)
  const seen = new Set();
  for (const { state, slug } of ESTATESALES_CITIES) {
    const urls = await getSaleUrls(state, slug);
    for (const u of urls) seen.add(u);
    await sleep(1500);
  }

  let total = 0, totalErrors = 0;

  for (const saleUrl of seen) {
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

// ---------- Step 1: collect sale URLs from a city listing page ----------

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
  const pat  = new RegExp(`^/${state}/[\\w-]+/\\d{5}/\\d+$`);
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    if (pat.test(href)) urls.add(href);
  });

  const result = [...urls].slice(0, MAX_PER_CITY);
  console.log(`[estatesales] ${slug}: ${result.length} sale links`);
  return result;
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

  // Geocode using the structured PostalAddress
  let lat = null, lng = null;
  try {
    const g = await geocode({
      address: addr.streetAddress,
      city:    addr.addressLocality,
      state:   addr.addressRegion,
      zip:     addr.postalCode,
    });
    if (g) { lat = g.lat; lng = g.lng; }
  } catch (_) {}

  try {
    upsertSale({
      source:          'estatesales',
      source_url:      `${BASE}${saleUrl}`,
      source_id:       `es_${addr.addressRegion}_${addr.postalCode}_${saleId}`,
      title:           (jsonLd.name || '').slice(0, 200),
      description:     (jsonLd.description || '').slice(0, 800),
      address:         addr.streetAddress || null,
      address_visible: !!addr.streetAddress,
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

function addDays(isoDate, n) {
  const d = new Date(isoDate + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
