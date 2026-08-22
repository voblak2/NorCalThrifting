import { createContext, useContext, useEffect, useState } from 'react';
import { API_URL } from './shared.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]         = useState(null); // null = not logged in
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState('signin'); // 'signin' | 'signup'

  // Restore session once, at the app root, so every route (not just the
  // homepage) knows the signed-in state as soon as it renders.
  useEffect(() => {
    fetch(`${API_URL}/auth/me`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.user) setUser(data.user); })
      .catch(err => console.error('[auth] failed to restore session on mount:', err));
  }, []);

  const signOut = async () => {
    await fetch(`${API_URL}/auth/signout`, { method: 'POST', credentials: 'include' });
    setUser(null);
  };

  const onAuthSuccess = (loggedInUser) => {
    setUser(loggedInUser);
    setShowAuth(false);
  };

  const value = { user, setUser, showAuth, setShowAuth, authMode, setAuthMode, signOut, onAuthSuccess };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
