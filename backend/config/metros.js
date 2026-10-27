// config/metros.js — the single list of metros the scrapers cover.
//
// Each scraper derives its own city list from METROS (craigslist.js,
// estatesales.js, directory.js), so adding or dropping coverage is a one-place
// edit here. A null field means that source doesn't cover the metro today.
// Before this file existed the three lists were hand-maintained separately and
// drifted: the Bay Area was missing from every scraper until 2026-08-08, and
// then from the OSM directory list for another week after that.
//
//   name         canonical display name; also the `city` label the Craigslist
//                and EstateSales configs carry
//   state        two-letter state code
//   lat, lon     metro center — the OSM directory's 20km search circle
//   craigslist   Craigslist subdomain ("sacramento" → sacramento.craigslist.org)
//   estatesales  EstateSales.net city-page slug (estatesales.net/CA/<slug>);
//                only the fallback path uses these now — the primary path is
//                the radius searches in scrapers/estatesales.js
//   osm          city label for OSM directory rows that carry no addr:city tag
//
// Craigslist runs the whole Bay Area as one site, 'sfbay' (oakland., berkeley.
// and sanjose.craigslist.org don't resolve; sanfrancisco.craigslist.org
// redirects to sfbay — verified 2026-08-08), so only San Francisco carries it.
// One 'sfbay' entry picks up Oakland/San Jose/etc. through each listing's own
// location text, the same way 'sacramento' covers Roseville and Folsom.
//
// EstateSales.net groups the East Bay under one metro page: a bare 'Oakland'
// slug 301s to 'Oakland-Hayward-Fremont', and 'Berkeley' redirects to
// 'San-Francisco', so there's deliberately no Berkeley entry.
//
// Order is the OSM directory's original order, which is the one list where
// order can change stored data (an untagged store inside two overlapping
// circles keeps the city label of whichever circle is scraped last).

export const METROS = [
  { name: 'Sacramento',    state: 'CA', lat: 38.5811, lon: -121.4939, craigslist: 'sacramento',  estatesales: 'Sacramento',              osm: 'Sacramento' },
  { name: 'Roseville',     state: 'CA', lat: 38.7521, lon: -121.2880, craigslist: null,          estatesales: 'Roseville',               osm: 'Roseville' },
  { name: 'Elk Grove',     state: 'CA', lat: 38.4088, lon: -121.3716, craigslist: null,          estatesales: 'Elk-Grove',               osm: 'Elk Grove' },
  { name: 'Stockton',      state: 'CA', lat: 37.9577, lon: -121.2908, craigslist: 'stockton',    estatesales: 'Stockton',                osm: 'Stockton' },
  { name: 'Modesto',       state: 'CA', lat: 37.6393, lon: -120.9969, craigslist: 'modesto',     estatesales: 'Modesto',                 osm: 'Modesto' },
  { name: 'Merced',        state: 'CA', lat: 37.1642, lon: -120.7679, craigslist: 'merced',      estatesales: null,                      osm: 'Merced' },
  { name: 'Fresno',        state: 'CA', lat: 36.7394, lon: -119.7848, craigslist: 'fresno',      estatesales: 'Fresno',                  osm: 'Fresno' },
  { name: 'Visalia',       state: 'CA', lat: 36.3302, lon: -119.2921, craigslist: 'visalia',     estatesales: null,                      osm: 'Visalia' },
  { name: 'Bakersfield',   state: 'CA', lat: 35.3739, lon: -119.0195, craigslist: 'bakersfield', estatesales: 'Bakersfield',             osm: 'Bakersfield' },
  { name: 'Chico',         state: 'CA', lat: 39.7285, lon: -121.8375, craigslist: 'chico',       estatesales: 'Chico',                   osm: 'Chico' },
  { name: 'Redding',       state: 'CA', lat: 40.5864, lon: -122.3917, craigslist: 'redding',     estatesales: 'Redding',                 osm: 'Redding' },
  // Bay Area
  { name: 'San Francisco', state: 'CA', lat: 37.7749, lon: -122.4194, craigslist: 'sfbay',       estatesales: 'San-Francisco',           osm: 'San Francisco' },
  { name: 'Oakland',       state: 'CA', lat: 37.8044, lon: -122.2712, craigslist: null,          estatesales: 'Oakland-Hayward-Fremont', osm: 'Oakland' },
  { name: 'San Jose',      state: 'CA', lat: 37.3382, lon: -121.8863, craigslist: null,          estatesales: 'San-Jose',                osm: 'San Jose' },
  // Sierra foothills
  { name: 'Auburn',        state: 'CA', lat: 38.8966, lon: -121.0768, craigslist: null,          estatesales: null,                      osm: 'Auburn' },
  { name: 'Placerville',   state: 'CA', lat: 38.7296, lon: -120.7985, craigslist: null,          estatesales: null,                      osm: 'Placerville' },
  { name: 'Grass Valley',  state: 'CA', lat: 39.2191, lon: -121.0611, craigslist: null,          estatesales: null,                      osm: 'Grass Valley' },
];
