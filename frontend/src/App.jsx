import { Routes, Route } from 'react-router-dom';
import NorCalThrifting from './norcal_thrifting.jsx';
import ThriftDirectory from './ThriftDirectory.jsx';
import ListingDetail from './ListingDetail.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<NorCalThrifting />} />
      <Route path="/thrift-stores" element={<ThriftDirectory />} />
      <Route path="/listing/:id" element={<ListingDetail />} />
      <Route path="*" element={<NorCalThrifting />} />
    </Routes>
  );
}
