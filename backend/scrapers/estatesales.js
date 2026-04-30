// scrapers/estatesales.js — Pull estate sale listings from EstateSales.net.
//
// EstateSales.net publishes browseable city listings at:
//   https://www.estatesales.net/{STATE}/{City}/{ZIP}
// e.g., https://www.estatesales.net/CA/Sacramento
//
// IMPORTANT: HTML scrapers are FRAGILE. EstateSales.net updates its
// markup periodically. The selectors below match the site as of this
// build — if results suddenly drop to zero, inspect the HTML and update
// the selectors. Always check robots.txt and Terms of Service before
// running scrapers in production.
//
// As of writing, https://www.estatesales.net/robots.txt allows crawling
// the public listing pages. Be a good citizen: rate-limit, identify
// your User-Agent, and cache aggressively.

import axios from 'axios';
import * as cheerio from 'cheerio';
import { upsertSale } from '../db.js';
import { parsePost } from '../parser.js';
import { geocode } from '../geocode.js';

const USER_AGENT = 'SaturdayFindsBot/0.1 (+https://example.com/contact)';

// Cities to scan. Add more as needed.
export const ESTATESALES_CITIES = [
  { state: 'CA', city: 'Sacramento' },
  { state: 'CA', city: 'San-Francisco' },     // URL slug uses dashes
  { state: 'OR', city: 'Portland' },
  { state: 'WA', city: 'Seattle' },
  { state: 'CO', city: 'Denver' },
  { state: 'TX', city: 'Austin' },
  { state: 'IL', city: 'Chicago' },
  { state: 'MA', city: 'Boston' },
  { state: 'NY', city: 'New-York' },
];

/**
 * Refresh a single city.
 */
export async function refreshCity({ state, city }) {
  const url = `https://www.estatesales.net/${state}/${city}`;
  let html;
  try {
    const resp = await axios.get(url, {
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html' },
      timeout: 15000,
    });
    html = resp.data;
  } catch (err) {
    console.error(`[estatesales] ${city}, ${state}: fetch failed —`, err.message);
    return { inserted: 0, errors: 1 };
  }

  const $ = cheerio.load(html);

  // The site lists each sale inside an <article> or div with class
  // containing "sale-card" / "sale-listing". This selector is broad
  // intentionally — adjust if their markup changes.
  const cards = $('[class*="sale-card"], article.sale, [data-test*="sale"]').toArray();
  if (cards.length === 0) {
    console.warn(`[estatesales] ${city}, ${state}: 0 cards found — selector may be stale`);
    return { inserted: 0, errors: 0 };
  }

  let inserted = 0;
  let errors = 0;
  const cityDisplay = city.replace(/-/g, ' ');

  for (const el of cards) {
    try {
      const $el = $(el);
      const title = textOf($el.find('h2, h3, .sale-title').first());
      const description = textOf($el.find('.description, .summary, p').first());
      const address = textOf($el.find('.address, [class*="address"]').first());
      const link = $el.find('a').first().attr('href') || null;
      const fullUrl = link ? new URL(link, 'https://www.estatesales.net').href : null;

      if (!title) continue;

      const parsed = parsePost(`${title}\n${description}\n${address}`, {});

      // Geocode if we got an address
      let lat = null, lng = null;
      if (address) {
        const g = await geocode({ address, city: cityDisplay, state, zip: parsed.zip });
        if (g) { lat = g.lat; lng = g.lng; }
      }

      const expiresAt = parsed.sale_date ?
        addDays(parsed.sale_date, 1) :
        new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString().slice(0, 10);

      upsertSale({
        source: 'estatesales',
        source_url: fullUrl,
        source_id: 'es_' + hashId(fullUrl || title),
        title: title.slice(0, 200),
        description: description.slice(0, 800),
        address: address || null,
        address_visible: !!address,
        city: cityDisplay,
        state,
        zip: parsed.zip,
        lat, lng,
        sale_date: parsed.sale_date,
        start_time: parsed.start_time,
        end_time: parsed.end_time,
        categories: ['Estate Sale', ...parsed.categories.filter(c => c !== 'Estate Sale')],
        expires_at: expiresAt,
      });
      inserted++;
    } catch (err) {
      console.error(`[estatesales] ${city}, ${state}: failed to process item —`, err.message);
      errors++;
    }
  }

  console.log(`[estatesales] ${cityDisplay}, ${state}: ${inserted} listings, ${errors} errors`);
  return { inserted, errors };
}

export async function refreshAll() {
  let total = 0;
  let totalErrors = 0;
  for (const cfg of ESTATESALES_CITIES) {
    const { inserted, errors } = await refreshCity(cfg);
    total += inserted;
    totalErrors += errors;
    await sleep(2000); // be polite
  }
  return { total, totalErrors };
}

// ---------- Helpers ----------

function textOf($el) {
  return ($el.text() || '').replace(/\s+/g, ' ').trim();
}

function hashId(s) {
  let h = 5381;
  for (let i = 0; i < (s || '').length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}

function addDays(isoDate, n) {
  const d = new Date(isoDate + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
