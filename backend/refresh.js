// refresh.js — Run every configured scraper once.
//
// Usage:
//   npm run refresh        # one-shot run
//   node refresh.js        # same thing
//
// The server (server.js) also calls refreshAll() via a nightly cron job.

import 'dotenv/config';
import { fileURLToPath } from 'url';
import { refreshAll as refreshCraigslist } from './scrapers/craigslist.js';
import { refreshAll as refreshEstateSales } from './scrapers/estatesales.js';
import { refreshAll as refreshDirectory } from './scrapers/directory.js';
import { refreshAll as refreshYelp } from './scrapers/yelp.js';
import { deleteExpired, countSales, getLastDirectoryRefresh, getLastYelpRefresh } from './db.js';

const DIRECTORY_REFRESH_INTERVAL_MS = 7 * 24 * 3600_000; // store locations don't churn daily like sale listings do — also keeps us polite to Overpass's free public server
const YELP_REFRESH_INTERVAL_MS = 7 * 24 * 3600_000; // same cadence — store locations don't churn daily, and keeps well within Yelp's 500 calls/day free tier

export async function refreshAll() {
  console.log(`[refresh] starting at ${new Date().toISOString()}`);
  const before = await countSales();

  const expired = await deleteExpired();
  if (expired > 0) console.log(`[refresh] removed ${expired} expired sales`);

  const cl = await refreshCraigslist();
  console.log(`[refresh] craigslist: ${cl.total} listings (${cl.totalErrors} errors)`);

  const es = await refreshEstateSales();
  console.log(`[refresh] estatesales: ${es.total} listings (${es.totalErrors} errors)`);

  const lastDirRun = await getLastDirectoryRefresh();
  const dirStaleMs = lastDirRun ? Date.now() - new Date(lastDirRun.replace(' ', 'T') + 'Z').getTime() : Infinity;
  if (dirStaleMs > DIRECTORY_REFRESH_INTERVAL_MS) {
    const dir = await refreshDirectory();
    console.log(`[refresh] directory: ${dir.total} stores (${dir.totalErrors} errors)`);
  } else {
    console.log(`[refresh] directory: skipped (last run ${lastDirRun}, still within ${DIRECTORY_REFRESH_INTERVAL_MS / 3600_000}h)`);
  }

  // Runs after the OSM directory pass above (not in parallel with it) so
  // that when the same store shows up in both, Yelp's usually-richer
  // phone/listing data has a freshly-inserted OSM row to merge into via
  // storeDedupe.js instead of racing to insert its own separate row first.
  const lastYelpRun = await getLastYelpRefresh();
  const yelpStaleMs = lastYelpRun ? Date.now() - new Date(lastYelpRun.replace(' ', 'T') + 'Z').getTime() : Infinity;
  if (yelpStaleMs > YELP_REFRESH_INTERVAL_MS) {
    const yelp = await refreshYelp();
    console.log(`[refresh] yelp: ${yelp.total} stores (${yelp.totalErrors} errors)`);
  } else {
    console.log(`[refresh] yelp: skipped (last run ${lastYelpRun}, still within ${YELP_REFRESH_INTERVAL_MS / 3600_000}h)`);
  }

  const after = await countSales();
  console.log(`[refresh] done. DB went from ${before} to ${after} sales.`);
  return { before, after };
}

// Run if invoked directly (not imported).
// fileURLToPath normalizes the URL to an OS path (handles Windows backslashes).
if (fileURLToPath(import.meta.url) === process.argv[1]) {
  refreshAll()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('[refresh] fatal:', err);
      process.exit(1);
    });
}
