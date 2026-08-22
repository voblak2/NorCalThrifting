import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  MapPin, ChevronDown, ShoppingBag, Mail, User, LogOut,
  Menu, X, Shield, LayoutDashboard, Loader2,
} from 'lucide-react';
import { initials } from './shared.js';
import { LOCATIONS } from './locations.js';
import { useAuth } from './AuthContext.jsx';
import AuthModal from './AuthModal.jsx';

const AdminDashboard = lazy(() => import('./AdminDashboard.jsx'));

export default function Header() {
  const { user, showAuth, setShowAuth, authMode, setAuthMode, signOut, onAuthSuccess } = useAuth();

  const [showRegionMenu, setShowRegionMenu] = useState(false);
  const regionMenuRef = useRef(null);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);

  useEffect(() => {
    if (!showRegionMenu) return;
    const onClick = (e) => {
      if (regionMenuRef.current && !regionMenuRef.current.contains(e.target)) setShowRegionMenu(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [showRegionMenu]);

  return (
    <>
      {/* ─── Admin Banner ────────────────────────────────────────────────── */}
      {user?.role === 'admin' && (
        <div style={{
          position: "sticky", top: 0, zIndex: 200,
          background: "#A8542C", color: "#FFFCF6",
          padding: "10px 24px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
        }}>
          <span style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", fontWeight: 700 }}>
            <Shield size={16} />
            Admin — {user.name}
          </span>
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={() => setShowAdmin(true)} style={{
              display: "flex", alignItems: "center", gap: "6px",
              background: "rgba(255,252,246,0.15)", border: "1px solid rgba(255,252,246,0.3)",
              color: "#FFFCF6", borderRadius: "8px", padding: "5px 12px",
              fontSize: "13px", fontWeight: 600, fontFamily: "inherit", cursor: "pointer",
            }}>
              <LayoutDashboard size={14} /> Dashboard
            </button>
            <button onClick={signOut} style={{
              display: "flex", alignItems: "center", gap: "6px",
              background: "rgba(255,252,246,0.15)", border: "1px solid rgba(255,252,246,0.3)",
              color: "#FFFCF6", borderRadius: "8px", padding: "5px 12px",
              fontSize: "13px", fontWeight: 600, fontFamily: "inherit", cursor: "pointer",
            }}>
              <LogOut size={14} /> Sign out
            </button>
          </div>
        </div>
      )}

      <header style={{
        position: "relative", zIndex: 100, padding: "16px 24px",
        maxWidth: "1100px", margin: "0 auto",
      }}>
        {/* ─── Desktop row: logo left, nav right (hidden below 720px) ──────── */}
        <div className="desktop-site-nav" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
          <Link to="/" aria-label="NorCal Thrifting — home" style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
            <img
              src="/logo-header.png"
              alt="NorCal Thrifting — Garage Sales, Estate Sales & Thrift Stores in Northern California"
              className="site-logo"
            />
          </Link>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div ref={regionMenuRef} style={{ position: "relative" }}>
              <button
                onClick={() => setShowRegionMenu(v => !v)}
                style={{
                  display: "flex", alignItems: "center", gap: "6px",
                  border: "1px solid #E8DCC8", borderRadius: "8px",
                  padding: "7px 14px", fontSize: "14px", fontWeight: 600,
                  color: "#A8542C", fontFamily: "inherit", cursor: "pointer",
                  background: showRegionMenu ? "#FBF5EC" : "none",
                }}
              >
                <MapPin size={15} /> Browse by Region
                <ChevronDown size={14} style={{ transform: showRegionMenu ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
              </button>
              {showRegionMenu && (
                <div style={{
                  position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 50,
                  background: "#FFFCF6", border: "1px solid #E8DCC8", borderRadius: "12px",
                  boxShadow: "0 8px 24px rgba(61, 46, 38, 0.12)", padding: "6px", minWidth: "200px",
                }}>
                  {Object.entries(LOCATIONS).map(([key, loc]) => (
                    <Link
                      key={key}
                      to={loc.path}
                      onClick={() => setShowRegionMenu(false)}
                      style={{
                        display: "flex", alignItems: "center", gap: "8px",
                        padding: "9px 12px", borderRadius: "8px",
                        color: "#3D2E26", fontSize: "14px", fontWeight: 600, textDecoration: "none",
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = "#F5EDDF"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    >
                      <MapPin size={14} color="#A8542C" /> {loc.shortLabel}
                    </Link>
                  ))}
                </div>
              )}
            </div>
            <Link
              to="/thrift-stores"
              style={{
                display: "flex", alignItems: "center", gap: "6px",
                border: "1px solid #E8DCC8", borderRadius: "8px",
                padding: "7px 14px", fontSize: "14px", fontWeight: 600,
                color: "#3A8A6E", fontFamily: "inherit", textDecoration: "none",
              }}
            >
              <ShoppingBag size={15} /> Thrift Store Directory
            </Link>
            <a
              href="mailto:hello@norcalthrifting.com"
              style={{
                display: "flex", alignItems: "center", gap: "6px",
                border: "1px solid #E8DCC8", borderRadius: "8px",
                padding: "7px 14px", fontSize: "14px", fontWeight: 600,
                color: "#6B5444", fontFamily: "inherit", textDecoration: "none",
              }}
            >
              <Mail size={15} /> Contact Us
            </a>
            {user && user.role !== 'admin' ? (
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div style={{
                  width: "32px", height: "32px", borderRadius: "50%",
                  background: "#A8542C", color: "#FFFCF6",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "13px", fontWeight: 700,
                }}>
                  {initials(user.name)}
                </div>
                <span style={{ fontSize: "14px", color: "#6B5444" }}>Hi, {user.name.split(' ')[0]}</span>
                <button onClick={signOut} style={{
                  display: "flex", alignItems: "center", gap: "5px",
                  background: "none", border: "1px solid #E8DCC8", borderRadius: "8px",
                  padding: "5px 10px", fontSize: "13px", color: "#9A8472",
                  fontFamily: "inherit", cursor: "pointer",
                }}>
                  <LogOut size={13} /> Sign out
                </button>
              </div>
            ) : !user ? (
              <button
                onClick={() => { setAuthMode('signin'); setShowAuth(true); }}
                style={{
                  display: "flex", alignItems: "center", gap: "6px",
                  background: "none", border: "1px solid #E8DCC8", borderRadius: "8px",
                  padding: "7px 14px", fontSize: "14px", fontWeight: 600,
                  color: "#A8542C", fontFamily: "inherit", cursor: "pointer",
                }}
              >
                <User size={15} /> Sign in
              </button>
            ) : null}
          </div>
        </div>

        {/* ─── Mobile row: logo left, hamburger right (hidden at 720px+) ───── */}
        <div className="mobile-site-nav">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <Link to="/" aria-label="NorCal Thrifting — home" style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
              <img
                src="/logo-header.png"
                alt="NorCal Thrifting — Garage Sales, Estate Sales & Thrift Stores in Northern California"
                className="site-logo site-logo-mobile"
              />
            </Link>
            <button
              onClick={() => setShowMobileMenu(v => !v)}
              aria-label={showMobileMenu ? "Close menu" : "Open menu"}
              style={{
                display: "flex", alignItems: "center", gap: "6px",
                border: "1px solid #E8DCC8", borderRadius: "8px",
                padding: "9px 14px", fontSize: "14px", fontWeight: 600,
                color: "#A8542C", fontFamily: "inherit", cursor: "pointer",
                background: showMobileMenu ? "#FBF5EC" : "none", flexShrink: 0,
              }}
            >
              {showMobileMenu ? <X size={18} /> : <Menu size={18} />} Menu
            </button>
          </div>

          {showMobileMenu && (
            <div style={{
              marginTop: "10px", background: "#FFFCF6", border: "1px solid #E8DCC8",
              borderRadius: "14px", padding: "8px", boxShadow: "0 4px 16px rgba(61, 46, 38, 0.06)",
            }}>
              <p style={{ fontSize: "12px", fontWeight: 700, color: "#9A8472", textTransform: "uppercase",
                letterSpacing: "0.04em", margin: "8px 12px 4px" }}>
                Browse by Region
              </p>
              {Object.entries(LOCATIONS).map(([key, loc]) => (
                <Link
                  key={key}
                  to={loc.path}
                  onClick={() => setShowMobileMenu(false)}
                  style={{
                    display: "flex", alignItems: "center", gap: "8px",
                    padding: "11px 12px", borderRadius: "8px",
                    color: "#3D2E26", fontSize: "15px", fontWeight: 600, textDecoration: "none",
                  }}
                >
                  <MapPin size={15} color="#A8542C" /> {loc.shortLabel}
                </Link>
              ))}

              <div style={{ borderTop: "1px dashed #E8DCC8", margin: "8px 4px" }} />

              <Link
                to="/thrift-stores"
                onClick={() => setShowMobileMenu(false)}
                style={{
                  display: "flex", alignItems: "center", gap: "8px",
                  padding: "11px 12px", borderRadius: "8px",
                  color: "#3A8A6E", fontSize: "15px", fontWeight: 600, textDecoration: "none",
                }}
              >
                <ShoppingBag size={15} /> Thrift Store Directory
              </Link>
              <a
                href="mailto:hello@norcalthrifting.com"
                style={{
                  display: "flex", alignItems: "center", gap: "8px",
                  padding: "11px 12px", borderRadius: "8px",
                  color: "#6B5444", fontSize: "15px", fontWeight: 600, textDecoration: "none",
                }}
              >
                <Mail size={15} /> Contact Us
              </a>

              <div style={{ borderTop: "1px dashed #E8DCC8", margin: "8px 4px" }} />

              {user && user.role !== 'admin' ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 12px" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "15px", color: "#3D2E26", fontWeight: 600 }}>
                    <div style={{
                      width: "26px", height: "26px", borderRadius: "50%",
                      background: "#A8542C", color: "#FFFCF6",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "12px", fontWeight: 700, flexShrink: 0,
                    }}>
                      {initials(user.name)}
                    </div>
                    Hi, {user.name.split(' ')[0]}
                  </span>
                  <button onClick={() => { signOut(); setShowMobileMenu(false); }} style={{
                    display: "flex", alignItems: "center", gap: "5px",
                    background: "none", border: "1px solid #E8DCC8", borderRadius: "8px",
                    padding: "6px 10px", fontSize: "13px", color: "#9A8472",
                    fontFamily: "inherit", cursor: "pointer",
                  }}>
                    <LogOut size={13} /> Sign out
                  </button>
                </div>
              ) : !user ? (
                <button
                  onClick={() => { setAuthMode('signin'); setShowAuth(true); setShowMobileMenu(false); }}
                  style={{
                    display: "flex", alignItems: "center", gap: "8px",
                    background: "none", border: "none", width: "100%", textAlign: "left",
                    padding: "11px 12px", borderRadius: "8px",
                    color: "#A8542C", fontSize: "15px", fontWeight: 600,
                    fontFamily: "inherit", cursor: "pointer",
                  }}
                >
                  <User size={15} /> Sign in
                </button>
              ) : null}
            </div>
          )}
        </div>
      </header>

      {showAdmin && (
        <Suspense fallback={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: '#9A8472' }}>
            <Loader2 size={28} className="spin" />
          </div>
        }>
          <AdminDashboard user={user} onClose={() => setShowAdmin(false)} />
        </Suspense>
      )}

      {showAuth && (
        <AuthModal
          mode={authMode}
          onSwitchMode={setAuthMode}
          onSuccess={onAuthSuccess}
          onClose={() => setShowAuth(false)}
        />
      )}

      <style>{`
        .site-logo { height: 44px; width: auto; display: block; }
        .mobile-site-nav { display: none; }
        @media (max-width: 720px) {
          .desktop-site-nav { display: none !important; }
          .mobile-site-nav { display: block !important; }
          .site-logo-mobile { height: 34px; }
        }
      `}</style>
    </>
  );
}
