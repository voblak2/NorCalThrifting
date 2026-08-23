// Regenerates public/sitemap.xml from the live sales/thrift-store data.
// Runs automatically before `npm run build` (see package.json "prebuild"),
// so every Vercel deploy ships a sitemap reflecting current listings.
// Must never fail the build — if the API is unreachable (e.g. Render cold
// start), fall back to a sitemap with just the static pages.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { LOCATIONS } from '../src/locations.js';

const SITE_URL = 'https://www.norcalthrifting.com';
const API_URL = process.env.VITE_API_URL || 'https://norcal-thrifting-api.onrender.com/api';
const OUT_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sitemap.xml');

async function fetchWithTimeout(url, timeoutMs) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`bad status ${res.status}`);
  return res.json();
}

async function fetchSales() {
  try {
    // Render's free tier can take 30-50s to cold-start — try fast first,
    // then fall back to a much longer timeout rather than shipping an
    // incomplete sitemap just because the first attempt was too impatient.
    return await fetchWithTimeout(`${API_URL}/sales?limit=500`, 5000);
  } catch {
    try {
      return await fetchWithTimeout(`${API_URL}/sales?limit=500`, 45000);
    } catch (err) {
      console.warn(`[sitemap] couldn't reach API (${err.message}) — generating sitemap with static pages only.`);
      return { sales: [] };
    }
  }
}

function urlEntry(loc, { lastmod, changefreq, priority }) {
  return [
    '  <url>',
    `    <loc>${loc}</loc>`,
    lastmod ? `    <lastmod>${lastmod}</lastmod>` : null,
    changefreq ? `    <changefreq>${changefreq}</changefreq>` : null,
    priority != null ? `    <priority>${priority}</priority>` : null,
    '  </url>',
  ].filter(Boolean).join('\n');
}

const { sales = [] } = await fetchSales();
const today = new Date().toISOString().slice(0, 10);

const entries = [
  urlEntry(`${SITE_URL}/`, { lastmod: today, changefreq: 'daily', priority: '1.0' }),
  urlEntry(`${SITE_URL}/thrift-stores`, { lastmod: today, changefreq: 'weekly', priority: '0.8' }),
  urlEntry(`${SITE_URL}/contact`, { lastmod: today, changefreq: 'monthly', priority: '0.3' }),
  ...Object.values(LOCATIONS).map(loc => urlEntry(`${SITE_URL}${loc.path}`, {
    lastmod: today, changefreq: 'daily', priority: '0.9',
  })),
  ...sales.map(sale => urlEntry(`${SITE_URL}/listing/${sale.id}`, {
    lastmod: (sale.created_at || today).slice(0, 10),
    changefreq: sale.sale_type === 'thrift_store' ? 'monthly' : 'daily',
    priority: '0.6',
  })),
];

const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</urlset>\n`;

writeFileSync(OUT_PATH, xml);
console.log(`[sitemap] wrote ${entries.length} URLs to ${OUT_PATH}`);
