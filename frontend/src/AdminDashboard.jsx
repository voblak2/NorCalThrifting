// AdminDashboard.jsx — admin-only listings/users/scraper dashboard, split
// out of norcal_thrifting.jsx and lazy-loaded (only admins ever open it).
import { useState, useEffect, useCallback } from 'react';
import { Shield, X, List, Users, RefreshCw, Loader2, MessageSquarePlus, Check, Lock } from 'lucide-react';
import { API_URL } from './shared.js';
import ApproveSuggestionModal from './ApproveSuggestionModal.jsx';
import TwoFactorSettings from './TwoFactorSettings.jsx';

export default function AdminDashboard({ user, onClose }) {
  const [tab, setTab]               = useState('listings');
  const [stats, setStats]           = useState(null);
  const [sales, setSales]           = useState([]);
  const [users, setUsers]           = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionsFilter, setSuggestionsFilter] = useState('pending');
  const [salesFilter, setSalesFilter] = useState('all');
  const [loading, setLoading]       = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const [scraperBusy, setScraperBusy] = useState(false);
  const [scraperResult, setScraperResult] = useState(null);
  const [approvingSuggestion, setApprovingSuggestion] = useState(null);
  const [approvedNotice, setApprovedNotice] = useState(null);

  const loadStats = useCallback(() => {
    fetch(`${API_URL}/admin/stats`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setStats(d))
      .catch(() => {});
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  useEffect(() => {
    setLoading(true);
    setFetchError(null);
    if (tab === 'listings') {
      const qs = salesFilter !== 'all' ? `?status=${salesFilter}` : '';
      fetch(`${API_URL}/admin/sales${qs}`, { credentials: 'include' })
        .then(r => {
          if (!r.ok) { setFetchError(`Error ${r.status}`); return null; }
          return r.json();
        })
        .then(d => d && setSales(d.sales || []))
        .catch(err => setFetchError(err.message))
        .finally(() => setLoading(false));
    } else if (tab === 'users') {
      fetch(`${API_URL}/admin/users`, { credentials: 'include' })
        .then(r => {
          if (!r.ok) { setFetchError(`Error ${r.status}`); return null; }
          return r.json();
        })
        .then(d => d && setUsers(d.users || []))
        .catch(err => setFetchError(err.message))
        .finally(() => setLoading(false));
    } else if (tab === 'suggestions') {
      fetch(`${API_URL}/admin/suggestions?status=${suggestionsFilter}`, { credentials: 'include' })
        .then(r => {
          if (!r.ok) { setFetchError(`Error ${r.status}`); return null; }
          return r.json();
        })
        .then(d => d && setSuggestions(d.suggestions || []))
        .catch(err => setFetchError(err.message))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [tab, salesFilter, suggestionsFilter]);

  const patchSale = async (id, status) => {
    await fetch(`${API_URL}/admin/sales/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      credentials: 'include', body: JSON.stringify({ status }),
    }).catch(() => {});
    setSales(prev => prev.map(s => s.id === id ? { ...s, status } : s));
    loadStats();
  };

  const patchUser = async (id, role) => {
    await fetch(`${API_URL}/admin/users/${id}/role`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      credentials: 'include', body: JSON.stringify({ role }),
    }).catch(() => {});
    setUsers(prev => prev.map(u => u.id === id ? { ...u, role } : u));
  };

  const rejectSuggestion = async (id) => {
    await fetch(`${API_URL}/admin/suggestions/${id}/reject`, { method: 'POST', credentials: 'include' }).catch(() => {});
    setSuggestions(prev => prev.filter(s => s.id !== id));
    loadStats();
  };

  const handleApproved = () => {
    setSuggestions(prev => prev.filter(s => s.id !== approvingSuggestion.id));
    setApprovingSuggestion(null);
    setApprovedNotice(`"${approvingSuggestion.name}" was published to the directory.`);
    setTimeout(() => setApprovedNotice(null), 4000);
    loadStats();
  };

  const runScraper = async () => {
    setScraperBusy(true);
    setScraperResult(null);
    try {
      const res = await fetch(`${API_URL}/admin/refresh`, { method: 'POST', credentials: 'include' });
      const text = await res.text();
      const data = text ? JSON.parse(text) : { ok: false, error: 'Empty response' };
      setScraperResult(data);
      loadStats();
    } catch (err) {
      setScraperResult({ ok: false, error: err.message || 'Request failed' });
    }
    setScraperBusy(false);
  };

  const badge = (value) => {
    const map = {
      active:   ['#5A6E50', 'rgba(90,110,80,0.12)'],
      approved: ['#5A6E50', 'rgba(90,110,80,0.12)'],
      pending:  ['#8C6B1F', 'rgba(140,107,31,0.12)'],
      rejected: ['#8C3A2A', 'rgba(140,58,42,0.12)'],
      admin:    ['#A8542C', 'rgba(168,84,44,0.12)'],
      customer: ['#6B5444', 'rgba(107,84,68,0.1)'],
    };
    const [color, bg] = map[value] || ['#666', '#eee'];
    return (
      <span style={{ padding: '2px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 700, color, background: bg }}>
        {value}
      </span>
    );
  };

  const actionBtn = (color, label, onClick) => (
    <button onClick={onClick} style={{
      padding: '4px 10px', borderRadius: '6px', border: 'none',
      background: color + '22', color, fontSize: '12px', fontWeight: 700,
      fontFamily: 'inherit', cursor: 'pointer',
    }}>{label}</button>
  );

  const TABS = [
    { key: 'listings',    label: 'Listings', icon: <List size={14} /> },
    { key: 'users',       label: 'Users',    icon: <Users size={14} /> },
    { key: 'suggestions', label: stats?.pendingSuggestions ? `Store Suggestions (${stats.pendingSuggestions})` : 'Store Suggestions', icon: <MessageSquarePlus size={14} /> },
    { key: 'scraper',     label: 'Scraper',  icon: <RefreshCw size={14} /> },
    { key: 'security',    label: 'Security', icon: <Lock size={14} /> },
  ];

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(44, 31, 23, 0.6)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      zIndex: 300, padding: '20px', backdropFilter: 'blur(4px)', overflowY: 'auto',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#FFFCF6', borderRadius: '20px', padding: '28px',
        maxWidth: '960px', width: '100%', marginTop: '20px',
        boxShadow: '0 20px 60px rgba(44, 31, 23, 0.3)',
      }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: '26px', fontWeight: 600, margin: 0, color: '#2C1F17', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Shield size={20} color="#A8542C" /> Admin Dashboard
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9A8472' }}>
            <X size={24} />
          </button>
        </div>

        {/* Stats */}
        {stats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginBottom: '24px' }}>
            {[
              { label: 'Total sales',      value: stats.totalSales },
              { label: 'Pending review',   value: stats.pendingSales },
              { label: 'Store suggestions', value: stats.pendingSuggestions },
              { label: 'Registered users', value: stats.totalUsers },
              { label: 'Last scraper run', value: stats.lastScraperRun
                  ? new Date(stats.lastScraperRun.replace(' ', 'T')).toLocaleDateString()
                  : 'Never' },
            ].map(({ label, value }) => (
              <div key={label} style={{ background: '#FBF5EC', border: '1px solid #E8DCC8', borderRadius: '12px', padding: '14px 16px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#9A8472', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>{label}</div>
                <div style={{ fontSize: '22px', fontWeight: 700, color: '#2C1F17', fontFamily: "'Fraunces', serif" }}>{value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', marginBottom: '20px', borderBottom: '1px solid #E8DCC8' }}>
          {TABS.map(({ key, label, icon }) => (
            <button key={key} onClick={() => setTab(key)} style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '10px 20px', border: 'none', background: 'none',
              fontFamily: 'inherit', fontSize: '14px', fontWeight: 700, cursor: 'pointer',
              color: tab === key ? '#A8542C' : '#9A8472',
              borderBottom: tab === key ? '2px solid #A8542C' : '2px solid transparent',
              marginBottom: '-1px', transition: 'color 0.15s',
            }}>
              {icon} {label}
            </button>
          ))}
        </div>

        {fetchError && (
          <div style={{ padding: '14px 16px', borderRadius: '10px', marginBottom: '16px',
            background: 'rgba(140,58,42,0.08)', border: '1px solid rgba(140,58,42,0.2)', color: '#8C3A2A', fontSize: '14px' }}>
            <strong>Could not load data:</strong> {fetchError}
            {fetchError.includes('401') || fetchError.includes('403')
              ? ' — You may need to sign out and sign back in.'
              : ' — Is the backend server running?'}
          </div>
        )}
        {loading && (
          <div style={{ textAlign: 'center', padding: '40px', color: '#9A8472' }}>
            <Loader2 size={24} className="spin" />
          </div>
        )}

        {/* ── Listings tab ── */}
        {tab === 'listings' && !loading && (
          <div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              {['all', 'pending', 'active', 'rejected'].map(f => (
                <button key={f} onClick={() => setSalesFilter(f)} style={{
                  padding: '5px 14px', borderRadius: '8px', border: '1px solid #E8DCC8',
                  background: salesFilter === f ? '#A8542C' : '#FBF5EC',
                  color: salesFilter === f ? '#FFFCF6' : '#6B5444',
                  fontSize: '13px', fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
                  textTransform: 'capitalize',
                }}>{f}</button>
              ))}
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #E8DCC8', color: '#9A8472', textAlign: 'left' }}>
                    {['Title', 'Location', 'Date', 'Status', 'Source', 'Actions'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', fontWeight: 700 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sales.map(sale => (
                    <tr key={sale.id} style={{ borderBottom: '1px solid #F0E6D6' }}>
                      <td style={{ padding: '10px 12px', maxWidth: '200px' }}>
                        <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600, color: '#2C1F17' }}>
                          {sale.title}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', color: '#6B5444', whiteSpace: 'nowrap' }}>{sale.city}, {sale.state}</td>
                      <td style={{ padding: '10px 12px', color: '#6B5444', whiteSpace: 'nowrap' }}>{sale.sale_date || '—'}</td>
                      <td style={{ padding: '10px 12px' }}>{badge(sale.status)}</td>
                      <td style={{ padding: '10px 12px', color: '#9A8472' }}>{sale.source}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          {sale.status !== 'active'   && actionBtn('#5A6E50', 'Approve', () => patchSale(sale.id, 'active'))}
                          {sale.status !== 'rejected' && actionBtn('#8C3A2A', 'Reject',  () => patchSale(sale.id, 'rejected'))}
                          {sale.status === 'active'   && actionBtn('#8C6B1F', 'Pending', () => patchSale(sale.id, 'pending'))}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {sales.length === 0 && (
                    <tr><td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: '#9A8472' }}>No listings found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Users tab ── */}
        {tab === 'users' && !loading && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #E8DCC8', color: '#9A8472', textAlign: 'left' }}>
                  {['Name', 'Email', 'Role', 'Joined', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', fontWeight: 700 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} style={{ borderBottom: '1px solid #F0E6D6' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 600, color: '#2C1F17' }}>{u.name}</td>
                    <td style={{ padding: '10px 12px', color: '#6B5444' }}>{u.email}</td>
                    <td style={{ padding: '10px 12px' }}>{badge(u.role)}</td>
                    <td style={{ padding: '10px 12px', color: '#9A8472', whiteSpace: 'nowrap' }}>
                      {u.created_at ? new Date(u.created_at.replace(' ', 'T')).toLocaleDateString() : '—'}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      {u.id !== user.id && (
                        u.role === 'admin'
                          ? actionBtn('#8C3A2A', 'Remove admin', () => patchUser(u.id, 'customer'))
                          : actionBtn('#5A6E50', 'Make admin',   () => patchUser(u.id, 'admin'))
                      )}
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr><td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: '#9A8472' }}>No users yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Store Suggestions tab ── */}
        {tab === 'suggestions' && (
          <div>
            {approvedNotice && (
              <div style={{ padding: '12px 16px', borderRadius: '10px', marginBottom: '16px',
                background: 'rgba(90,110,80,0.1)', border: '1px solid rgba(90,110,80,0.25)', color: '#5A6E50',
                fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Check size={16} /> {approvedNotice}
              </div>
            )}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              {['pending', 'approved', 'rejected', 'all'].map(f => (
                <button key={f} onClick={() => setSuggestionsFilter(f)} style={{
                  padding: '5px 14px', borderRadius: '8px', border: '1px solid #E8DCC8',
                  background: suggestionsFilter === f ? '#A8542C' : '#FBF5EC',
                  color: suggestionsFilter === f ? '#FFFCF6' : '#6B5444',
                  fontSize: '13px', fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
                  textTransform: 'capitalize',
                }}>{f}</button>
              ))}
            </div>
            {!loading && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #E8DCC8', color: '#9A8472', textAlign: 'left' }}>
                      {['Store name', 'Type', 'Address', 'City', 'Submitted', 'Notes', 'Actions'].map(h => (
                        <th key={h} style={{ padding: '8px 12px', fontWeight: 700 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {suggestions.map(s => (
                      <tr key={s.id} style={{ borderBottom: '1px solid #F0E6D6' }}>
                        <td style={{ padding: '10px 12px', fontWeight: 600, color: '#2C1F17', maxWidth: '160px' }}>{s.name}</td>
                        <td style={{ padding: '10px 12px', color: '#6B5444', whiteSpace: 'nowrap' }}>{s.store_type}</td>
                        <td style={{ padding: '10px 12px', color: '#6B5444' }}>{s.address}</td>
                        <td style={{ padding: '10px 12px', color: '#6B5444', whiteSpace: 'nowrap' }}>{s.city}, {s.state}</td>
                        <td style={{ padding: '10px 12px', color: '#9A8472', whiteSpace: 'nowrap' }}>
                          {s.submitted_at ? new Date(s.submitted_at.replace(' ', 'T')).toLocaleDateString() : '—'}
                        </td>
                        <td style={{ padding: '10px 12px', color: '#6B5444', maxWidth: '220px' }}>{s.notes || '—'}</td>
                        <td style={{ padding: '10px 12px' }}>
                          {s.status === 'pending' ? (
                            <div style={{ display: 'flex', gap: '6px' }}>
                              {actionBtn('#5A6E50', 'Approve & Add', () => setApprovingSuggestion(s))}
                              {actionBtn('#8C3A2A', 'Reject', () => rejectSuggestion(s.id))}
                            </div>
                          ) : badge(s.status)}
                        </td>
                      </tr>
                    ))}
                    {suggestions.length === 0 && (
                      <tr><td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: '#9A8472' }}>No {suggestionsFilter !== 'all' ? suggestionsFilter : ''} suggestions.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {approvingSuggestion && (
          <ApproveSuggestionModal
            suggestion={approvingSuggestion}
            onClose={() => setApprovingSuggestion(null)}
            onApproved={handleApproved}
          />
        )}

        {/* ── Scraper tab ── */}
        {tab === 'scraper' && (
          <div style={{ padding: '8px 0' }}>
            <p style={{ color: '#6B5444', margin: '0 0 24px', fontSize: '15px', lineHeight: 1.6 }}>
              Manually trigger the Craigslist + EstateSales.net scrapers. This normally runs on the configured cron schedule.
            </p>
            <button onClick={runScraper} disabled={scraperBusy} style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '14px 28px', borderRadius: '12px', border: 'none',
              background: scraperBusy ? '#C9B89E' : '#A8542C', color: '#FFFCF6',
              fontSize: '16px', fontWeight: 700, fontFamily: 'inherit',
              cursor: scraperBusy ? 'wait' : 'pointer',
            }}>
              {scraperBusy ? <Loader2 size={18} className="spin" /> : <RefreshCw size={18} />}
              {scraperBusy ? 'Running scrapers…' : 'Run Scrapers Now'}
            </button>
            {scraperResult && (
              <div style={{
                marginTop: '20px', padding: '16px', borderRadius: '12px', fontSize: '13px',
                background: scraperResult.ok ? 'rgba(90,110,80,0.08)' : 'rgba(140,58,42,0.08)',
                border: `1px solid ${scraperResult.ok ? 'rgba(90,110,80,0.25)' : 'rgba(140,58,42,0.25)'}`,
                color: scraperResult.ok ? '#5A6E50' : '#8C3A2A',
              }}>
                <strong>{scraperResult.ok ? 'Scraper completed.' : 'Scraper failed.'}</strong>
                {scraperResult.ok
                  ? <pre style={{ margin: '8px 0 0', fontFamily: 'monospace', fontSize: '12px', whiteSpace: 'pre-wrap' }}>{JSON.stringify(scraperResult.result, null, 2)}</pre>
                  : <span> {scraperResult.error || scraperResult.message}</span>
                }
              </div>
            )}
            {stats?.lastScraperRun && (
              <p style={{ color: '#9A8472', fontSize: '13px', marginTop: '16px' }}>
                Last run: {new Date(stats.lastScraperRun.replace(' ', 'T')).toLocaleString()}
              </p>
            )}
          </div>
        )}

        {/* ── Security tab ── */}
        {tab === 'security' && (
          <TwoFactorSettings />
        )}

      </div>
    </div>
  );
}
