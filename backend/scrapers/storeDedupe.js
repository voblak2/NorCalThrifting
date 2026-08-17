// scrapers/storeDedupe.js — shared "is this store already known, and if so
// what do we do about it" decision used by every scraper that can produce a
// thrift-store row (currently just OSM directory, via its node+way merge —
// written generically so a future second source can plug into the same
// logic without rework), so a store discovered more than once ends up as a
// single pin carrying the more complete data, not several duplicate pins.

import { upsertSale, findDuplicateThriftStore, enrichThriftStoreDescription } from '../db.js';
import { descriptionCompleteness } from '../dedupe.js';

// `candidate` is a full upsertSale() payload (source/source_id/title/lat/
// lng/description/categories/...). Returns one of:
//   'inserted'       — new row, or a normal same-source overwrite
//   'enriched'       — an existing row from a DIFFERENT source was updated
//                       in place with candidate's richer description/tags
//   'skip_unchanged' — matched the row's own (source, source_id); candidate
//                       isn't richer, so nothing was written
//   'skip_duplicate' — matched a different source's row that's already at
//                       least as complete; nothing was written
export async function upsertThriftStore(candidate) {
  const name = candidate.title.split(' — ')[0];
  const existing = await findDuplicateThriftStore(candidate.lat, candidate.lng, name);

  if (!existing) {
    await upsertSale(candidate);
    return 'inserted';
  }

  const sameRow = existing.source === candidate.source && existing.source_id === candidate.source_id;
  const candidateScore = descriptionCompleteness(candidate.description);
  const existingScore = descriptionCompleteness(existing.description);

  // Deliberately compares against whatever is CURRENTLY stored, not against
  // "what this same source produced last time" — so a plainer re-scrape
  // from the store's original source can never clobber a richer description
  // that got merged in later from a different source. Trade-off: a same-
  // source re-scrape that changes lat/lng or renames the store without
  // ALSO improving completeness (rare — most tag/location edits come with
  // more, not less, data) won't propagate until it does. Acceptable for a
  // directory of permanent physical locations that rarely move.
  if (candidateScore <= existingScore) {
    return sameRow ? 'skip_unchanged' : 'skip_duplicate';
  }

  if (sameRow) {
    await upsertSale(candidate); // candidate is strictly richer — normal overwrite
    return 'inserted';
  }

  // A different source found a richer version of a store another source
  // already pinned. Merge into the existing row instead of creating a
  // second pin for the same physical store — never touches
  // source/source_id/lat/lng, so the row's original "owner" and mapped
  // position are undisturbed, only its descriptive content improves.
  const mergedCategories = Array.from(new Set([...(existing.categories || []), ...(candidate.categories || [])]));
  await enrichThriftStoreDescription(existing.id, { description: candidate.description, categories: mergedCategories });
  return 'enriched';
}
