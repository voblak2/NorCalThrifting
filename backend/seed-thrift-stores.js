// seed-thrift-stores.js — One-time runner to populate the DB with known NorCal thrift stores.
// Run with: node seed-thrift-stores.js
// Safe to re-run — uses UNIQUE(source, source_id) upsert, no duplicates.

import { upsertSale } from './db.js';
import { geocode } from './geocode.js';

const STORES = [
  // ── Goodwill Sacramento Valley & Northern Nevada ─────────────────────────
  { name: 'Goodwill',        address: '2502 Watt Ave',           city: 'Sacramento',    state: 'CA', zip: '95821' },
  { name: 'Goodwill',        address: '1900 Alhambra Blvd',      city: 'Sacramento',    state: 'CA', zip: '95816' },
  { name: 'Goodwill',        address: '5445 Auburn Blvd',        city: 'Sacramento',    state: 'CA', zip: '95841' },
  { name: 'Goodwill',        address: '4401 Elkhorn Blvd',       city: 'Sacramento',    state: 'CA', zip: '95842' },
  { name: 'Goodwill Superstore', address: '4040 Florin Rd',      city: 'Sacramento',    state: 'CA', zip: '95823' },
  { name: 'Goodwill',        address: '2040 Alta Arden Expwy',   city: 'Sacramento',    state: 'CA', zip: '95825' },
  { name: 'Goodwill',        address: '11092 Coloma Rd',         city: 'Rancho Cordova',state: 'CA', zip: '95670' },
  { name: 'Goodwill',        address: '9699 E Stockton Blvd',    city: 'Elk Grove',     state: 'CA', zip: '95624' },
  { name: 'Goodwill',        address: '9400 Fairway Dr',         city: 'Roseville',     state: 'CA', zip: '95678' },
  { name: 'Goodwill',        address: '390 Plaza Dr',            city: 'Folsom',        state: 'CA', zip: '95630' },
  { name: 'Goodwill',        address: '7120 Auburn Blvd',        city: 'Citrus Heights',state: 'CA', zip: '95610' },
  { name: 'Goodwill',        address: '2460 Grass Valley Hwy',   city: 'Auburn',        state: 'CA', zip: '95603' },
  { name: 'Goodwill',        address: '765 East Ave',            city: 'Chico',         state: 'CA', zip: '95926' },
  { name: 'Goodwill',        address: '1643 Hilltop Dr',         city: 'Redding',       state: 'CA', zip: '96002' },

  // ── Goodwill San Joaquin Valley ───────────────────────────────────────────
  { name: 'Goodwill',        address: '943 W March Lane',        city: 'Stockton',      state: 'CA', zip: '95207' },
  { name: 'Goodwill',        address: '2401 McHenry Ave',        city: 'Modesto',       state: 'CA', zip: '95350' },
  { name: 'Goodwill',        address: '3900 Sisk Road',          city: 'Modesto',       state: 'CA', zip: '95356' },
  { name: 'Goodwill',        address: '3702 W Shaw Ave',         city: 'Fresno',        state: 'CA', zip: '93711' },
  { name: 'Goodwill',        address: '6437 N Blackstone Ave',   city: 'Fresno',        state: 'CA', zip: '93710' },
  { name: 'Goodwill',        address: '5663 E Kings Canyon Rd',  city: 'Fresno',        state: 'CA', zip: '93727' },
  { name: 'Goodwill',        address: '239 W Shaw Ave',          city: 'Clovis',        state: 'CA', zip: '93612' },
  { name: 'Goodwill',        address: '808 W Kettleman Lane',    city: 'Lodi',          state: 'CA', zip: '95240' },
  { name: 'Goodwill',        address: '1477 W Yosemite Ave',     city: 'Manteca',       state: 'CA', zip: '95337' },
  { name: 'Goodwill',        address: '2626 N Tracy Blvd',       city: 'Tracy',         state: 'CA', zip: '95376' },
  { name: 'Goodwill',        address: '3000 N Tegner Road',      city: 'Turlock',       state: 'CA', zip: '95380' },

  // ── Salvation Army ────────────────────────────────────────────────────────
  { name: 'Salvation Army Thrift Store', address: '10309 Folsom Blvd',   city: 'Rancho Cordova', state: 'CA', zip: '95670' },
  { name: 'Salvation Army Thrift Store', address: '1247 S Wilson Way',   city: 'Stockton',       state: 'CA', zip: '95205' },
  { name: 'Salvation Army Thrift Store', address: '710 S Parallel Ave',  city: 'Fresno',         state: 'CA', zip: '93721' },
  { name: 'Salvation Army Thrift Store', address: '6574 N Blackstone Ave', city: 'Fresno',       state: 'CA', zip: '93710' },
  { name: 'Salvation Army Thrift Store', address: '4418 McHenry Ave',    city: 'Modesto',        state: 'CA', zip: '95356' },
  { name: 'Salvation Army Thrift Store', address: '700 Broadway St',     city: 'Chico',          state: 'CA', zip: '95928' },
  { name: 'Salvation Army Thrift Store', address: '4460 Westside Rd',    city: 'Redding',        state: 'CA', zip: '96001' },

  // ── Habitat for Humanity ReStore ──────────────────────────────────────────
  { name: 'Habitat for Humanity ReStore', address: '819 N 10th St',      city: 'Sacramento',     state: 'CA', zip: '95811' },
  { name: 'Habitat for Humanity ReStore', address: '1631 Railroad Ave',  city: 'Clovis',         state: 'CA', zip: '93612' },
];

function makeId(name, address, city) {
  const s = `${name}|${address}|${city}`.toLowerCase().replace(/\W+/g, '_');
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return 'dir_' + (h >>> 0).toString(16);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

let inserted = 0, skipped = 0, geocodeFail = 0;

for (const store of STORES) {
  process.stdout.write(`  ${store.name} — ${store.city}, ${store.state} ... `);

  const g = await geocode({ address: store.address, city: store.city, state: store.state, zip: store.zip });
  if (!g) {
    geocodeFail++;
    console.log('no coords');
  } else {
    console.log(`${g.lat.toFixed(4)}, ${g.lng.toFixed(4)}`);
  }

  await upsertSale({
    source:          'directory',
    source_url:      null,
    source_id:       makeId(store.name, store.address, store.city),
    title:           `${store.name} — ${store.city}`,
    description:     `${store.name} thrift store located at ${store.address}, ${store.city}, CA ${store.zip}.`,
    address:         store.address,
    address_visible: true,
    city:            store.city,
    state:           store.state,
    zip:             store.zip,
    lat:             g?.lat ?? null,
    lng:             g?.lng ?? null,
    sale_date:       null,
    start_time:      null,
    end_time:        null,
    categories:      ['Thrift Store'],
    sale_type:       'thrift_store',
    status:          'active',
    expires_at:      null,  // permanent — never expires
  });
  inserted++;

  await sleep(300); // be polite to the Census geocoder
}

console.log(`\nDone. ${inserted} stores upserted, ${geocodeFail} without coordinates, ${skipped} skipped.`);
process.exit(0);
