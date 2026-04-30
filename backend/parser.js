// parser.js — Extract structured data from free-text listings.
//
// Garage sale posts are notoriously inconsistent. This parser does a
// best-effort job at pulling out date, time range, ZIP, and categories
// using regex. It will not catch every variant, but it handles the
// common cases. Anything it can't extract is left null so the UI can
// display "Contact for details" rather than guessing wrong.

const MONTH_NAMES = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
  apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
  aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10,
  nov: 11, november: 11, dec: 12, december: 12,
};

const DAY_NAMES = {
  sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2,
  wed: 3, weds: 3, wednesday: 3, thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5, sat: 6, saturday: 6,
};

const CATEGORY_KEYWORDS = {
  Furniture:    /\b(furniture|sofa|couch|chair|table|dresser|bed|cabinet|desk)\b/i,
  Vintage:      /\b(vintage|antique|retro|mid[- ]century|mcm|estate)\b/i,
  Tools:        /\b(tool|tools|drill|saw|hammer|workshop|dewalt|milwaukee|makita|craftsman)\b/i,
  Kids:         /\b(kid|kids|child|children|baby|toddler|stroller|crib|toys?)\b/i,
  Clothing:     /\b(clothes|clothing|shirts?|pants|dresses|jacket|shoes|apparel)\b/i,
  Books:        /\b(books?|novels?|library|paperback|hardcover)\b/i,
  Music:        /\b(records?|vinyl|lp|cd|stereo|turntable|guitar|piano|instrument)\b/i,
  Electronics:  /\b(electronics?|tv|computer|laptop|stereo|camera|phone)\b/i,
  Outdoor:      /\b(camping|tent|kayak|canoe|bike|bicycle|outdoor|hiking|skis?|snowboard)\b/i,
  Sports:       /\b(sports?|golf|baseball|football|exercise|treadmill|weights?)\b/i,
  Plants:       /\b(plants?|garden|gardening|pots|seedlings)\b/i,
  Art:          /\b(art|paintings?|prints?|sculpture|frames?)\b/i,
  Crafts:       /\b(craft|crafts|sewing|fabric|yarn|knitting|quilting)\b/i,
  Holiday:      /\b(christmas|halloween|easter|thanksgiving|holiday)\b/i,
  Jewelry:      /\b(jewelry|necklace|bracelet|earrings|rings)\b/i,
  Toys:         /\b(toys|games|legos?|puzzles?)\b/i,
  Collectibles: /\b(collectibles?|coins?|stamps?|memorabilia)\b/i,
  'Estate Sale': /\b(estate sale|estate)\b/i,
  'Multi-Family':/\b(multi[- ]family|neighborhood|community sale|block sale|street sale)\b/i,
};

/**
 * Parse a free-text post into structured fields.
 * @param {string} text  the post body (and optionally title)
 * @param {object} [hint] optional hints (e.g., posted date for relative parsing)
 * @returns {{
 *   sale_date: string | null,    // YYYY-MM-DD
 *   start_time: string | null,   // HH:MM
 *   end_time: string | null,     // HH:MM
 *   zip: string | null,
 *   categories: string[],
 * }}
 */
export function parsePost(text, hint = {}) {
  const lower = (text || '').toLowerCase();
  const postedDate = hint.postedDate ? new Date(hint.postedDate) : new Date();

  return {
    sale_date:  extractDate(lower, postedDate),
    start_time: extractTimes(lower).start,
    end_time:   extractTimes(lower).end,
    zip:        extractZip(text || ''),
    categories: extractCategories(text || ''),
  };
}

// ---------- Date extraction ----------

function extractDate(text, postedDate) {
  // 1) Numeric date: 5/4 or 5/4/26 or 05/04/2026
  let m = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (m) {
    const month = parseInt(m[1]);
    const day   = parseInt(m[2]);
    let year    = m[3] ? parseInt(m[3]) : postedDate.getFullYear();
    if (year < 100) year += 2000;
    if (isValidDate(year, month, day)) return iso(year, month, day);
  }

  // 2) Month name + day: "May 4" or "May 4th, 2026"
  m = text.match(/\b(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/i);
  if (m) {
    const month = MONTH_NAMES[m[1].toLowerCase()];
    const day   = parseInt(m[2]);
    let year    = m[3] ? parseInt(m[3]) : postedDate.getFullYear();
    // If the date already passed this year, assume next year
    const candidate = new Date(year, month - 1, day);
    if (candidate < startOfDay(postedDate) && !m[3]) year += 1;
    if (isValidDate(year, month, day)) return iso(year, month, day);
  }

  // 3) Day-of-week reference: "this saturday", "next sat", "saturday"
  m = text.match(/\b(this|next|coming)?\s*(sun|sunday|mon|monday|tue|tues|tuesday|wed|weds|wednesday|thu|thur|thurs|thursday|fri|friday|sat|saturday)\b/i);
  if (m) {
    const targetDow = DAY_NAMES[m[2].toLowerCase()];
    const next = nextDayOfWeek(postedDate, targetDow, m[1] === 'next');
    return iso(next.getFullYear(), next.getMonth() + 1, next.getDate());
  }

  // 4) "this weekend" / "weekend" — assume upcoming Saturday
  if (/\bweekend\b/.test(text)) {
    const sat = nextDayOfWeek(postedDate, 6, false);
    return iso(sat.getFullYear(), sat.getMonth() + 1, sat.getDate());
  }

  return null;
}

// ---------- Time extraction ----------

function extractTimes(text) {
  // Match patterns like "8am-2pm", "8:00 AM - 2:00 PM", "8 to 2", "8-2"
  // Accept several separators: -, –, to
  const re = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:-|–|to)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i;
  const m = text.match(re);
  if (!m) return { start: null, end: null };

  let h1 = parseInt(m[1]);
  let m1 = m[2] ? parseInt(m[2]) : 0;
  let p1 = m[3] ? m[3].toLowerCase() : null;
  let h2 = parseInt(m[4]);
  let m2 = m[5] ? parseInt(m[5]) : 0;
  let p2 = m[6] ? m[6].toLowerCase() : null;

  // If only the end has am/pm, infer start. If neither, assume morning start, afternoon end.
  if (!p1 && !p2) {
    p1 = h1 < 7 ? 'pm' : 'am';
    p2 = h2 <= h1 ? 'pm' : (h2 < 7 ? 'pm' : 'am');
  } else if (!p1) {
    p1 = (h1 > h2) ? (p2 === 'pm' ? 'am' : 'am') : p2;
  } else if (!p2) {
    p2 = p1;
  }

  h1 = to24(h1, p1);
  h2 = to24(h2, p2);

  // Sanity: if end <= start, bump end to PM
  if (h2 <= h1) h2 = (h2 + 12) % 24;

  return { start: pad(h1) + ':' + pad(m1), end: pad(h2) + ':' + pad(m2) };
}

function to24(h, period) {
  if (period === 'am') return h === 12 ? 0 : h;
  if (period === 'pm') return h === 12 ? 12 : h + 12;
  return h;
}

// ---------- ZIP extraction ----------

function extractZip(text) {
  const m = text.match(/\b(\d{5})(?:-\d{4})?\b/);
  return m ? m[1] : null;
}

// ---------- Categories ----------

function extractCategories(text) {
  const found = [];
  for (const [name, regex] of Object.entries(CATEGORY_KEYWORDS)) {
    if (regex.test(text)) found.push(name);
  }
  return found.slice(0, 6); // cap so cards don't get cluttered
}

// ---------- Helpers ----------

function isValidDate(y, m, d) {
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

function iso(y, m, d) {
  return `${y}-${pad(m)}-${pad(d)}`;
}

function pad(n) { return n.toString().padStart(2, '0'); }

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function nextDayOfWeek(from, targetDow, forceNextWeek) {
  const d = startOfDay(from);
  const currentDow = d.getDay();
  let diff = (targetDow - currentDow + 7) % 7;
  if (diff === 0 || forceNextWeek) diff = forceNextWeek ? diff + 7 : 0;
  d.setDate(d.getDate() + (diff || 0));
  return d;
}
