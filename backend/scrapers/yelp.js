// scrapers/yelp.js — Pull thrift/vintage/consignment/antique store and
// estate-sale-company listings from the Yelp Fusion API (free tier: 500
// calls/day). Uses free-text search rather than Yelp's own category
// taxonomy — the specific terms below are searched directly in each city,
// which is simpler and more predictable than guessing at the right Yelp
// category alias for this space.
//
// Requires YELP_API_KEY in the environment. If it's not set, refreshAll()
// here is a no-op (logged, not thrown) so the rest of a scheduled refresh
// still runs fine without it — matches how the app already runs with zero
// paid/keyed APIs by default.

import axios from 'axios';
import { DIRECTORY_CITIES } from './directory.js';
import { findNearbyThriftStore } from '../db.js';
import { sleep } from '../utils.js';
import { upsertThriftStore } from './storeDedupe.js';

const ENDPOINT = 'https://api.yelp.com/v3/businesses/search';
const RADIUS_M = 20000; // matches the OSM directory scraper's per-city radius
const RESULTS_PER_CALL = 50; // Yelp's max per request

// Each term maps 1:1 to one of our own `categories` type tags. A business
// that matches more than one term across a city's 5 searches keeps whichever
// term found it first (search order below) — a reasonable simplification;
// disambiguating further would need a second, per-business API call
// (Yelp's category list on the search result itself is broader/noisier than
// our tag set), not worth the extra quota across this many cities.
const SEARCH_TERMS = [
  { term: 'thrift store',     category: 'Thrift Store' },
  { term: 'vintage store',    category: 'Vintage' },
  { term: 'consignment shop', category: 'Consignment' },
  { term: 'antique store',    category: 'Antiques' },
  { term: 'estate sale',      category: 'Estate Sale Company' },
];

function buildDescription(name, biz, categoryLabel) {
  const bits = [`${name} is a ${categoryLabel.toLowerCase()} found via Yelp.`];
  if (biz.display_phone) bits.push(`Phone: ${biz.display_phone}.`);
  // Yelp's free /businesses/search response doesn't include the business's
  // own website or hours — those live behind a separate per-business
  // Details call, which would multiply API usage by the number of results
  // and risk the 500/day free-tier cap across this many cities × terms.
  // The Yelp listing page is the closest thing to a link available here.
  if (biz.url) bits.push(`Yelp: ${biz.url.split('?')[0]}.`);
  return bits.join(' ');
}

// Yelp's public rate limit isn't published as precisely as Overpass's, but
// 429 (rate limited) and 5xx (transient server error) are still worth a
// backoff-and-retry rather than giving up on a whole city/term immediately.
async function searchOnce(term, lat, lon, attempts = 3, delayMs = 3000) {
  for (let i = 1; i <= attempts; i++) {
    try {
      const { data } = await axios.get(ENDPOINT, {
        headers: { Authorization: `Bearer ${process.env.YELP_API_KEY}` },
        params: { term, latitude: lat, longitude: lon, radius: RADIUS_M, limit: RESULTS_PER_CALL },
        timeout: 15000,
      });
      return data.businesses || [];
    } catch (err) {
      const status = err.response?.status;
      const retryable = status === 429 || status >= 500;
      if (!retryable || i === attempts) {
        console.error(`[yelp] "${term}" search failed (status ${status}):`, err.message);
        return [];
      }
      await sleep(delayMs);
      delayMs *= 2;
    }
  }
  return [];
}

async function upsertBusiness(biz, categoryLabel, fallbackState) {
  const name = biz.name;
  if (!name) return 'skip';
  const lat = biz.coordinates?.latitude, lon = biz.coordinates?.longitude;
  if (lat == null || lon == null) return 'skip';

  const loc = biz.location || {};
  const city = loc.city;
  if (!city) return 'skip'; // no city → nothing sensible to build a title/dedup key from

  // Same known-chain guard the OSM directory scraper uses, so a Yelp result
  // for a recognized chain never double-pins next to the hand-curated list.
  if (await findNearbyThriftStore(lat, lon, name)) return 'skip_duplicate_chain';

  const address = loc.address1 || null;

  return upsertThriftStore({
    source:          'yelp',
    source_url:      biz.url || null,
    source_id:       `yelp_${biz.id}`,
    title:           `${name} — ${city}`,
    description:     buildDescription(name, biz, categoryLabel),
    address,
    address_visible: !!address,
    location_approx: !address, // Yelp always gives real coordinates, but no street address means the pin can't be verified against one
    city,
    state:           loc.state || fallbackState,
    zip:             loc.zip_code || null,
    lat,
    lng:             lon,
    sale_date:       null,
    start_time:      null,
    end_time:        null,
    categories:      [categoryLabel],
    sale_type:       'thrift_store',
    status:          'active',
    expires_at:      null, // permanent — never expires
  });
}

export async function refreshCity({ city, state, lat, lon }) {
  if (!process.env.YELP_API_KEY) return { inserted: 0, errors: 0 };

  // Yelp gives every business a single stable id regardless of which search
  // term matched it — a store can easily show up under both "thrift store"
  // and "consignment shop" in the same city, so track ids seen this city to
  // avoid re-processing (and double-counting) the same business twice.
  const seenIds = new Set();
  let inserted = 0, enriched = 0, duplicates = 0, errors = 0;

  for (const { term, category } of SEARCH_TERMS) {
    const businesses = await searchOnce(term, lat, lon);
    for (const biz of businesses) {
      if (!biz.id || seenIds.has(biz.id)) continue;
      seenIds.add(biz.id);
      try {
        const result = await upsertBusiness(biz, category, state);
        if (result === 'inserted') inserted++;
        else if (result === 'enriched') enriched++;
        else if (result?.startsWith('skip')) duplicates++;
      } catch (err) {
        console.error(`[yelp] ${city}: item error —`, err.message);
        errors++;
      }
    }
    await sleep(400); // stay comfortably under Yelp's rate limit
  }

  console.log(`[yelp] ${city}: ${inserted} stores, ${enriched} enriched, ${duplicates} already covered, ${errors} errors`);
  return { inserted, errors };
}

export async function refreshAll() {
  if (!process.env.YELP_API_KEY) {
    console.log('[yelp] YELP_API_KEY not set — skipping');
    return { total: 0, totalErrors: 0 };
  }

  let total = 0, totalErrors = 0;
  // Same NorCal city list as the OSM directory scraper (Sacramento, Central
  // Valley, far north, Bay Area, Sierra foothills) for consistent coverage.
  for (const cfg of DIRECTORY_CITIES) {
    const { inserted, errors } = await refreshCity(cfg);
    total += inserted;
    totalErrors += errors;
    await sleep(1000); // polite gap between cities
  }
  return { total, totalErrors };
}
