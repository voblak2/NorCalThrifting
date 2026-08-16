// scrapers/craigslist.js — Pull garage sale listings from Craigslist HTML.
//
// Craigslist's RSS feeds return HTTP 403 for server-side requests, but the
// regular search results page is server-rendered HTML and works fine with
// browser-like headers. Cities are trimmed to NorCal / Central Valley only.
//
// HTML structure (current as of 2026-08):
//   <li class="cl-static-search-result" title="Sale Title">
//     <a href="https://www.craigslist.org/view/d/city-slug/fa3EYSbAAz67kAs9ZHwdbz">
//       <div class="title">Sale Title</div>
//       <div class="details">
//         <div class="price">$0</div>
//         <div class="location">Rancho Cordova</div>  ← sometimes a full address
//       </div>
//     </a>
//   </li>
//
// Craigslist migrated listing URLs from numeric IDs (/gms/d/city-slug/7919524303.html)
// to opaque alphanumeric IDs (/view/d/city-slug/fa3EYSbAAz67kAs9ZHwdbz) sometime
// before 2026-08 — extractPostId() below handles both.

import axios from 'axios';
import * as cheerio from 'cheerio';
import { upsertSale } from '../db.js';
import { parsePost } from '../parser.js';
import { geocode, geocodeApprox } from '../geocode.js';
import { HEADERS as BASE_HEADERS } from './shared.js';
import { sleep } from '../utils.js';

// Craigslist-specific headers on top of the common browser-impersonation base.
const HEADERS = {
  ...BASE_HEADERS,
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Cache-Control': 'max-age=0',
};

// NorCal / Central Valley subdomains only.
//
// 'sfbay' is a single entry, not one per Bay Area city: Craigslist runs the
// whole San Francisco Bay Area (SF, Oakland, Berkeley, San Jose, the
// Peninsula, etc.) as one combined site — oakland.craigslist.org,
// berkeley.craigslist.org, and sanjose.craigslist.org don't resolve at all,
// and sanfrancisco.craigslist.org just redirects to the same sfbay area
// (verified directly, 2026-08-08). Exactly like the 'sacramento' entry
// already picks up Roseville/Folsom/Carmichael/etc. through each listing's
// own location text without a separate entry per suburb, one 'sfbay' entry
// covers Oakland/Berkeley/San Jose/San Francisco the same way.
export const CRAIGSLIST_CITIES = [
  { sub: 'sacramento',  city: 'Sacramento',  state: 'CA' },
  { sub: 'stockton',    city: 'Stockton',    state: 'CA' },
  { sub: 'modesto',     city: 'Modesto',     state: 'CA' },
  { sub: 'fresno',      city: 'Fresno',      state: 'CA' },
  { sub: 'chico',       city: 'Chico',       state: 'CA' },
  { sub: 'redding',     city: 'Redding',     state: 'CA' },
  { sub: 'bakersfield', city: 'Bakersfield', state: 'CA' },
  { sub: 'merced',      city: 'Merced',      state: 'CA' },
  { sub: 'visalia',     city: 'Visalia',     state: 'CA' },
  { sub: 'sfbay',       city: 'San Francisco', state: 'CA' },
];

export async function refreshCity({ sub, city, state }) {
  const url = `https://${sub}.craigslist.org/search/gms`;
  let html;
  try {
    const resp = await axios.get(url, { headers: HEADERS, timeout: 15000 });
    html = resp.data;
  } catch (err) {
    console.error(`[craigslist] ${sub}: fetch failed —`, err.message);
    return { inserted: 0, errors: 1 };
  }

  const $ = cheerio.load(html);
  const items = $('li.cl-static-search-result').toArray();

  if (items.length === 0) {
    console.warn(`[craigslist] ${sub}: 0 listings found`);
    return { inserted: 0, errors: 0 };
  }

  let inserted = 0, errors = 0;
  const expiresAt = new Date(Date.now() + 14 * 24 * 3600_000).toISOString().slice(0, 10);

  for (const el of items) {
    try {
      const $el = $(el);
      const title = $el.find('.title').text().trim() || $el.attr('title') || '';
      if (!title) continue;

      const anchor = $el.find('a').first();
      const link = anchor.attr('href') || '';
      const pid = extractPostId(link);
      if (!pid) continue;

      // Location may be a neighborhood name or a full street address
      const location = $el.find('.location').text().trim();

      const parsed = parsePost(title, {});

      // Geocode strategy: precise street match if we have one, else an
      // approximate city/ZIP-centroid pin (geocode() can't do city/ZIP-only
      // lookups — see geocodeApprox()'s comment in geocode.js).
      let lat = null, lng = null, locationApprox = false;
      const hasStreetNum = /^\d{2,5}\s+\w/.test(location);
      if (hasStreetNum) {
        const g = await geocode({ address: location, city, state });
        if (g) { lat = g.lat; lng = g.lng; }
      }
      if (lat == null) {
        const g = await geocodeApprox({ city, state, zip: parsed.zip });
        if (g) { lat = g.lat; lng = g.lng; locationApprox = true; }
      }

      await upsertSale({
        source:          'craigslist',
        source_url:      link,
        source_id:       'cl_' + pid,
        title:           title.slice(0, 200),
        description:     '',
        address:         hasStreetNum ? location : null,
        address_visible: hasStreetNum,
        location_approx: locationApprox,
        city:            hasStreetNum ? city : (location || city),
        state,
        zip:             parsed.zip,
        lat, lng,
        sale_date:       parsed.sale_date,
        start_time:      parsed.start_time,
        end_time:        parsed.end_time,
        categories:      parsed.categories,
        sale_type:       'garage_sale',
        status:          'active',
        expires_at:      expiresAt,
      });
      inserted++;
    } catch (err) {
      console.error(`[craigslist] ${sub}: item error —`, err.message);
      errors++;
    }
  }

  console.log(`[craigslist] ${sub}: ${inserted} listings, ${errors} errors`);
  return { inserted, errors };
}

export async function refreshAll() {
  let total = 0, totalErrors = 0;
  for (const cfg of CRAIGSLIST_CITIES) {
    const { inserted, errors } = await refreshCity(cfg);
    total += inserted;
    totalErrors += errors;
    await sleep(2000);
  }
  return { total, totalErrors };
}

// Old format: /gms/d/city-slug/7919524303.html — numeric, .html suffix.
// New format: /view/d/city-slug/fa3EYSbAAz67kAs9ZHwdbz — opaque alnum, no suffix.
// The opaque id never contains hyphens (the slug segment before it does), which
// disambiguates it from the rest of the path.
function extractPostId(link) {
  const numeric = link.match(/\/(\d{7,})\.html/);
  if (numeric) return numeric[1];
  const last = link.split('?')[0].replace(/\/$/, '').split('/').pop() || '';
  return /^[A-Za-z0-9]{8,}$/.test(last) ? last : null;
}
