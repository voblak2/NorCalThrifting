// AuthModal.jsx — sign in / create account modal, split out of norcal_thrifting.jsx.
import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Loader2 } from 'lucide-react';
import { API_URL } from './shared.js';
import Field from './Field.jsx';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

export default function AuthModal({ mode, onSwitchMode, onSuccess, onClose }) {
  const [name, setName]         = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]       = useState(null);
  const googleButtonRef = useRef(null);

  // Set only for a 2FA-enabled admin, once the password step succeeds — its
  // presence is what switches the form into the "enter your code" step below.
  const [tempToken, setTempToken] = useState(null);
  const [code, setCode]           = useState('');

  const isSignUp = mode === 'signup';

  const ERROR_MESSAGES = {
    missing_fields:     'Please fill in all fields.',
    invalid_email:      'Enter a valid email address.',
    password_too_short: 'Password must be at least 8 characters.',
    email_taken:        'That email is already registered. Sign in instead?',
    invalid_credentials:'Incorrect email or password.',
    invalid_name:       'Name must be between 1 and 80 characters.',
    invalid_or_expired_token: 'That took too long — please sign in again.',
    invalid_code:       'Incorrect code. Check your authenticator app and try again.',
    too_many_attempts:  'Too many attempts. Please wait a few minutes and try again.',
    google_account_no_password: 'This account uses Google Sign-In. Continue with Google below instead.',
    invalid_google_token: 'Google Sign-In failed. Please try again.',
    google_email_not_verified: "Your Google account's email isn't verified. Please verify it with Google first.",
    use_admin_signin:   'This email is an admin account — please sign in with your password instead.',
    google_signin_not_configured: 'Google Sign-In isn\'t available right now. Please use email and password.',
  };

  const submit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const body = isSignUp ? { name, email, password } : { email, password };
      const res = await fetch(`${API_URL}/auth/${isSignUp ? 'signup' : 'signin'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(ERROR_MESSAGES[data.error] || 'Something went wrong. Try again.');
      if (data.requires2fa) {
        setTempToken(data.tempToken);
        return;
      }
      onSuccess(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const submitCode = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/auth/verify-2fa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tempToken, code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(ERROR_MESSAGES[data.error] || 'Something went wrong. Try again.');
      onSuccess(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleKey = (e) => { if (e.key === 'Enter') (tempToken ? submitCode() : submit()); };

  // Google hands the ID token to this callback directly (popup flow, no page
  // navigation) — the modal stays open over whatever page it was opened on,
  // so "return to wherever they were" is automatic once onSuccess closes it.
  const handleGoogleCredential = useCallback(async (response) => {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ idToken: response.credential }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(ERROR_MESSAGES[data.error] || 'Something went wrong. Try again.');
      onSuccess(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onSuccess]);

  // Renders Google's own branded button (never a custom one — required by
  // Google's terms) into googleButtonRef. Skipped entirely during the 2FA
  // code step, and if VITE_GOOGLE_CLIENT_ID isn't set, so local dev without
  // it configured still shows a normal, working modal.
  useEffect(() => {
    if (tempToken || !GOOGLE_CLIENT_ID) return;
    let cancelled = false;
    let attempts = 0;
    const tryRender = () => {
      if (cancelled) return;
      if (window.google?.accounts?.id && googleButtonRef.current) {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: handleGoogleCredential,
          ux_mode: 'popup',
        });
        googleButtonRef.current.innerHTML = ''; // clear before re-render (e.g. signin <-> signup)
        window.google.accounts.id.renderButton(googleButtonRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          width: 344,
          shape: 'rectangular',
          logo_alignment: 'left',
          text: isSignUp ? 'signup_with' : 'signin_with',
        });
      } else if (attempts < 50) {
        // The GSI script loads async — poll briefly (~5s) in case this modal
        // opens before it's ready, rather than never showing the button.
        attempts++;
        setTimeout(tryRender, 100);
      }
    };
    tryRender();
    return () => { cancelled = true; };
  }, [isSignUp, tempToken, handleGoogleCredential]);

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(44, 31, 23, 0.5)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 100, padding: "20px", backdropFilter: "blur(4px)",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "#FFFCF6", borderRadius: "20px", padding: "28px",
        maxWidth: "400px", width: "100%",
        boxShadow: "0 20px 60px rgba(44, 31, 23, 0.3)",
      }}>
        {/* Tabs (hidden mid-2FA — that's a single linear step, not a sign in/up choice) */}
        {tempToken ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px", borderBottom: "1px solid #E8DCC8", paddingBottom: "12px" }}>
            <span style={{ fontSize: "15px", fontWeight: 700, color: "#2C1F17" }}>Two-factor authentication</span>
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#9A8472", padding: "8px" }}>
              <X size={20} />
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", marginBottom: "24px", borderBottom: "1px solid #E8DCC8" }}>
            {['signin', 'signup'].map(m => (
              <button key={m} onClick={() => { onSwitchMode(m); setError(null); }} style={{
                flex: 1, padding: "10px", border: "none", background: "none",
                fontFamily: "inherit", fontSize: "15px", fontWeight: 700, cursor: "pointer",
                color: mode === m ? "#A8542C" : "#9A8472",
                borderBottom: mode === m ? "2px solid #A8542C" : "2px solid transparent",
                marginBottom: "-1px", transition: "all 0.15s",
              }}>
                {m === 'signin' ? 'Sign in' : 'Create account'}
              </button>
            ))}
            <button onClick={onClose} style={{
              background: "none", border: "none", cursor: "pointer", color: "#9A8472", padding: "8px",
            }}>
              <X size={20} />
            </button>
          </div>
        )}

        {tempToken ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <p style={{ margin: 0, fontSize: "14px", color: "#6B5444", lineHeight: 1.5 }}>
              Enter the 6-digit code from your authenticator app, or one of your backup codes.
            </p>
            <Field label="Code" value={code} onChange={setCode} placeholder="123456 or XXXX-XXXX" onKeyDown={handleKey} />

            {error && (
              <div style={{
                padding: "10px 14px", borderRadius: "8px",
                background: "rgba(198, 107, 61, 0.1)", color: "#A8542C", fontSize: "13px",
              }}>
                {error}
              </div>
            )}

            <button onClick={submitCode} disabled={submitting} style={{
              marginTop: "4px", padding: "14px", borderRadius: "12px",
              background: "#A8542C", color: "#FFFCF6", border: "none",
              fontSize: "16px", fontWeight: 700, fontFamily: "inherit",
              cursor: submitting ? "wait" : "pointer", opacity: submitting ? 0.6 : 1,
              display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
            }}>
              {submitting && <Loader2 size={16} className="spin" />}
              {submitting ? 'Verifying…' : 'Verify'}
            </button>

            <button onClick={() => { setTempToken(null); setCode(''); setError(null); }} style={{
              background: "none", border: "none", color: "#9A8472", fontWeight: 600,
              cursor: "pointer", fontSize: "13px", fontFamily: "inherit", padding: 0, textAlign: "center",
            }}>
              Back to sign in
            </button>
          </div>
        ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {GOOGLE_CLIENT_ID && (
            <>
              <div ref={googleButtonRef} style={{ display: "flex", justifyContent: "center", minHeight: "40px" }} />
              <div style={{ display: "flex", alignItems: "center", gap: "10px", margin: "2px 0" }}>
                <div style={{ flex: 1, height: "1px", background: "#E8DCC8" }} />
                <span style={{ fontSize: "12px", color: "#9A8472", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>or</span>
                <div style={{ flex: 1, height: "1px", background: "#E8DCC8" }} />
              </div>
            </>
          )}
          {isSignUp && (
            <Field label="Your name" value={name} onChange={setName} placeholder="First Last" onKeyDown={handleKey} />
          )}
          <Field label="Email" type="email" value={email} onChange={setEmail} placeholder="you@example.com" onKeyDown={handleKey} />
          <Field label="Password" type="password" value={password} onChange={setPassword}
            placeholder={isSignUp ? "At least 8 characters" : "Your password"} onKeyDown={handleKey} />

          {error && (
            <div style={{
              padding: "10px 14px", borderRadius: "8px",
              background: "rgba(198, 107, 61, 0.1)", color: "#A8542C", fontSize: "13px",
            }}>
              {error}
            </div>
          )}

          <button onClick={submit} disabled={submitting} style={{
            marginTop: "4px", padding: "14px", borderRadius: "12px",
            background: "#A8542C", color: "#FFFCF6", border: "none",
            fontSize: "16px", fontWeight: 700, fontFamily: "inherit",
            cursor: submitting ? "wait" : "pointer", opacity: submitting ? 0.6 : 1,
            display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
          }}>
            {submitting && <Loader2 size={16} className="spin" />}
            {submitting ? (isSignUp ? 'Creating account…' : 'Signing in…') : (isSignUp ? 'Create account' : 'Sign in')}
          </button>

          <p style={{ textAlign: "center", fontSize: "13px", color: "#9A8472", margin: 0 }}>
            {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
            <button onClick={() => { onSwitchMode(isSignUp ? 'signin' : 'signup'); setError(null); }} style={{
              background: "none", border: "none", color: "#A8542C", fontWeight: 700,
              cursor: "pointer", fontSize: "13px", fontFamily: "inherit", padding: 0,
            }}>
              {isSignUp ? 'Sign in' : 'Sign up'}
            </button>
          </p>
        </div>
        )}
      </div>
    </div>
  );
}
