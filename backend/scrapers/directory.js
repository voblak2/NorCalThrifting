// scrapers/directory.js — Pull permanent thrift/charity/second-hand/antique
// store locations from OpenStreetMap via the Overpass API. Free, no API key,
// and each result carries its own exact coordinates — no separate geocoding
// pass needed, unlike craigslist.js/estatesales.js.
//
// Unlike those two, this isn't meant to run nightly: store locations don't
// churn daily, and Overpass's public server asks callers to be considerate
// (no hammering). refresh.js gates how often this actually runs.
//
// Query strategy: per-city `around:radius` searches (mirrors CRAIGSLIST_CITIES
// / ESTATESALES_CITIES) rather than one big regional bounding box — tried the
// latter first and it 504'd on Overpass's server; small per-city areas return
// in a few seconds each.

import axios from 'axios';
import { upsertSale, findNearbyThriftStore } from '../db.js';

const ENDPOINT = 'https://overpass-api.de/api/interpreter';
const USER_AGENT = 'NorCalThrifting/1.0 (https://norcalthrifting.com)';
const RADIUS_M = 20000; // 20km metro-area radius per city

// NorCal / Central Valley city centers — union of the cities already used by
// CRAIGSLIST_CITIES and ESTATESALES_CITIES, for consistent geographic scope.
export const DIRECTORY_CITIES = [
  { city: 'Sacramento',  state: 'CA', lat: 38.5811, lon: -121.4939 },
  { city: 'Roseville',   state: 'CA', lat: 38.7521, lon: -121.2880 },
  { city: 'Elk Grove',   state: 'CA', lat: 38.4088, lon: -121.3716 },
  { city: 'Stockton',    state: 'CA', lat: 37.9577, lon: -121.2908 },
  { city: 'Modesto',     state: 'CA', lat: 37.6393, lon: -120.9969 },
  { city: 'Merced',      state: 'CA', lat: 37.1642, lon: -120.7679 },
  { city: 'Fresno',      state: 'CA', lat: 36.7394, lon: -119.7848 },
  { city: 'Visalia',     state: 'CA', lat: 36.3302, lon: -119.2921 },
  { city: 'Bakersfield', state: 'CA', lat: 35.3739, lon: -119.0195 },
  { city: 'Chico',       state: 'CA', lat: 39.7285, lon: -121.8375 },
  { city: 'Redding',     state: 'CA', lat: 40.5864, lon: -122.3917 },
];

// OSM shop tags that map to "somewhere a thrifter would want to go".
const SHOP_TAGS = ['charity', 'second_hand', 'antiques'];

function categoryFor(shopTag) {
  if (shopTag === 'antiques') return 'Antiques';
  if (shopTag === 'second_hand') return 'Consignment';
  return 'Thrift Store';
}

function buildQuery(lat, lon) {
  const clauses = SHOP_TAGS
    .map(tag => `node["shop"="${tag}"](around:${RADIUS_M},${lat},${lon});`)
    .join('');
  return `[out:json][timeout:30];(${clauses});out body;`;
}

function buildAddress(tags) {
  const num = tags['addr:housenumber'];
  const street = tags['addr:street'];
  return num && street ? `${num} ${street}` : null;
}

function buildDescription(name, tags, categoryLabel) {
  const bits = [`${name} is a ${categoryLabel.toLowerCase()} shop`];
  const phone = tags['contact:phone'] || tags.phone;
  const website = tags['contact:website'] || tags.website;
  if (phone) bits.push(`Phone: ${phone}.`);
  if (website) bits.push(`Website: ${website}.`);
  return bits.join(' ');
}

async function upsertElement(el, fallbackCity, fallbackState) {
  const tags = el.tags || {};
  const name = tags.name;
  if (!name) return 'skip'; // no name → nothing sensible to title the listing with

  // Avoid double-pinning a store that's already in the DB from another
  // source (e.g. the hand-curated chain list in seed-thrift-stores.js) —
  // OSM coverage of specific chain locations turned out to be incomplete
  // when checked against that list, so both sources are kept rather than
  // one replacing the other; this just prevents visible duplicate pins
  // where they do overlap.
  if (await findNearbyThriftStore(el.lat, el.lon, name)) return 'skip_duplicate';

  const category = categoryFor(tags.shop);
  const address = buildAddress(tags);

  await upsertSale({
    source:          'osm_directory',
    source_url:      null,
    source_id:       `osm_n${el.id}`,
    title:           `${name} — ${tags['addr:city'] || fallbackCity}`,
    description:     buildDescription(name, tags, category),
    address,
    address_visible: !!address,
    location_approx: false, // OSM node coordinates are the actual mapped point, not a geocoded guess
    city:            tags['addr:city']  || fallbackCity,
    state:           tags['addr:state'] || fallbackState,
    zip:             tags['addr:postcode'] || null,
    lat:             el.lat,
    lng:             el.lon,
    sale_date:       null,
    start_time:      null,
    end_time:        null,
    categories:      [category],
    sale_type:       'thrift_store',
    status:          'active',
    expires_at:      null, // permanent — never expires
  });
  return 'inserted';
}

// Overpass's public instance only allows 2 concurrent slots per IP and is
// shared with everyone else hitting it — a 429 (over rate limit) or 504
// (server-side timeout under load) is often transient, so retry with backoff
// before giving up on a city.
async function fetchElements(lat, lon, attempts = 3, delayMs = 15000) {
  const params = new URLSearchParams();
  params.set('data', buildQuery(lat, lon));
  for (let i = 1; i <= attempts; i++) {
    try {
      const { data } = await axios.post(ENDPOINT, params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT },
        timeout: 40000,
      });
      return data.elements || [];
    } catch (err) {
      const status = err.response?.status;
      const retryable = status === 429 || status === 504 || !status;
      if (!retryable || i === attempts) throw err;
      console.warn(`[directory] fetch failed (attempt ${i}/${attempts}, status ${status}): ${err.message}. Retrying in ${delayMs}ms...`);
      await sleep(delayMs);
      delayMs *= 2;
    }
  }
}

export async function refreshCity({ city, state, lat, lon }) {
  let elements;
  try {
    elements = await fetchElements(lat, lon);
  } catch (err) {
    console.error(`[directory] ${city}: fetch failed —`, err.message);
    return { inserted: 0, errors: 1 };
  }

  let inserted = 0, duplicates = 0, errors = 0;
  for (const el of elements) {
    try {
      const result = await upsertElement(el, city, state);
      if (result === 'inserted') inserted++;
      else if (result === 'skip_duplicate') duplicates++;
    } catch (err) {
      console.error(`[directory] ${city}: item error —`, err.message);
      errors++;
    }
  }

  console.log(`[directory] ${city}: ${inserted} stores, ${duplicates} already covered, ${errors} errors`);
  return { inserted, errors };
}

export async function refreshAll() {
  let total = 0, totalErrors = 0;
  for (const cfg of DIRECTORY_CITIES) {
    const { inserted, errors } = await refreshCity(cfg);
    total += inserted;
    totalErrors += errors;
    await sleep(5000); // polite gap between Overpass requests
  }
  return { total, totalErrors };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
