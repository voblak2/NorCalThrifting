// dedupe.js — shared helpers for recognizing the same physical store across
// different data sources/shapes (an OSM node vs the same store's building
// way, OSM vs Yelp, etc.) and for judging which version of a listing has
// more useful information. Used by db.js (matching) and the scrapers that
// produce thrift-store rows (deciding what to do with a match).

export function normalizeName(name) {
  return (name || '')
    .toLowerCase()
    .replace(/\b(llc|inc|l\.l\.c\.?|the)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function normalizeAddress(address) {
  return (address || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Same-store name match: exact match always counts. A substring match only
// counts when the shorter name is long/specific enough (>=12 normalized
// characters, roughly two real words) — short generic names are common
// across unrelated NorCal shops (e.g. "The Thrift Store" normalizes to
// "thrift store", which is also a substring of "Bargain World Thrift
// Store") and treating those as the same business would silently merge two
// real, distinct stores. Same failure mode the KNOWN_CHAINS keyword list in
// db.js was built to avoid for chain-name matching; this generalizes the
// same caution to arbitrary independent-store names.
export function sameStoreName(a, b) {
  const na = normalizeName(a), nb = normalizeName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const [shorter, longer] = na.length <= nb.length ? [na, nb] : [nb, na];
  return shorter.length >= 12 && longer.includes(shorter);
}

// Rough completeness score for a listing description, used to decide which
// of two records for the same physical store to keep when sources overlap.
// Descriptions embed "Phone: ..." / "Website: ..." / "Yelp: ..." as plain
// text (see scrapers/directory.js and scrapers/yelp.js) rather than living
// in dedicated columns, so scoring works by pattern match on that text
// instead of on structured fields.
export function descriptionCompleteness(description) {
  const d = description || '';
  let score = 0;
  if (/phone:/i.test(d)) score++;
  if (/website:|yelp:/i.test(d)) score++;
  if (/hours:/i.test(d)) score++;
  if (d.length > 60) score++;
  return score;
}
