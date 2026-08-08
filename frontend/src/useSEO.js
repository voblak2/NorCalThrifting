import { useEffect } from 'react';

const SITE_NAME = 'NorCal Thrifting';
const SITE_URL  = 'https://www.norcalthrifting.com';

function upsertMeta(attr, key, content) {
  if (!content) return;
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertLink(rel, href) {
  let el = document.head.querySelector(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

/**
 * Sets the document title, meta description, Open Graph / Twitter tags,
 * canonical URL, and an optional JSON-LD block for the current route.
 * Restores the site-wide defaults on unmount so navigating away (e.g. closing
 * a listing page) doesn't leave stale per-listing tags behind.
 */
const DEFAULT_TITLE = `${SITE_NAME} — Garage Sales, Estate Sales & Thrift Stores in Northern California`;

/**
 * `title` should be the complete <title> text the caller wants (this hook
 * does not append a site-name suffix, so callers compose it themselves,
 * e.g. `${sale.title} — ${city}, ${date} | ${SITE_NAME}`).
 */
export function useSEO({ title, description, path = '/', image, robots, jsonLd }) {
  useEffect(() => {
    const fullTitle = title || DEFAULT_TITLE;
    const desc = description || 'Your NorCal guide to garage sales, estate sales, thrift stores, and curbside treasures.';
    const url = `${SITE_URL}${path}`;

    document.title = fullTitle;
    upsertMeta('name', 'description', desc);
    upsertMeta('name', 'robots', robots || 'index, follow');
    upsertMeta('property', 'og:title', fullTitle);
    upsertMeta('property', 'og:description', desc);
    upsertMeta('property', 'og:type', image ? 'article' : 'website');
    upsertMeta('property', 'og:url', url);
    upsertMeta('property', 'og:site_name', SITE_NAME);
    if (image) upsertMeta('property', 'og:image', image);
    upsertMeta('name', 'twitter:card', image ? 'summary_large_image' : 'summary');
    upsertMeta('name', 'twitter:title', fullTitle);
    upsertMeta('name', 'twitter:description', desc);
    if (image) upsertMeta('name', 'twitter:image', image);
    upsertLink('canonical', url);

    let script = null;
    if (jsonLd) {
      script = document.getElementById('seo-json-ld');
      if (!script) {
        script = document.createElement('script');
        script.type = 'application/ld+json';
        script.id = 'seo-json-ld';
        document.head.appendChild(script);
      }
      script.textContent = JSON.stringify(jsonLd);
    }

    return () => {
      const existing = document.getElementById('seo-json-ld');
      if (existing) existing.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, description, path, image, robots, JSON.stringify(jsonLd)]);
}

export { SITE_NAME, SITE_URL };
