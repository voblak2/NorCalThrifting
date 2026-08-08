import { Routes, Route } from 'react-router-dom';
import NorCalThrifting from './norcal_thrifting.jsx';
import ThriftDirectory from './ThriftDirectory.jsx';
import ListingDetail from './ListingDetail.jsx';
import LocationLanding from './LocationLanding.jsx';

export default function App() {
  return (
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
  );
}
