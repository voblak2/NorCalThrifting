// MapView.jsx — Leaflet map view, split out of norcal_thrifting.jsx so it
// can be lazy-loaded: react-leaflet + leaflet are the single biggest chunk
// of the frontend bundle, and most visits never open the map.
import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { MapPin } from 'lucide-react';
import { formatDate, formatTime, buildMapUrl } from './shared.js';

const SACRAMENTO = [38.5816, -121.4944];

function makePin(fill) {
  return L.divIcon({
    html: `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="36" viewBox="0 0 26 36">
      <path d="M13 0C5.82 0 0 5.82 0 13c0 9.1 13 23 13 23S26 22.1 26 13C26 5.82 20.18 0 13 0z" fill="${fill}" stroke="rgba(0,0,0,0.25)" stroke-width="1"/>
      <circle cx="13" cy="13" r="5.5" fill="rgba(255,255,255,0.9)"/>
    </svg>`,
    iconSize: [26, 36],
    iconAnchor: [13, 36],
    popupAnchor: [0, -38],
    className: '',
  });
}

// Orange-brown for sales, teal-green for thrift stores
const saleIcon    = makePin('#A8542C');
const thriftIcon  = makePin('#3A8A6E');

function FitBounds({ markers }) {
  const map = useMap();
  const key = JSON.stringify(markers);
  useEffect(() => {
    if (markers.length > 0) {
      map.fitBounds(markers, { padding: [40, 40], maxZoom: 13 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return null;
}

export default function MapView({ sales }) {
  const geocoded = sales.filter(s => s.lat != null && s.lng != null);
  const markerPositions = geocoded.map(s => [s.lat, s.lng]);
  const unmapped = sales.length - geocoded.length;
  const thriftCount = geocoded.filter(s => s.sale_type === 'thrift_store').length;
  const saleCount   = geocoded.length - thriftCount;

  return (
    <div style={{ position: 'relative', zIndex: 1, maxWidth: '1100px', margin: '0 auto', padding: '0 24px' }}>
      {/* Legend */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '8px', justifyContent: 'flex-end' }}>
        {saleCount > 0 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: '#6B5444', fontWeight: 600 }}>
            <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: '#A8542C' }} /> Sales
          </span>
        )}
        {thriftCount > 0 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: '#6B5444', fontWeight: 600 }}>
            <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: '#3A8A6E' }} /> Thrift Stores
          </span>
        )}
      </div>

      <div style={{ borderRadius: '18px', overflow: 'hidden', border: '1px solid #E8DCC8', boxShadow: '0 2px 12px rgba(61,46,38,0.05)' }}>
        <MapContainer
          center={SACRAMENTO}
          zoom={10}
          style={{ height: 'clamp(400px, 60vh, 640px)', width: '100%' }}
          scrollWheelZoom
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />
          {markerPositions.length > 0 && <FitBounds markers={markerPositions} />}
          {geocoded.map(sale => {
            const isThrift = sale.sale_type === 'thrift_store';
            return (
              <Marker key={sale.id} position={[sale.lat, sale.lng]} icon={isThrift ? thriftIcon : saleIcon}>
                <Popup maxWidth={260}>
                  <div style={{ fontFamily: "'Nunito', system-ui, sans-serif", padding: '2px 0' }}>
                    <p style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: '15px', margin: '0 0 6px', color: '#2C1F17', lineHeight: 1.2 }}>
                      {sale.title}
                    </p>
                    {isThrift ? (
                      <p style={{ margin: '0 0 8px', fontSize: '13px', color: '#6B5444' }}>
                        {sale.address}<br />{sale.city}, {sale.state} {sale.zip}
                      </p>
                    ) : (
                      <>
                        <p style={{ margin: '0 0 4px', fontSize: '13px', color: '#6B5444' }}>
                          {sale.city}, {sale.state} · {formatDate(sale.sale_date)}
                        </p>
                        {(sale.start_time || sale.end_time) && (
                          <p style={{ margin: '0 0 4px', fontSize: '12px', color: '#9A8472' }}>
                            {[formatTime(sale.start_time), formatTime(sale.end_time)].filter(Boolean).join(' – ')}
                          </p>
                        )}
                        {sale.location_approx && (
                          <p style={{ margin: '0 0 8px', fontSize: '11px', color: '#9A8472', fontStyle: 'italic' }}>
                            Pin is approximate — exact address not listed
                          </p>
                        )}
                      </>
                    )}
                    <a
                      href={buildMapUrl(sale)}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: '5px',
                        padding: '6px 12px', borderRadius: '8px',
                        background: isThrift ? '#3A8A6E' : '#A8542C', color: '#FFFCF6',
                        textDecoration: 'none', fontSize: '12px', fontWeight: 700,
                      }}
                    >
                      <MapPin size={12} /> Open in Maps
                    </a>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </div>
      {unmapped > 0 && (
        <p style={{ margin: '10px 0 0', fontSize: '13px', color: '#9A8472', textAlign: 'right' }}>
          {unmapped} {unmapped === 1 ? 'listing' : 'listings'} not shown — no coordinates available
        </p>
      )}
    </div>
  );
}
