// Config for the SEO location landing pages (see LocationLanding.jsx).
// `cities` is a list of substrings matched case-insensitively against each
// listing's `city` field (same loose LIKE-style matching the backend already
// uses for the single-city filter) — `null` means "don't filter, show
// everything" (used for the northern-california page, which is meant to
// cover the whole coverage area).
export const LOCATIONS = {
  sacramento: {
    path: '/sacramento',
    shortLabel: 'Sacramento',
    metaTitle: 'Garage Sales & Estate Sales in Sacramento, CA | NorCal Thrifting',
    metaDescription: 'Browse garage sales, estate sales, and thrift stores in Sacramento, Elk Grove, Roseville, Folsom, and surrounding areas. Updated daily — find your next great deal on NorCal Thrifting.',
    h1: 'Garage Sales & Estate Sales in Sacramento',
    body: [
      "NorCal Thrifting tracks hundreds of garage sales, estate sales, and thrift stores across the greater Sacramento area — updated daily from real local listings. Whether you're hunting in Midtown, browsing Elk Grove neighborhoods, or hitting estate sales in Roseville and Folsom, we've got you covered.",
      "Sacramento has one of the most active second-hand scenes in California. Weekend garage sales pop up across Land Park, Curtis Park, Natomas, and East Sacramento, while estate sale companies regularly list in the more established neighborhoods of Carmichael, Fair Oaks, and Gold River. Our thrift store directory covers everything from Goodwill and Salvation Army locations to independently run vintage shops tucked throughout the region.",
      "Browse the map, filter by date, or search by ZIP code to find sales happening near you this weekend — no signup required, always free.",
    ],
    cities: ['sacramento', 'elk grove', 'roseville', 'folsom', 'citrus heights', 'rancho cordova', 'carmichael', 'fair oaks', 'gold river', 'natomas', 'orangevale', 'rocklin', 'davis', 'woodland', 'west sacramento'],
  },
  'northern-california': {
    path: '/northern-california',
    shortLabel: 'Northern California',
    metaTitle: 'Garage Sales & Thrift Stores in Northern California | NorCal Thrifting',
    metaDescription: 'Find garage sales, estate sales, and thrift stores across Northern California. From Sacramento to Redding, Stockton to the Sierra foothills — NorCal Thrifting has local listings updated daily.',
    h1: 'Garage Sales & Estate Sales Across Northern California',
    body: [
      "NorCal Thrifting is Northern California's go-to source for garage sales, estate sales, moving sales, and thrift stores — all in one place, always free. We aggregate listings across Sacramento, the Central Valley, the Sierra foothills, and communities throughout NorCal so you never miss a weekend sale.",
      "Whether you're a seasoned estate sale hunter, a vintage collector, a bargain shopper, or just looking to furnish your first apartment without breaking the bank, NorCal Thrifting surfaces the deals that are actually happening near you. Our listings come from real local sources — Craigslist, EstateSales.net, and our own curated directory of thrift and vintage stores — refreshed every single day.",
      "Search by city, filter by sale type, or pull up the map and see what's happening in your corner of NorCal this weekend.",
    ],
    cities: null,
  },
  'central-valley': {
    path: '/central-valley',
    shortLabel: 'Central Valley',
    metaTitle: 'Garage Sales & Estate Sales in the Central Valley | NorCal Thrifting',
    metaDescription: 'Browse garage sales, estate sales, and thrift stores in Stockton, Modesto, Fresno, and across California’s Central Valley. Free, updated daily, no signup needed.',
    h1: 'Garage Sales & Estate Sales in the Central Valley',
    body: [
      "The Central Valley is one of California's best-kept thrifting secrets. From Stockton and Modesto in the north to Fresno and Visalia in the south, weekend garage sales and estate sales draw serious bargain hunters who know that the Valley's communities turn over incredible finds — furniture, tools, vintage goods, farm equipment, and more.",
      "NorCal Thrifting aggregates garage sales, estate sales, and thrift store listings across the Central Valley daily. Our listings pull from real local sources so you're seeing actual sales happening in your area — not stale data from six months ago. Filter by city, sale type, or date to zero in on what's near you.",
      "Whether you're in Stockton, Tracy, Manteca, Turlock, Merced, or anywhere in between — there's almost always a sale worth hitting this weekend.",
    ],
    cities: ['stockton', 'modesto', 'fresno', 'visalia', 'tracy', 'manteca', 'turlock', 'merced', 'lodi', 'clovis', 'hanford', 'ceres', 'atwater'],
  },
  'bay-area': {
    path: '/bay-area',
    shortLabel: 'Bay Area',
    metaTitle: 'Garage Sales & Estate Sales in the Bay Area | NorCal Thrifting',
    metaDescription: 'Find garage sales, estate sales, and vintage thrift stores across the San Francisco Bay Area — Oakland, San Jose, Berkeley, and beyond. Updated daily on NorCal Thrifting.',
    h1: 'Garage Sales & Estate Sales in the Bay Area',
    body: [
      "Bay Area garage sales and estate sales are legendary for a reason — decades of accumulated treasures, mid-century furniture, vinyl records, vintage clothing, and tech-world castoffs make their way to driveways and estate sale tables every single weekend. NorCal Thrifting tracks it all across Oakland, Berkeley, San Jose, the Peninsula, and the East Bay.",
      "Estate sales in older Bay Area neighborhoods — Piedmont, Alameda, San Mateo, Palo Alto — regularly turn up serious finds for collectors and resellers. Meanwhile, neighborhood garage sales in the South Bay and North Bay keep the weekend thrifting scene active year-round.",
      "Search by city or ZIP, pull up the map, and find what's happening near you this weekend — free, no account required.",
    ],
    cities: ['san francisco', 'oakland', 'berkeley', 'san jose', 'fremont', 'hayward', 'richmond', 'concord', 'walnut creek', 'sunnyvale', 'santa clara', 'redwood city', 'mountain view', 'san mateo', 'palo alto', 'alameda', 'piedmont', 'vallejo', 'napa', 'santa rosa', 'daly city', 'south san francisco'],
  },
  redding: {
    path: '/redding',
    shortLabel: 'Redding',
    metaTitle: 'Garage Sales & Estate Sales in Redding & Northern California | NorCal Thrifting',
    metaDescription: 'Browse garage sales, estate sales, and thrift stores in Redding, Chico, Red Bluff, and far Northern California. Local listings updated daily on NorCal Thrifting.',
    h1: 'Garage Sales & Estate Sales in Redding & Far Northern California',
    body: [
      "Far Northern California doesn't get enough credit as a thrifting destination — but Redding, Chico, Red Bluff, and the communities scattered through Shasta and Tehama counties regularly turn up outstanding garage sales and estate sales, often with less competition than you'd find in the Bay Area or Sacramento.",
      "NorCal Thrifting covers garage sales and estate sales in Redding and the surrounding region, alongside a directory of thrift and vintage stores throughout the far north. Whether you're local or passing through on I-5, there's often something worth stopping for.",
      "Filter by city or use the map to find sales near you this weekend.",
    ],
    cities: ['redding', 'chico', 'red bluff', 'anderson', 'shasta lake', 'palo cedro', 'cottonwood'],
  },
};
