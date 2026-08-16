// geocode.js — Convert street addresses to lat/lng using the U.S. Census
// Geocoder. Free, no API key required, U.S. only, accurate enough for
// "show me on a map" purposes.
//
// Docs: https://geocoding.geo.census.gov/geocoder/
//
// Note: rate limit is informally ~10 req/sec. We add a polite delay
// between requests in batch mode. For production traffic, swap in a
// commercial geocoder (Mapbox, Google, HERE).

import axios from 'axios';
import { sleep } from './utils.js';

const ENDPOINT = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress';

const cache = new Map(); // simple in-memory cache (process lifetime only)

export async function geocode({ address, city, state, zip }) {
  const oneline = [address, city, state, zip].filter(Boolean).join(', ');
  if (!oneline.trim()) return null;
  if (cache.has(oneline)) return cache.get(oneline);

  try {
    const { data } = await axios.get(ENDPOINT, {
      params: {
        address: oneline,
        benchmark: 'Public_AR_Current',
        format: 'json',
      },
      timeout: 8000,
    });
    const match = data?.result?.addressMatches?.[0];
    if (!match) {
      cache.set(oneline, null);
      return null;
    }
    const result = {
      lat: match.coordinates.y,
      lng: match.coordinates.x,
      matched: match.matchedAddress,
    };
    cache.set(oneline, result);
    return result;
  } catch (err) {
    console.warn(`[geocode] failed for "${oneline}":`, err.message);
    return null;
  }
}

const NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_USER_AGENT = 'NorCalThrifting/1.0 (https://norcalthrifting.com)';
let lastNominatimCall = 0;

// Approximate (city/ZIP-centroid) fallback for listings that don't expose a
// full street address — common for estate sales before the sale day, and for
// Craigslist listings that only show a neighborhood name. geocode() above
// can't help here: the Census onelineaddress geocoder only matches real
// street addresses and returns no match for city/ZIP-only queries. Nominatim
// (OpenStreetMap) resolves city/ZIP centroids fine, at the cost of precision
// — the pin lands on the city/ZIP center, not the actual house. A coarse pin
// beats no pin. Respects Nominatim's usage policy (max 1 req/sec, descriptive
// User-Agent): https://operations.osmfoundation.org/policies/nominatim/
export async function geocodeApprox({ city, state, zip }) {
  const q = [zip, city, state].filter(Boolean).join(', ');
  if (!q.trim()) return null;
  const cacheKey = 'approx:' + q;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const wait = 1100 - (Date.now() - lastNominatimCall);
  if (wait > 0) await sleep(wait);
  lastNominatimCall = Date.now();

  try {
    const { data } = await axios.get(NOMINATIM_ENDPOINT, {
      params: { q, countrycodes: 'us', format: 'json', limit: 1 },
      headers: { 'User-Agent': NOMINATIM_USER_AGENT },
      timeout: 8000,
    });
    const match = data?.[0];
    if (!match) {
      cache.set(cacheKey, null);
      return null;
    }
    const result = { lat: parseFloat(match.lat), lng: parseFloat(match.lon) };
    cache.set(cacheKey, result);
    return result;
  } catch (err) {
    console.warn(`[geocode] approx failed for "${q}":`, err.message);
    return null;
  }
}

export function clearCache() { cache.clear(); }

// Polite batch helper — sleeps between calls to avoid hammering the API.
export async function geocodeBatch(items, delayMs = 150) {
  const out = [];
  for (const item of items) {
    out.push(await geocode(item));
    await sleep(delayMs);
  }
  return out;
}
