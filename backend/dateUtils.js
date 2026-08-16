// dateUtils.js — date-math helper shared by server.js (submission expiry)
// and estatesales.js (sale expiry), previously defined identically in both.
export function addDays(isoDate, n) {
  const d = new Date(isoDate + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
