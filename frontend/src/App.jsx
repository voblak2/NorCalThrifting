import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import NorCalThrifting from './norcal_thrifting.jsx';

// The homepage is the most-visited route and stays in the main bundle. These
// secondary routes are lazy-loaded so a homepage visit doesn't pay for code
// it doesn't use.
const ThriftDirectory = lazy(() => import('./ThriftDirectory.jsx'));
const ListingDetail = lazy(() => import('./ListingDetail.jsx'));
const LocationLanding = lazy(() => import('./LocationLanding.jsx'));

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

export default function App() {
  return (
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
        <Route path="*" element={<NorCalThrifting />} />
      </Routes>
    </Suspense>
  );
}
