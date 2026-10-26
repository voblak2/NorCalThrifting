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
import { deleteExpired, countSales, getLastDirectoryRefresh, countSalesBySource, recordScraperRun } from './db.js';

const DIRECTORY_REFRESH_INTERVAL_MS = 7 * 24 * 3600_000; // store locations don't churn daily like sale listings do — also keeps us polite to Overpass's free public server

// Runs one scraper and logs it to scraper_runs for the admin Analytics tab.
// `added` is the net change in that source's row count across the run (the
// scrapers' own `total` counts every upsert, including re-scrapes of rows
// that already existed). A scraper that throws is recorded as failed and the
// remaining scrapers still run — one site changing its markup shouldn't
// starve the others.
async function runTracked(scraper, source, fn) {
  const startedAt = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const before = await countSalesBySource(source);
  let run;
  try {
    const r = await fn();
    run = { ok: true, processed: r.total, errors: r.totalErrors };
  } catch (err) {
    console.error(`[refresh] ${scraper} failed:`, err);
    run = { ok: false, error_message: String(err?.message || err).slice(0, 500) };
  }
  run.added = (await countSalesBySource(source)) - before;
  try {
    await recordScraperRun({ scraper, started_at: startedAt, ...run });
  } catch (err) {
    console.error(`[refresh] could not record ${scraper} run:`, err.message);
  }
  return run;
}

export async function refreshAll() {
  console.log(`[refresh] starting at ${new Date().toISOString()}`);
  const before = await countSales();

  const expired = await deleteExpired();
  if (expired > 0) console.log(`[refresh] removed ${expired} expired sales`);

  const cl = await runTracked('craigslist', 'craigslist', refreshCraigslist);
  console.log(`[refresh] craigslist: ${cl.ok ? `${cl.processed} listings (${cl.errors} errors)` : `failed — ${cl.error_message}`}`);

  const es = await runTracked('estatesales', 'estatesales', refreshEstateSales);
  console.log(`[refresh] estatesales: ${es.ok ? `${es.processed} listings (${es.errors} errors)` : `failed — ${es.error_message}`}`);

  const lastDirRun = await getLastDirectoryRefresh();
  const dirStaleMs = lastDirRun ? Date.now() - new Date(lastDirRun.replace(' ', 'T') + 'Z').getTime() : Infinity;
  if (dirStaleMs > DIRECTORY_REFRESH_INTERVAL_MS) {
    const dir = await runTracked('osm', 'osm_directory', refreshDirectory);
    console.log(`[refresh] directory: ${dir.ok ? `${dir.processed} stores (${dir.errors} errors)` : `failed — ${dir.error_message}`}`);
  } else {
    console.log(`[refresh] directory: skipped (last run ${lastDirRun}, still within ${DIRECTORY_REFRESH_INTERVAL_MS / 3600_000}h)`);
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
