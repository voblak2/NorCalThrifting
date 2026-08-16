// utils.js — small helpers with no other natural home, used across the
// scrapers and geocoder (previously each redefined sleep() independently).
export const sleep = ms => new Promise(r => setTimeout(r, ms));
