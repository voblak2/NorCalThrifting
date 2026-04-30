// seed.js — Populate the DB with sample listings so the app has
// something to show before the first real scraper run completes.
//
// Run: npm run seed

import 'dotenv/config';
import { upsertSale, countSales } from './db.js';

const SAMPLES = [
  { title: "Three-Family Block Sale", address: "1247 Maple Grove Lane",
    city: "Sacramento", state: "CA", zip: "95825",
    sale_date: "2026-05-02", start_time: "08:00", end_time: "14:00",
    description: "Three families combining for one massive sale! Vintage vinyl records (jazz, soul, classic rock), a mid-century walnut credenza, KitchenAid mixer, kids' clothes sizes 4-12, hand tools, and an upright piano (free to good home — you haul).",
    categories: ["Furniture", "Vintage", "Kids", "Music"] },
  { title: "Downsizing After 40 Years", address: "892 Hawthorne Road",
    city: "Rancho Cordova", state: "CA", zip: "95670",
    sale_date: "2026-05-03", start_time: "07:00", end_time: "13:00",
    description: "Moving to a condo, everything must go. Antique sewing machine, hand-stitched quilts, cast iron cookware, gardening equipment, holiday decorations, and a workbench full of woodworking tools.",
    categories: ["Antiques", "Tools", "Home Goods"] },
  { title: "Estate Sale — Mid-Century Collector", address: "55 Larkspur Drive",
    city: "Portland", state: "OR", zip: "97214",
    sale_date: "2026-05-02", start_time: "09:00", end_time: "16:00",
    description: "Estate of a longtime architect. Eames-era furniture, Heath ceramics, original artwork, drafting tables, slide rules, an extensive jazz collection, and a 1968 Mercedes (sold separately, inquire inside).",
    categories: ["Estate Sale", "Vintage", "Art", "Furniture"] },
  { title: "Neighborhood-Wide Garage Sale", address: "Riverbend Subdivision (start at Clubhouse)",
    city: "Austin", state: "TX", zip: "78745",
    sale_date: "2026-05-09", start_time: "07:30", end_time: "15:00",
    description: "Over 40 homes participating! Maps available at the clubhouse. Expect everything: baby gear, electronics, sporting goods, books, furniture, plants, and a community bake sale fundraiser.",
    categories: ["Multi-Family", "Community", "Everything"] },
  { title: "Books, Books, and More Books", address: "412 Elm Street",
    city: "Madison", state: "WI", zip: "53703",
    sale_date: "2026-05-04", start_time: "10:00", end_time: "17:00",
    description: "Retired English professor liquidating personal library. Over 3,000 books — literary fiction, poetry, philosophy, history, and rare first editions. All paperbacks $1, hardcovers $3, rare books priced individually.",
    categories: ["Books", "Collectibles"] },
  { title: "Moving Sale — Everything Must Go", address: "1820 Cherry Blossom Way",
    city: "Seattle", state: "WA", zip: "98103",
    sale_date: "2026-05-10", start_time: "09:00", end_time: "15:00",
    description: "Relocating overseas. Modern furniture (couch, bed, dining set), full kitchen, two bicycles, camping gear, plants. Make reasonable offers.",
    categories: ["Furniture", "Outdoor", "Home Goods"] },
  { title: "Kid Stuff Mega-Sale", address: "67 Sycamore Court",
    city: "Denver", state: "CO", zip: "80206",
    sale_date: "2026-05-03", start_time: "08:00", end_time: "12:00",
    description: "Twins outgrew everything! Strollers, car seats, high chairs, toys for ages 0-5, clothes (NB to 4T), books, and a like-new wooden play kitchen.",
    categories: ["Kids", "Baby Gear"] },
];

let n = 0;
for (const s of SAMPLES) {
  upsertSale({
    ...s,
    source: 'seed',
    source_id: 'seed_' + s.title.toLowerCase().replace(/\W+/g, '_').slice(0, 40),
    address_visible: true,
    expires_at: '2026-12-31',
  });
  n++;
}
console.log(`Seeded ${n} sample sales. DB now has ${countSales()} total.`);
