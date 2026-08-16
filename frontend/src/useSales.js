// useSales.js — shared "fetch a list of sales" hook for pages that just need
// { sales, loading, error } for a given query string (LocationLanding,
// ThriftDirectory). The homepage's own sales fetch stays bespoke — it needs
// debouncing, a slow-cold-start retry, and bundled sample-data fallback that
// don't fit this shape.
import { useState, useEffect } from 'react';
import { API_URL } from './shared.js';

export function useSales(queryString) {
  const [sales, setSales]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(false);
    fetch(`${API_URL}/sales?${queryString}`, { credentials: 'include' })
      .then(res => res.ok ? res.json() : Promise.reject(new Error(`bad status ${res.status}`)))
      .then(data => setSales(data.sales || []))
      .catch(err => {
        console.error(`[useSales] fetch failed for "${queryString}":`, err);
        setError(true);
      })
      .finally(() => setLoading(false));
  }, [queryString]);

  return { sales, loading, error };
}
