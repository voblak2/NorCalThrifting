// seed-thrift-stores-curated.js — One-time runner to add a hand-curated batch
// of independent Sacramento-area thrift, vintage, antique, and consignment
// stores to the directory. Unlike seed-thrift-stores.js (major chains),
// these are independent local businesses verified by name/address.
//
// Run with: node seed-thrift-stores-curated.js
// Safe to re-run — uses UNIQUE(source, source_id) upsert, no duplicates.

import 'dotenv/config';
import { upsertSale } from './db.js';
import { geocode, geocodeApprox } from './geocode.js';

// type tags mirror the categories used by scrapers/directory.js, plus
// 'Vintage' and 'Estate Sale Company' for stores that fit those better than
// the existing 'Thrift Store' / 'Antiques' / 'Consignment' set.
const STORES = [
  { name: 'Comfort Thrift & Boutique',   address: '11415 Folsom Blvd #120',      city: 'Rancho Cordova', zip: '95742', categories: ['Thrift Store'] },
  { name: 'Hope and Threads',            address: '10343 Folsom Blvd',           city: 'Rancho Cordova', zip: '95670', categories: ['Thrift Store'] },
  { name: 'Rivers Little Finds',         address: '10485 Folsom Blvd #A',        city: 'Rancho Cordova', zip: '95670', categories: ['Thrift Store'] },
  { name: 'Society of St. Vincent de Paul', address: '2275 Watt Ave',            city: 'Sacramento',     zip: '95825', categories: ['Thrift Store'] },
  { name: 'Thrift Town',                 address: '410 El Camino Ave',           city: 'Sacramento',     zip: '95815', categories: ['Thrift Store'] },
  { name: 'FreeStyle Clothing Exchange', address: '1906 L St',                   city: 'Sacramento',     zip: '95816', categories: ['Consignment'] },
  { name: 'SecondHand Hustle Sacramento',address: '1924 16th St',                city: 'Sacramento',     zip: '95811', categories: ['Thrift Store'] },
  { name: 'Racks Vintage Boutique',      address: '1822 24th St',                city: 'Sacramento',     zip: '95816', categories: ['Vintage'] },
  { name: 'Vintage YSJ',                 address: '1812 J St #14',               city: 'Sacramento',     zip: '95811', categories: ['Vintage'] },
  { name: 'The Closet Trading Company',  address: '478 Howe Ave',                city: 'Sacramento',     zip: '95825', categories: ['Consignment'] },
  { name: 'Weave Thrift',                address: '2401 Arden Wy',               city: 'Sacramento',     zip: '95825', categories: ['Thrift Store'] },
  { name: 'Cheap Frills',                address: '2012 Del Paso Blvd',          city: 'Sacramento',     zip: '95815', categories: ['Thrift Store'] },
  { name: "Esther's Thrift",             address: '2905 W Capitol Ave',          city: 'West Sacramento',zip: '95691', categories: ['Thrift Store'] },
  { name: 'Eco Thrift Citrus Heights',   address: '7305 Greenback Ln',           city: 'Citrus Heights', zip: '95621', categories: ['Thrift Store'] },
  { name: 'Greenback Treasures LLC Thrift and Estate Liquidators', address: '7680 Greenback Ln', city: 'Citrus Heights', zip: '95610', categories: ['Thrift Store', 'Estate Sale Company'] },
  { name: 'Stardust Vintage Emporium',   address: '4301 Sunrise Blvd',           city: 'Fair Oaks',      zip: '95628', categories: ['Vintage'] },
  { name: 'Fair Oaks Village Decor',     address: '10224 Fair Oaks Blvd',        city: 'Fair Oaks',      zip: '95628', categories: ['Antiques'] },
  { name: "Mari's Thrift Store",         address: '6719 Winding Way',            city: 'Fair Oaks',      zip: '95628', categories: ['Thrift Store'] },
  { name: 'Family Tree Thrift Shoppe',   address: '8391 Folsom Blvd Unit K',     city: 'Sacramento',     zip: '95826', categories: ['Thrift Store'] },
  { name: 'Whatsupstairs Thrift Store & Antiques/2nd Chance', address: '7134 Auburn Blvd', city: 'Citrus Heights', zip: '95610', categories: ['Thrift Store', 'Antiques'] },
  { name: 'Bliss Marketplace',           address: '2529 Mercantile Dr Ste c',    city: 'Rancho Cordova', zip: '95742', categories: ['Vintage', 'Antiques'] },
  { name: 'Pacific Thrift Store',        address: '7424 Greenback Ln',           city: 'Citrus Heights', zip: '95610', categories: ['Thrift Store'] },
  { name: 'Impact Thrift',               address: '7525 Auburn Blvd Unit 8',     city: 'Citrus Heights', zip: '95610', categories: ['Thrift Store'] },
  { name: "Mary's Thrift Store",         address: '7963 Auburn Blvd',            city: 'Citrus Heights', zip: '95610', categories: ['Thrift Store'] },
  { name: 'Uptown Cheapskate',           address: '2030 Douglas Blvd Ste 47',    city: 'Roseville',      zip: '95661', categories: ['Consignment'] },
  { name: 'Moth Hole Consignment Boutique', address: '11787 Fair Oaks Blvd',     city: 'Fair Oaks',      zip: '95628', categories: ['Consignment'] },
  { name: 'Anything And Everything Open Boxed Goods', address: '4926 Auburn Blvd', city: 'Sacramento',   zip: '95841', categories: ['Thrift Store'] },
  { name: 'Snowline Thrift Store',       address: '616 E Bidwell St',            city: 'Folsom',         zip: '95630', categories: ['Thrift Store'] },
  { name: 'Magnolia Antiques & Home Interiors', address: '6468 Fair Oaks Blvd',  city: 'Carmichael',     zip: '95608', categories: ['Antiques'] },
  { name: 'Upscale Thrift Shop',         address: '320 E Bidwell St',            city: 'Folsom',         zip: '95630', categories: ['Thrift Store'] },
  { name: 'Upscale Thrift Shop',         address: '6634 Fair Oaks Blvd',         city: 'Carmichael',     zip: '95608', categories: ['Thrift Store'] },
  { name: 'Upscale Thrift Shop',         address: '2590 21st St',                city: 'Sacramento',     zip: '95818', categories: ['Thrift Store'] },
  { name: 'Cottage Girls',               address: '5912 Palm Dr',                city: 'Carmichael',     zip: '95608', categories: ['Vintage', 'Antiques'] },
  { name: 'Crossroads Trading Co.',      address: '2935 Arden Wy',               city: 'Sacramento',     zip: '95825', categories: ['Consignment'] },
  { name: 'Bargain World Thrift Store',  address: '4760 Florin Rd',              city: 'Sacramento',     zip: '95823', categories: ['Thrift Store'] },
  { name: "Noah's Ark Thrift & Gift",    address: '3319 Watt Ave',               city: 'Sacramento',     zip: '95821', categories: ['Thrift Store'] },
  { name: 'American Cancer Society Discovery Shop', address: '2708 Marconi Ave', city: 'Sacramento',     zip: '95821', categories: ['Thrift Store'] },
  { name: 'Placer SPCA Thrift Store',    address: '931 Washington Blvd #107',    city: 'Roseville',      zip: '95678', categories: ['Thrift Store'] },
  { name: 'The Village Boutique',        address: '10205 Fair Oaks Blvd',        city: 'Fair Oaks',      zip: '95628', categories: ['Vintage'] },
  { name: 'Once Upon A Child',           address: '7937 Greenback Ln',           city: 'Citrus Heights', zip: '95610', categories: ['Consignment'] },
  { name: "Plato's Closet",              address: '9050 Fairway Dr Ste 145',     city: 'Roseville',      zip: '95678', categories: ['Consignment'] },
  { name: 'FreeStyle Clothing Exchange', address: '1107 Roseville Square',       city: 'Roseville',      zip: '95678', categories: ['Consignment'] },
  { name: 'Assistance League of Sacramento', address: '2751 Fulton Ave',         city: 'Sacramento',     zip: '95821', categories: ['Thrift Store'] },
  { name: 'American Cancer Society Discovery Shop', address: '1813 Douglas Blvd b5', city: 'Roseville',  zip: '95661', categories: ['Thrift Store'] },
  { name: 'Help Resale',                 address: '7200 Fair Oaks Blvd #120',    city: 'Carmichael',     zip: '95608', categories: ['Thrift Store'] },
  { name: 'The Thrift Store',            address: '6606 Fruitridge Rd',          city: 'Sacramento',     zip: '95820', categories: ['Thrift Store'] },
  { name: 'ReNew Stores',                address: '1725 Santa Clara Dr',         city: 'Roseville',      zip: '95661', categories: ['Thrift Store'] },
  { name: 'Bargain World',               address: 'Plaza Ave',                   city: 'Sacramento',     zip: '95815', categories: ['Thrift Store'] },
  { name: 'Folsom Boulevard Flea Market',address: '8521 Folsom Blvd Ste G2',     city: 'Sacramento',     zip: '95826', categories: ['Antiques', 'Vintage'] },
  { name: 'America Thrift Store',        address: '4509 Franklin Blvd',          city: 'Sacramento',     zip: '95820', categories: ['Thrift Store'] },
  { name: "Lil Macy'z",                  address: '2326 Del Paso Blvd Ste C',    city: 'Sacramento',     zip: '95815', categories: ['Thrift Store'] },
  { name: 'Sutter Hospice Thrift Store', address: '212 Harding Blvd Ste Q',      city: 'Roseville',      zip: '95678', categories: ['Thrift Store'] },
  { name: 'Foothills Habitat for Humanity ReStore', address: '8292 Industrial Ave', city: 'Roseville',   zip: '95678', categories: ['Thrift Store'] },
  { name: 'Fly Brave',                   address: '5901 Broadway',               city: 'Sacramento',     zip: '95820', categories: ['Thrift Store'] },
  { name: 'Yolo County SPCA Thrift Store', address: '920 3rd St Ste F',          city: 'Davis',           zip: '95616', categories: ['Thrift Store'] },
  { name: 'Woodland Thrift Center',      address: '106 W Main St',               city: 'Woodland',       zip: '95695', categories: ['Thrift Store'] },
];

const STATE = 'CA';

function makeId(name, address, city) {
  const s = `${name}|${address}|${city}`.toLowerCase().replace(/\W+/g, '_');
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return 'curated_' + (h >>> 0).toString(16);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

let inserted = 0, approxGeocoded = 0, geocodeFail = 0;

for (const store of STORES) {
  process.stdout.write(`  ${store.name} — ${store.city}, ${STATE} ... `);

  let g = await geocode({ address: store.address, city: store.city, state: STATE, zip: store.zip });
  let locationApprox = false;
  if (!g) {
    // Census onelineaddress needs a real street number+name — falls back to a
    // city/ZIP-centroid pin (see geocode.js) for the rare listing without one
    // (e.g. "Plaza Ave" with no house number) rather than dropping the store.
    g = await geocodeApprox({ city: store.city, state: STATE, zip: store.zip });
    locationApprox = !!g;
  }

  if (!g) {
    geocodeFail++;
    console.log('no coords');
  } else if (locationApprox) {
    approxGeocoded++;
    console.log(`${g.lat.toFixed(4)}, ${g.lng.toFixed(4)} (approx)`);
  } else {
    console.log(`${g.lat.toFixed(4)}, ${g.lng.toFixed(4)}`);
  }

  await upsertSale({
    source:          'curated',
    source_url:      null,
    source_id:       makeId(store.name, store.address, store.city),
    title:           `${store.name} — ${store.city}`,
    description:     `${store.name}, located at ${store.address}, ${store.city}, CA ${store.zip}.`,
    address:         store.address,
    address_visible: true,
    location_approx: locationApprox,
    city:            store.city,
    state:           STATE,
    zip:             store.zip,
    lat:             g?.lat ?? null,
    lng:             g?.lng ?? null,
    sale_date:       null,
    start_time:      null,
    end_time:        null,
    categories:      store.categories,
    sale_type:       'thrift_store',
    status:          'active',
    expires_at:      null, // permanent — never expires
  });
  inserted++;

  await sleep(300); // be polite to the Census geocoder
}

console.log(`\nDone. ${inserted} stores upserted, ${approxGeocoded} approx-geocoded, ${geocodeFail} without coordinates.`);
process.exit(0);
