// scrapers/craigslist.js — Pull garage sale listings from Craigslist HTML.
//
// Craigslist's RSS feeds return HTTP 403 for server-side requests, but the
// regular search results page is server-rendered HTML and works fine with
// browser-like headers. Cities are trimmed to NorCal / Central Valley only.
//
// HTML structure (current as of 2025):
//   <li class="cl-static-search-result" title="Sale Title">
//     <a href="/gms/d/city-slug/7919524303.html">
//       <div class="title">Sale Title</div>
//       <div class="details">
//         <div class="price">$0</div>
//         <div class="location">Rancho Cordova</div>  ← sometimes a full address
//       </div>
//     </a>
//   </li>

import axios from 'axios';
import * as cheerio from 'cheerio';
import { upsertSale } from '../db.js';
import { parsePost } from '../parser.js';
import { geocode } from '../geocode.js';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Cache-Control': 'max-age=0',
};

// NorCal / Central Valley subdomains only
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
      // Extract numeric post ID from URL: /gms/d/city-slug/7919524303.html
      const pidMatch = link.match(/\/(\d{7,})\.html/);
      const pid = pidMatch ? pidMatch[1] : null;
      if (!pid) continue;

      // Location may be a neighborhood name or a full street address
      const location = $el.find('.location').text().trim();

      const parsed = parsePost(title, {});

      // Geocode strategy: try address if it looks like a street number, else ZIP, else skip.
      let lat = null, lng = null;
      const hasStreetNum = /^\d{2,5}\s+\w/.test(location);
      if (hasStreetNum) {
        const g = await geocode({ address: location, city, state });
        if (g) { lat = g.lat; lng = g.lng; }
      } else if (parsed.zip) {
        const g = await geocode({ city, state, zip: parsed.zip });
        if (g) { lat = g.lat; lng = g.lng; }
      }
      // Craigslist hides most addresses, so many listings won't have map pins — that's fine.

      upsertSale({
        source:          'craigslist',
        source_url:      link,
        source_id:       'cl_' + pid,
        title:           title.slice(0, 200),
        description:     '',
        address:         hasStreetNum ? location : null,
        address_visible: hasStreetNum,
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

const sleep = ms => new Promise(r => setTimeout(r, ms));
