// scrapers/craigslist.js — Pull garage sale listings from Craigslist RSS.
//
// Every Craigslist subdomain exposes RSS feeds for each category. The
// "garage sale" category is "gms". URL pattern:
//   https://{city}.craigslist.org/search/gms?format=rss
//
// RSS is a STABLE, EXPLICITLY-SUPPORTED interface — Craigslist publishes
// these feeds for syndication, so this scraper doesn't risk breaking the
// way HTML scraping would. The trade-off: addresses are often vague or
// missing entirely (Craigslist convention is "DM for full address").
//
// Add cities to the CRAIGSLIST_CITIES list below to expand coverage.

import RSSParser from 'rss-parser';
import { upsertSale } from '../db.js';
import { parsePost } from '../parser.js';
import { geocode } from '../geocode.js';

const parser = new RSSParser({
  customFields: {
    item: [
      ['dc:date', 'dcDate'],
      ['georss:point', 'geoPoint'],
    ],
  },
});

// Map Craigslist subdomain → { city, state }. Add as needed.
// Find the subdomain from any Craigslist URL: e.g., sacramento.craigslist.org
export const CRAIGSLIST_CITIES = [
  { sub: 'sacramento',    city: 'Sacramento',     state: 'CA' },
  { sub: 'sfbay',         city: 'San Francisco',  state: 'CA' },
  { sub: 'losangeles',    city: 'Los Angeles',    state: 'CA' },
  { sub: 'sandiego',      city: 'San Diego',      state: 'CA' },
  { sub: 'portland',      city: 'Portland',       state: 'OR' },
  { sub: 'seattle',       city: 'Seattle',        state: 'WA' },
  { sub: 'phoenix',       city: 'Phoenix',        state: 'AZ' },
  { sub: 'denver',        city: 'Denver',         state: 'CO' },
  { sub: 'austin',        city: 'Austin',         state: 'TX' },
  { sub: 'dallas',        city: 'Dallas',         state: 'TX' },
  { sub: 'houston',       city: 'Houston',        state: 'TX' },
  { sub: 'chicago',       city: 'Chicago',        state: 'IL' },
  { sub: 'newyork',       city: 'New York',       state: 'NY' },
  { sub: 'boston',        city: 'Boston',         state: 'MA' },
  { sub: 'philadelphia',  city: 'Philadelphia',   state: 'PA' },
  { sub: 'atlanta',       city: 'Atlanta',        state: 'GA' },
  { sub: 'miami',         city: 'Miami',          state: 'FL' },
  { sub: 'minneapolis',   city: 'Minneapolis',    state: 'MN' },
  { sub: 'madison',       city: 'Madison',        state: 'WI' },
  { sub: 'nashville',     city: 'Nashville',      state: 'TN' },
];

/**
 * Refresh a single Craigslist city.
 * @returns {Promise<{ inserted: number, errors: number }>}
 */
export async function refreshCity({ sub, city, state }) {
  const url = `https://${sub}.craigslist.org/search/gms?format=rss`;
  let feed;
  try {
    feed = await parser.parseURL(url);
  } catch (err) {
    console.error(`[craigslist] ${sub}: feed fetch failed —`, err.message);
    return { inserted: 0, errors: 1 };
  }

  let inserted = 0;
  let errors = 0;

  // Calculate expiration: 14 days from now (Craigslist auto-removes after ~30)
  const expiresAt = new Date(Date.now() + 14 * 24 * 3600 * 1000)
    .toISOString().slice(0, 10);

  for (const item of feed.items || []) {
    try {
      const text = stripHtml(item.contentSnippet || item.content || item.summary || '');
      const fullText = `${item.title}\n${text}`;
      const postedDate = item.dcDate || item.isoDate || item.pubDate;

      const parsed = parsePost(fullText, { postedDate });

      // Try to extract lat/lng from the RSS georss:point if present
      let lat = null, lng = null;
      if (item.geoPoint && typeof item.geoPoint === 'string') {
        const [latStr, lngStr] = item.geoPoint.split(/\s+/);
        lat = parseFloat(latStr) || null;
        lng = parseFloat(lngStr) || null;
      }

      // Geocode by ZIP if we have one and no lat/lng
      if (!lat && parsed.zip) {
        const g = await geocode({ city, state, zip: parsed.zip });
        if (g) { lat = g.lat; lng = g.lng; }
      }

      upsertSale({
        source: 'craigslist',
        source_url: item.link,
        source_id: hashId(item.link || item.guid || item.title),
        title: cleanTitle(item.title),
        description: text.slice(0, 800),
        address: null,                  // Craigslist hides full address by convention
        address_visible: false,
        city,
        state,
        zip: parsed.zip,
        lat, lng,
        sale_date: parsed.sale_date,
        start_time: parsed.start_time,
        end_time: parsed.end_time,
        categories: parsed.categories,
        expires_at: expiresAt,
      });
      inserted++;
    } catch (err) {
      console.error(`[craigslist] ${sub}: failed to process item —`, err.message);
      errors++;
    }
  }

  console.log(`[craigslist] ${sub} (${city}, ${state}): ${inserted} listings, ${errors} errors`);
  return { inserted, errors };
}

/**
 * Refresh all configured Craigslist cities.
 */
export async function refreshAll() {
  let total = 0;
  let totalErrors = 0;
  for (const cfg of CRAIGSLIST_CITIES) {
    const { inserted, errors } = await refreshCity(cfg);
    total += inserted;
    totalErrors += errors;
    // Be polite — wait 1s between cities
    await sleep(1000);
  }
  return { total, totalErrors };
}

// ---------- Helpers ----------

function stripHtml(html) {
  return (html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanTitle(t) {
  // Craigslist often suffixes price/area like " - $0 (Citrus Heights)" — keep it but truncate
  return (t || '').replace(/\s+/g, ' ').trim().slice(0, 200);
}

function hashId(s) {
  // Tiny non-crypto hash — enough for de-dup
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return 'cl_' + (h >>> 0).toString(16);
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
