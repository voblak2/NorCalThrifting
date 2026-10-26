import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { AuthProvider } from './AuthContext.jsx';
import Header from './Header.jsx';
import NorCalThrifting from './norcal_thrifting.jsx';

// The homepage is the most-visited route and stays in the main bundle. These
// secondary routes are lazy-loaded so a homepage visit doesn't pay for code
// it doesn't use.
const ThriftDirectory = lazy(() => import('./ThriftDirectory.jsx'));
const ListingDetail = lazy(() => import('./ListingDetail.jsx'));
const LocationLanding = lazy(() => import('./LocationLanding.jsx'));
const Contact = lazy(() => import('./Contact.jsx'));

function RouteLoadingFallback() {
  return (
    <div style={{
      minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#9A8472', background: '#FBF5EC',
    }}>
      <Loader2 size={28} className="spin" />
      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} } .spin { animation: spin 1s linear infinite }`}</style>
    </div>
  );
}

// Sends a GA4 page_view on every client-side route change (gtag is loaded in
// index.html with send_page_view off). Rendered inside <Suspense> after
// <Routes> on purpose: while a lazy route's chunk is loading, the boundary
// holds this effect back too, and once it commits, sibling effects run in
// order — so the page's own useSEO() has already set document.title by the
// time this reads it.
function RouteTracker() {
  const { pathname, search } = useLocation();
  useEffect(() => {
    window.gtag?.('event', 'page_view', {
      page_path: pathname + search,
      page_location: window.location.href,
      page_title: document.title,
    });
  }, [pathname, search]);
  return null;
}

export default function App() {
  return (
    <AuthProvider>
      <Header />
      <Suspense fallback={<RouteLoadingFallback />}>
        <Routes>
          <Route path="/" element={<NorCalThrifting />} />
          <Route path="/thrift-stores" element={<ThriftDirectory />} />
          <Route path="/listing/:id" element={<ListingDetail />} />
          <Route path="/sacramento" element={<LocationLanding region="sacramento" />} />
          <Route path="/northern-california" element={<LocationLanding region="northern-california" />} />
          <Route path="/central-valley" element={<LocationLanding region="central-valley" />} />
          <Route path="/bay-area" element={<LocationLanding region="bay-area" />} />
          <Route path="/redding" element={<LocationLanding region="redding" />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="*" element={<NorCalThrifting />} />
        </Routes>
        <RouteTracker />
      </Suspense>
    </AuthProvider>
  );
}
