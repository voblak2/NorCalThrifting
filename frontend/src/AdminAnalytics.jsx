// AdminAnalytics.jsx — the admin dashboard's Analytics tab. Lazy-loaded from
// AdminDashboard.jsx so recharts is only downloaded when an admin opens it.
// Every number here comes from our own DB via GET /api/admin/analytics,
// except the response-time ping, which times a live /api/health call.
import { useState, useEffect, useCallback } from 'react';
import { Loader2, RefreshCw, AlertTriangle } from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Cell,
} from 'recharts';
import { API_URL } from './shared.js';

const C = {
  ink:     '#2C1F17',
  body:    '#6B5444',
  muted:   '#9A8472',
  rule:    '#E8DCC8',
  faint:   '#F0E6D6',
  cream:   '#FBF5EC',
  card:    '#FFFCF6',
  accent:  '#A8542C',
  good:    '#5A6E50',
  warn:    '#8C6B1F',
  bad:     '#8C3A2A',
};
// Categorical series colors — terracotta first, then the dashboard's existing
// sage/mustard/brown status hues and lighter tints of each.
const SERIES = ['#A8542C', '#5A6E50', '#C9952E', '#6B5444', '#D98B5F', '#8FA382', '#8C3A2A', '#B8A48C'];

const SOURCE_LABELS = {
  craigslist:    'Craigslist',
  estatesales:   'EstateSales',
  osm_directory: 'OSM',
  curated:       'Curated',
  submission:    'Submitted',
  suggested:     'Suggested store',
  directory:     'Chain seed list',
  seed:          'Seed',
};
const TYPE_LABELS = {
  garage_sale:  'Garage sale',
  estate_sale:  'Estate sale',
  thrift_store: 'Thrift store',
};
const TABLE_LABELS = {
  sales: 'Listings', users: 'Users', favorites: 'Favorites',
  store_suggestions: 'Store suggestions', contact_messages: 'Contact messages',
  scraper_runs: 'Scraper runs',
};
const humanize = s => String(s || 'unknown').replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());

const fmtNum = n => Number(n ?? 0).toLocaleString();
// DB timestamps are UTC without a zone marker ("2026-10-26 14:00:00").
const parseDbTime = s => (s ? new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z') : null);
function timeAgo(s) {
  const d = parseDbTime(s);
  if (!d) return 'never';
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}
const shortDate = iso => new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
function fmtUptime(sec) {
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  if (sec < 86400) return `${(sec / 3600).toFixed(1)}h`;
  return `${(sec / 86400).toFixed(1)}d`;
}

// ── Building blocks ─────────────────────────────────────────────────────────

function Panel({ title, subtitle, children, wide }) {
  return (
    <section style={{
      background: C.card, border: `1px solid ${C.rule}`, borderRadius: '14px',
      padding: '18px 20px', gridColumn: wide ? '1 / -1' : undefined, minWidth: 0,
    }}>
      <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: '18px', fontWeight: 600, color: C.ink, margin: 0 }}>{title}</h3>
      {subtitle && <p style={{ margin: '2px 0 0', fontSize: '12px', color: C.muted }}>{subtitle}</p>}
      <div style={{ marginTop: '14px' }}>{children}</div>
    </section>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={{ background: C.cream, border: `1px solid ${C.rule}`, borderRadius: '10px', padding: '10px 12px', minWidth: 0 }}>
      <div style={{ fontSize: '11px', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: '22px', fontWeight: 700, color: color || C.ink, fontFamily: "'Fraunces', serif", fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  );
}

function StatRow({ children }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '10px', marginBottom: '14px' }}>{children}</div>;
}

const SubHead = ({ children }) => (
  <div style={{ fontSize: '11px', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '14px 0 8px' }}>{children}</div>
);

// Labeled horizontal bars in plain HTML — for ranked category lists these
// read better than a chart (labels never truncate, values sit on the bar).
function BarList({ rows, colorFor }) {
  const max = Math.max(1, ...rows.map(r => r.value));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
      {rows.map((r, i) => (
        <div key={r.label + i} style={{ display: 'grid', gridTemplateColumns: 'minmax(90px, 38%) 1fr auto', alignItems: 'center', gap: '10px', fontSize: '13px' }}>
          <span style={{ color: C.body, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.label}>{r.label}</span>
          <div style={{ background: C.faint, borderRadius: '4px', height: '10px' }}>
            <div style={{ width: `${(r.value / max) * 100}%`, minWidth: r.value ? '3px' : 0, height: '100%', borderRadius: '4px', background: colorFor ? colorFor(r, i) : C.accent }} />
          </div>
          <span style={{ color: C.ink, fontWeight: 700, fontVariantNumeric: 'tabular-nums', minWidth: '36px', textAlign: 'right' }}>{fmtNum(r.value)}</span>
        </div>
      ))}
      {rows.length === 0 && <Empty />}
    </div>
  );
}

const Empty = ({ children = 'No data yet.' }) => (
  <div style={{ color: C.muted, fontSize: '13px', padding: '8px 0' }}>{children}</div>
);

const chartTooltip = {
  contentStyle: { background: C.card, border: `1px solid ${C.rule}`, borderRadius: '8px', fontSize: '12px', color: C.ink },
  labelStyle: { color: C.muted, fontWeight: 700 },
  cursor: { fill: 'rgba(168,84,44,0.06)', stroke: C.rule },
};
const axisProps = { tick: { fontSize: 11, fill: C.muted }, tickLine: false, axisLine: { stroke: C.rule } };

function WeeklyBars({ data, name }) {
  return (
    <ResponsiveContainer width="100%" height={170}>
      <BarChart data={data} margin={{ top: 6, right: 4, left: -24, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={C.faint} />
        <XAxis dataKey="week" tickFormatter={shortDate} {...axisProps} interval={1} />
        <YAxis allowDecimals={false} {...axisProps} axisLine={false} />
        <Tooltip {...chartTooltip} labelFormatter={w => `Week of ${shortDate(w)}`} formatter={v => [v, name]} />
        <Bar dataKey="n" fill={C.accent} radius={[4, 4, 0, 0]} maxBarSize={36} />
      </BarChart>
    </ResponsiveContainer>
  );
}

const tableHead = { padding: '6px 8px', fontWeight: 700, color: C.muted, textAlign: 'left', borderBottom: `2px solid ${C.rule}`, whiteSpace: 'nowrap' };
const tableCell = { padding: '7px 8px', borderBottom: `1px solid ${C.faint}`, color: C.body };

function StatusDot({ tone }) {
  const color = { good: C.good, warn: C.warn, bad: C.bad }[tone] || C.muted;
  return <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: color, flexShrink: 0 }} />;
}

// ── Panels ──────────────────────────────────────────────────────────────────

function ListingsPanel({ listings }) {
  const added30 = listings.perDay.reduce((s, d) => s + d.n, 0);
  return (
    <Panel title="Listings overview" subtitle="All rows in the listings table, any status" wide>
      <StatRow>
        <Stat label="Total listings" value={fmtNum(listings.total)} />
        <Stat label="Added, last 30 days" value={fmtNum(added30)} />
        {listings.byType.map(t => (
          <Stat key={t.sale_type} label={TYPE_LABELS[t.sale_type] || humanize(t.sale_type)} value={fmtNum(t.n)} />
        ))}
      </StatRow>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))', gap: '20px' }}>
        <div style={{ minWidth: 0 }}>
          <SubHead>Added per day, last 30 days</SubHead>
          <ResponsiveContainer width="100%" height={190}>
            <LineChart data={listings.perDay} margin={{ top: 6, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={C.faint} />
              <XAxis dataKey="day" tickFormatter={shortDate} {...axisProps} minTickGap={24} />
              <YAxis allowDecimals={false} {...axisProps} axisLine={false} />
              <Tooltip {...chartTooltip} labelFormatter={shortDate} formatter={v => [fmtNum(v), 'Listings added']} />
              <Line type="monotone" dataKey="n" stroke={C.accent} strokeWidth={2} dot={false} activeDot={{ r: 4, fill: C.accent }} />
            </LineChart>
          </ResponsiveContainer>
          <p style={{ margin: '6px 0 0', fontSize: '11px', color: C.muted, lineHeight: 1.5 }}>
            Counts listings still in the database by the day they were first scraped or submitted — expired sales are deleted nightly, so older days read low.
          </p>
        </div>
        <div style={{ minWidth: 0 }}>
          <SubHead>By source</SubHead>
          <BarList
            rows={listings.bySource.map(s => ({ label: SOURCE_LABELS[s.source] || humanize(s.source), value: s.n }))}
            colorFor={(_, i) => SERIES[i % SERIES.length]}
          />
        </div>
      </div>
    </Panel>
  );
}

function GeographyPanel({ geography }) {
  return (
    <Panel title="Geography" subtitle="Top 10 cities, case-insensitive">
      <BarList rows={geography.topCities.map(c => ({ label: `${c.city}, ${c.state}`, value: c.n }))} />
      <SubHead>By state</SubHead>
      <BarList
        rows={geography.byState.map(s => ({ label: s.state || '—', value: s.n }))}
        colorFor={() => C.good}
      />
    </Panel>
  );
}

function UsersPanel({ users }) {
  const signInRows = [
    { label: 'Email + password', value: users.emailOnly },
    { label: 'Google only', value: users.googleOnly },
    { label: 'Both (linked)', value: users.linked },
  ];
  const last8 = users.signupsPerWeek.reduce((s, w) => s + w.n, 0);
  return (
    <Panel title="User activity">
      <StatRow>
        <Stat label="Registered users" value={fmtNum(users.total)} />
        <Stat label="New, last 8 weeks" value={fmtNum(last8)} />
      </StatRow>
      <SubHead>New signups per week</SubHead>
      <WeeklyBars data={users.signupsPerWeek} name="Signups" />
      <SubHead>Sign-in method</SubHead>
      <BarList rows={signInRows} colorFor={(_, i) => SERIES[i]} />
    </Panel>
  );
}

function EngagementPanel({ engagement }) {
  const contact8 = engagement.contactPerWeek.reduce((s, w) => s + w.n, 0);
  return (
    <Panel title="Engagement" subtitle="Favorites from signed-in users only — guest favorites stay in the browser">
      <StatRow>
        <Stat label="Favorites saved" value={fmtNum(engagement.favoritesTotal)} />
        <Stat label="Contact msgs, 8 wks" value={fmtNum(contact8)} />
      </StatRow>
      <SubHead>Most favorited listings</SubHead>
      {engagement.topFavorites.length === 0 ? <Empty>No favorites yet.</Empty> : (
        <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {engagement.topFavorites.map((f, i) => (
            <li key={f.id} style={{ display: 'grid', gridTemplateColumns: '20px 1fr auto', gap: '8px', fontSize: '13px', alignItems: 'baseline' }}>
              <span style={{ color: C.muted, fontVariantNumeric: 'tabular-nums' }}>{i + 1}.</span>
              <a href={`/listing/${f.id}`} target="_blank" rel="noopener noreferrer" style={{ color: C.ink, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'none' }} title={f.title}>
                {f.title}
              </a>
              <span style={{ color: C.accent, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>♥ {f.n}</span>
            </li>
          ))}
        </ol>
      )}
      <SubHead>Contact form submissions per week</SubHead>
      <WeeklyBars data={engagement.contactPerWeek} name="Messages" />
    </Panel>
  );
}

function SuggestionsPanel({ suggestions }) {
  const { counts, recent } = suggestions;
  const tone = { pending: C.warn, approved: C.good, rejected: C.bad };
  return (
    <Panel title="Store suggestions">
      <StatRow>
        <Stat label="Pending" value={fmtNum(counts.pending)} color={counts.pending ? C.warn : undefined} />
        <Stat label="Approved" value={fmtNum(counts.approved)} />
        <Stat label="Rejected" value={fmtNum(counts.rejected)} />
      </StatRow>
      <SubHead>Recent submissions</SubHead>
      {recent.length === 0 ? <Empty>No suggestions yet.</Empty> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead><tr>{['Store', 'City', 'Submitted', 'Status'].map(h => <th key={h} style={tableHead}>{h}</th>)}</tr></thead>
            <tbody>
              {recent.map(s => (
                <tr key={s.id}>
                  <td style={{ ...tableCell, color: C.ink, fontWeight: 600 }}>{s.name}</td>
                  <td style={{ ...tableCell, whiteSpace: 'nowrap' }}>{s.city}, {s.state}</td>
                  <td style={{ ...tableCell, whiteSpace: 'nowrap', color: C.muted }}>{timeAgo(s.submitted_at)}</td>
                  <td style={{ ...tableCell, color: tone[s.status] || C.muted, fontWeight: 700, textTransform: 'capitalize' }}>{s.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function ScraperPanel({ scrapers }) {
  const staleAfterH = { daily: 26, weekly: 8 * 24 };
  return (
    <Panel title="Scraper health" subtitle="Daily scrapers run at 7:00 AM Pacific; OSM refreshes weekly" wide>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr>{['Scraper', 'Last successful run', 'Last run result', 'Added last run', 'Processed', 'Errors'].map(h => <th key={h} style={tableHead}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {scrapers.list.map(s => {
              const run = s.lastRun;
              const success = s.lastSuccess || s.lastListingAt;
              const ageH = success ? (Date.now() - parseDbTime(success).getTime()) / 3600_000 : Infinity;
              const tone = run && !run.ok ? 'bad' : ageH > staleAfterH[s.cadence] ? 'warn' : 'good';
              return (
                <tr key={s.key}>
                  <td style={{ ...tableCell, color: C.ink, fontWeight: 700 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}><StatusDot tone={tone} /> {s.label}</span>
                  </td>
                  <td style={{ ...tableCell, whiteSpace: 'nowrap' }} title={success ? parseDbTime(success).toLocaleString() : ''}>
                    {timeAgo(success)}
                    {!s.lastSuccess && s.lastListingAt && <span style={{ color: C.muted, fontSize: '11px' }}> (newest listing)</span>}
                  </td>
                  <td style={tableCell}>
                    {!run ? <span style={{ color: C.muted }}>No runs logged yet</span>
                      : run.ok ? <span style={{ color: C.good, fontWeight: 600 }}>Completed {timeAgo(run.finished_at)}</span>
                      : <span style={{ color: C.bad, fontWeight: 600 }} title={run.error_message || ''}>Failed {timeAgo(run.finished_at)}</span>}
                  </td>
                  <td style={{ ...tableCell, fontVariantNumeric: 'tabular-nums' }}>{run ? fmtNum(run.added) : '—'}</td>
                  <td style={{ ...tableCell, fontVariantNumeric: 'tabular-nums' }}>{run ? fmtNum(run.processed) : '—'}</td>
                  <td style={{ ...tableCell, fontVariantNumeric: 'tabular-nums', color: run?.errors ? C.bad : C.body }}>{run ? fmtNum(run.errors) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <SubHead>Recent errors</SubHead>
      {scrapers.recentFailures.length === 0 ? <Empty>No errors logged.</Empty> : (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px' }}>
          {scrapers.recentFailures.map(r => (
            <li key={r.id} style={{ display: 'flex', gap: '8px', alignItems: 'baseline', color: C.body }}>
              <AlertTriangle size={12} color={r.ok ? C.warn : C.bad} style={{ flexShrink: 0, alignSelf: 'center' }} />
              <span style={{ color: C.muted, whiteSpace: 'nowrap' }}>{parseDbTime(r.finished_at).toLocaleString()}</span>
              <strong style={{ color: C.ink }}>{r.scraper}</strong>
              <span>{r.ok ? `${r.errors} item error${r.errors === 1 ? '' : 's'} (run completed)` : r.error_message || 'Run failed'}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function HealthPanel({ health }) {
  const [ping, setPing] = useState(null);
  const [pinging, setPinging] = useState(false);

  const runPing = useCallback(async () => {
    setPinging(true);
    const start = performance.now();
    try {
      const res = await fetch(`${API_URL}/health`, { cache: 'no-store' });
      const ms = Math.round(performance.now() - start);
      const body = await res.json().catch(() => null);
      setPing({ ok: res.ok && body?.ok, ms, at: new Date() });
    } catch (err) {
      setPing({ ok: false, ms: null, error: err.message, at: new Date() });
    }
    setPinging(false);
  }, []);

  useEffect(() => { runPing(); }, [runPing]);

  const pingColor = !ping ? C.muted : !ping.ok ? C.bad : ping.ms > 1500 ? C.warn : C.good;
  return (
    <Panel title="Site health" subtitle="Live ping of the Render backend's /api/health">
      <StatRow>
        <Stat label="API response" value={pinging && !ping ? '…' : !ping ? '—' : ping.ok ? `${ping.ms} ms` : 'Down'} color={pingColor} />
        <Stat label="Process uptime" value={fmtUptime(health.processUptimeSec)} />
      </StatRow>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px', color: C.muted, marginBottom: '6px' }}>
        <button onClick={runPing} disabled={pinging} style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '5px 12px', borderRadius: '8px',
          border: `1px solid ${C.rule}`, background: C.cream, color: C.body, fontSize: '12px', fontWeight: 700,
          fontFamily: 'inherit', cursor: pinging ? 'wait' : 'pointer',
        }}>
          {pinging ? <Loader2 size={12} className="spin" /> : <RefreshCw size={12} />} Ping again
        </button>
        {ping && <span>{ping.ok ? 'Healthy' : `Failed${ping.error ? ` — ${ping.error}` : ''}`} · checked {ping.at.toLocaleTimeString()}</span>}
      </div>
      <p style={{ margin: '0 0 4px', fontSize: '11px', color: C.muted, lineHeight: 1.5 }}>
        Uptime is time since the server process last started (Render restarts it on deploy and after idle sleep). Historical uptime lives in UptimeRobot.
      </p>
      <SubHead>Database rows</SubHead>
      <BarList
        rows={health.tableCounts.map(t => ({ label: TABLE_LABELS[t.tbl] || t.tbl, value: t.n }))}
        colorFor={() => C.body}
      />
    </Panel>
  );
}

// ── Tab ─────────────────────────────────────────────────────────────────────

export default function AdminAnalytics() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch(`${API_URL}/admin/analytics`, { credentials: 'include' })
      .then(r => {
        if (!r.ok) throw new Error(`Error ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading && !data) {
    return <div style={{ textAlign: 'center', padding: '40px', color: C.muted }}><Loader2 size={24} className="spin" /></div>;
  }
  if (error && !data) {
    return (
      <div style={{ padding: '14px 16px', borderRadius: '10px', background: 'rgba(140,58,42,0.08)', border: '1px solid rgba(140,58,42,0.2)', color: C.bad, fontSize: '14px' }}>
        <strong>Could not load analytics:</strong> {error}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', fontSize: '12px', color: C.muted, gap: '10px', flexWrap: 'wrap' }}>
        <span>As of {new Date(data.generatedAt).toLocaleString()} · times shown in your local timezone, weeks are rolling 7-day windows</span>
        <button onClick={load} disabled={loading} style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '5px 12px', borderRadius: '8px',
          border: `1px solid ${C.rule}`, background: C.cream, color: C.body, fontSize: '12px', fontWeight: 700,
          fontFamily: 'inherit', cursor: loading ? 'wait' : 'pointer',
        }}>
          {loading ? <Loader2 size={12} className="spin" /> : <RefreshCw size={12} />} Refresh
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(380px, 100%), 1fr))', gap: '16px' }}>
        <ListingsPanel listings={data.listings} />
        <GeographyPanel geography={data.geography} />
        <UsersPanel users={data.users} />
        <EngagementPanel engagement={data.engagement} />
        <SuggestionsPanel suggestions={data.suggestions} />
        <ScraperPanel scrapers={data.scrapers} />
        <HealthPanel health={data.health} />
      </div>
    </div>
  );
}
