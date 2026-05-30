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
import { deleteExpired, countSales } from './db.js';

export async function refreshAll() {
  console.log(`[refresh] starting at ${new Date().toISOString()}`);
  const before = countSales();

  const expired = deleteExpired();
  if (expired > 0) console.log(`[refresh] removed ${expired} expired sales`);

  const cl = await refreshCraigslist();
  console.log(`[refresh] craigslist: ${cl.total} listings (${cl.totalErrors} errors)`);

  const es = await refreshEstateSales();
  console.log(`[refresh] estatesales: ${es.total} listings (${es.totalErrors} errors)`);

  const after = countSales();
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
