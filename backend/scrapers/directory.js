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
import { findNearbyThriftStore } from '../db.js';
import { sleep } from '../utils.js';
import { normalizeName, normalizeAddress, descriptionCompleteness } from '../dedupe.js';
import { upsertThriftStore } from './storeDedupe.js';

const ENDPOINT = 'https://overpass-api.de/api/interpreter';
const USER_AGENT = 'NorCalThrifting/1.0 (https://norcalthrifting.com)';
const RADIUS_M = 20000; // 20km metro-area radius per city

// NorCal city centers — union of the cities already used by
// CRAIGSLIST_CITIES/ESTATESALES_CITIES (Central Valley, far north) plus Bay
// Area and Sierra foothills coverage so the directory isn't Sacramento-
// metro-only. 20km per city means the 3 Bay Area entries alone collectively
// reach SF/Marin/Peninsula, Berkeley/Richmond/Hayward, and Santa Clara/
// Sunnyvale/Milpitas without needing an entry per suburb — same principle
// CRAIGSLIST_CITIES' single 'sfbay' entry relies on.
export const DIRECTORY_CITIES = [
  { city: 'Sacramento',    state: 'CA', lat: 38.5811, lon: -121.4939 },
  { city: 'Roseville',     state: 'CA', lat: 38.7521, lon: -121.2880 },
  { city: 'Elk Grove',     state: 'CA', lat: 38.4088, lon: -121.3716 },
  { city: 'Stockton',      state: 'CA', lat: 37.9577, lon: -121.2908 },
  { city: 'Modesto',       state: 'CA', lat: 37.6393, lon: -120.9969 },
  { city: 'Merced',        state: 'CA', lat: 37.1642, lon: -120.7679 },
  { city: 'Fresno',        state: 'CA', lat: 36.7394, lon: -119.7848 },
  { city: 'Visalia',       state: 'CA', lat: 36.3302, lon: -119.2921 },
  { city: 'Bakersfield',   state: 'CA', lat: 35.3739, lon: -119.0195 },
  { city: 'Chico',         state: 'CA', lat: 39.7285, lon: -121.8375 },
  { city: 'Redding',       state: 'CA', lat: 40.5864, lon: -122.3917 },
  // Bay Area
  { city: 'San Francisco', state: 'CA', lat: 37.7749, lon: -122.4194 },
  { city: 'Oakland',       state: 'CA', lat: 37.8044, lon: -122.2712 },
  { city: 'San Jose',      state: 'CA', lat: 37.3382, lon: -121.8863 },
  // Sierra foothills
  { city: 'Auburn',        state: 'CA', lat: 38.8966, lon: -121.0768 },
  { city: 'Placerville',   state: 'CA', lat: 38.7296, lon: -120.7985 },
  { city: 'Grass Valley',  state: 'CA', lat: 39.2191, lon: -121.0611 },
];

// OSM tag combinations that map to "somewhere a thrifter would want to go".
// Each is queried as both a node AND a way (see buildQuery) — larger stores
// are frequently mapped as a building outline (way) rather than a point
// (node), and node-only queries were silently missing them.
const TAG_FILTERS = [
  '["shop"="charity"]',
  '["shop"="second_hand"]',
  '["shop"="antiques"]',
  '["shop"="vintage"]',
  '["shop"="consignment"]',
  '["shop"="clothes"]["second_hand"="yes"]',
  '["shop"="furniture"]["second_hand"="yes"]',
];

function categoryFor(tags) {
  const shop = tags.shop;
  if (shop === 'antiques') return 'Antiques';
  if (shop === 'vintage') return 'Vintage';
  if (shop === 'second_hand' || shop === 'consignment') return 'Consignment';
  if ((shop === 'clothes' || shop === 'furniture') && tags.second_hand === 'yes') return 'Consignment';
  return 'Thrift Store'; // charity, or any other match
}

function buildQuery(lat, lon) {
  const clauses = TAG_FILTERS.flatMap(filter => [
    `node${filter}(around:${RADIUS_M},${lat},${lon});`,
    `way${filter}(around:${RADIUS_M},${lat},${lon});`,
  ]).join('');
  // `out center;` (vs the old `out body;`) additionally computes a center
  // point for way results — nodes still report lat/lon directly as before.
  return `[out:json][timeout:30];(${clauses});out center;`;
}

// A way (building outline) has no direct lat/lon — Overpass's `out center;`
// adds a computed `.center` instead. A node still reports lat/lon directly.
function coordsOf(el) {
  if (el.type === 'way') return el.center ? { lat: el.center.lat, lon: el.center.lon } : null;
  return { lat: el.lat, lon: el.lon };
}

function buildAddress(tags) {
  const num = tags['addr:housenumber'];
  const street = tags['addr:street'];
  return num && street ? `${num} ${street}` : null;
}

function titleCase(str) {
  return str.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

// OSM's addr:city is crowdsourced and occasionally messy: casing varies
// ("redding" instead of "Redding"), and rarely a street-name fragment ends
// up duplicated into the city tag (observed: addr:city="St. Chico" on a
// business named "6th St. Secondhand", in a city we were already querying
// as "Chico"). Only strips a "St./Saint " prefix when what's left exactly
// matches the city we searched for, so real "St. <Town>" place names (e.g.
// St. Helena) are never affected — this only fires on our own known query
// target, not on place names generally.
function cleanCityTag(rawCity, fallbackCity) {
  if (!rawCity) return fallbackCity;
  const trimmed = rawCity.trim();
  const stripped = trimmed.replace(/^(st\.?|saint)\s+/i, '');
  if (stripped !== trimmed && stripped.toLowerCase() === fallbackCity.toLowerCase()) {
    return fallbackCity;
  }
  return titleCase(trimmed);
}

function buildDescription(name, tags, categoryLabel) {
  const bits = [`${name} is a ${categoryLabel.toLowerCase()} shop`];
  const phone = tags['contact:phone'] || tags.phone;
  const website = tags['contact:website'] || tags.website;
  if (phone) bits.push(`Phone: ${phone}.`);
  if (website) bits.push(`Website: ${website}.`);
  return bits.join(' ');
}

// Nodes and ways can both describe the exact same physical store (e.g. an
// entrance node plus the building outline way), and every TAG_FILTERS entry
// is queried against both — merge them in-memory, keyed by normalized
// name+address (falling back to city when a store has no addr:housenumber/
// addr:street tags), BEFORE any of these ever reach the database. Keeps
// whichever raw element would produce the more complete description.
function dedupeElements(elements, fallbackCity) {
  const byKey = new Map();
  for (const el of elements) {
    const tags = el.tags || {};
    const name = tags.name;
    if (!name) continue; // no name → nothing sensible to title the listing with
    const coords = coordsOf(el);
    if (!coords || coords.lat == null || coords.lon == null) continue;

    const category = categoryFor(tags);
    const address = buildAddress(tags);
    const description = buildDescription(name, tags, category);
    const key = normalizeName(name) + '|' + (normalizeAddress(address) || normalizeName(fallbackCity));

    const candidate = { el, tags, name, coords, category, address, description };
    const existing = byKey.get(key);
    if (!existing || descriptionCompleteness(description) > descriptionCompleteness(existing.description)) {
      byKey.set(key, candidate);
    }
  }
  return [...byKey.values()];
}

async function upsertElement(item, fallbackCity, fallbackState) {
  const { el, tags, name, coords, category, address, description } = item;

  // Avoid double-pinning a store that's already in the DB from another
  // source (e.g. the hand-curated chain list in seed-thrift-stores.js) —
  // OSM coverage of specific chain locations turned out to be incomplete
  // when checked against that list, so both sources are kept rather than
  // one replacing the other; this just prevents visible duplicate pins
  // where they do overlap.
  if (await findNearbyThriftStore(coords.lat, coords.lon, name)) return 'skip_duplicate';

  const city = cleanCityTag(tags['addr:city'], fallbackCity);

  return upsertThriftStore({
    source:          'osm_directory',
    source_url:      null,
    source_id:       `osm_${el.type[0]}${el.id}`, // 'n'/'w' prefix disambiguates node vs way ids, which share no namespace
    title:           `${name} — ${city}`,
    description,
    address,
    address_visible: !!address,
    location_approx: false, // OSM coordinates are the actual mapped point/centroid, not a geocoded guess
    city,
    state:           tags['addr:state'] || fallbackState,
    zip:             tags['addr:postcode'] || null,
    lat:             coords.lat,
    lng:             coords.lon,
    sale_date:       null,
    start_time:      null,
    end_time:        null,
    categories:      [category],
    sale_type:       'thrift_store',
    status:          'active',
    expires_at:      null, // permanent — never expires
  });
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

  const deduped = dedupeElements(elements, city);

  let inserted = 0, enriched = 0, duplicates = 0, errors = 0;
  for (const item of deduped) {
    try {
      const result = await upsertElement(item, city, state);
      if (result === 'inserted') inserted++;
      else if (result === 'enriched') enriched++;
      else if (result?.startsWith('skip')) duplicates++;
    } catch (err) {
      console.error(`[directory] ${city}: item error —`, err.message);
      errors++;
    }
  }

  console.log(`[directory] ${city}: ${elements.length} raw elements → ${deduped.length} deduped, ${inserted} stores, ${enriched} enriched, ${duplicates} already covered, ${errors} errors`);
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
