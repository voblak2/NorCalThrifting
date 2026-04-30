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

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
