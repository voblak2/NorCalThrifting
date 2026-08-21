// TwoFactorSettings.jsx — Admin Dashboard "Security" tab: TOTP setup/disable
// for the currently signed-in admin's own account.
import { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, ShieldOff, Loader2, AlertCircle, Copy, Check } from 'lucide-react';
import { API_URL } from './shared.js';
import Field from './Field.jsx';

const ERROR_MESSAGES = {
  invalid_code:     'Incorrect code. Check your authenticator app and try again.',
  invalid_password: 'Incorrect password.',
  no_pending_setup: 'Setup expired — start again.',
};

export default function TwoFactorSettings() {
  const [status, setStatus]       = useState(null); // { enabled, backupCodesRemaining }
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Setup-in-progress state
  const [setupData, setSetupData] = useState(null); // { secret, qrCodeDataUrl }
  const [confirmCode, setConfirmCode] = useState('');
  const [backupCodes, setBackupCodes] = useState(null); // shown once, right after confirm
  const [copied, setCopied] = useState(false);

  // Disable-flow state
  const [disabling, setDisabling] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');

  const loadStatus = useCallback(() => {
    setLoading(true);
    fetch(`${API_URL}/admin/2fa/status`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setStatus(d))
      .catch(() => setError('Could not load 2FA status.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const startSetup = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/admin/2fa/setup`, { method: 'POST', credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error('Could not start setup. Try again.');
      setSetupData(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const confirmSetup = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/admin/2fa/confirm`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'include', body: JSON.stringify({ code: confirmCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(ERROR_MESSAGES[data.error] || 'Could not confirm setup. Try again.');
      setBackupCodes(data.backupCodes);
      setSetupData(null);
      setConfirmCode('');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const finishAfterBackupCodes = () => {
    setBackupCodes(null);
    loadStatus();
  };

  const submitDisable = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/admin/2fa/disable`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'include', body: JSON.stringify({ password: disablePassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(ERROR_MESSAGES[data.error] || 'Could not disable 2FA. Try again.');
      setDisabling(false);
      setDisablePassword('');
      loadStatus();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const copyBackupCodes = () => {
    navigator.clipboard?.writeText(backupCodes.join('\n')).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const errorBox = error && (
    <div style={{
      padding: '10px 14px', borderRadius: '8px', marginBottom: '12px',
      background: 'rgba(198, 107, 61, 0.1)', color: '#A8542C', fontSize: '13px',
      display: 'flex', alignItems: 'center', gap: '8px',
    }}>
      <AlertCircle size={14} style={{ flexShrink: 0 }} /> {error}
    </div>
  );

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '40px', color: '#9A8472' }}><Loader2 size={24} className="spin" /></div>;
  }

  // ── Backup codes reveal (shown exactly once, right after confirming setup) ──
  if (backupCodes) {
    return (
      <div style={{ padding: '8px 0', maxWidth: '480px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px',
          color: '#8C6B1F', fontWeight: 700, fontSize: '14px',
        }}>
          <AlertCircle size={16} /> Save these backup codes now — they won't be shown again
        </div>
        <p style={{ color: '#6B5444', fontSize: '14px', lineHeight: 1.6, margin: '0 0 16px' }}>
          Each code can be used once to sign in if you lose access to your authenticator app.
          Store them somewhere durable — a password manager or a printed copy in a safe place.
        </p>
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px',
          padding: '16px', borderRadius: '12px', background: '#FBF5EC', border: '1px solid #E8DCC8',
          fontFamily: 'monospace', fontSize: '15px', color: '#2C1F17', marginBottom: '16px',
        }}>
          {backupCodes.map(c => <div key={c}>{c}</div>)}
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={copyBackupCodes} style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '10px 16px', borderRadius: '10px', border: '1px solid #E8DCC8',
            background: '#FBF5EC', color: '#6B5444', fontSize: '13px', fontWeight: 700,
            fontFamily: 'inherit', cursor: 'pointer',
          }}>
            {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy all'}
          </button>
          <button onClick={finishAfterBackupCodes} style={{
            flex: 1, padding: '10px 16px', borderRadius: '10px', border: 'none',
            background: '#A8542C', color: '#FFFCF6', fontSize: '13px', fontWeight: 700,
            fontFamily: 'inherit', cursor: 'pointer',
          }}>
            I've saved these — done
          </button>
        </div>
      </div>
    );
  }

  // ── Setup in progress: show QR code + confirm code ──
  if (setupData) {
    return (
      <div style={{ padding: '8px 0', maxWidth: '420px' }}>
        <p style={{ color: '#6B5444', fontSize: '14px', lineHeight: 1.6, margin: '0 0 16px' }}>
          Scan this QR code with Google Authenticator, Authy, or any TOTP app, then enter the 6-digit code it shows to confirm.
        </p>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
          <img src={setupData.qrCodeDataUrl} alt="2FA setup QR code" style={{ width: '200px', height: '200px', borderRadius: '12px', border: '1px solid #E8DCC8' }} />
        </div>
        <p style={{ color: '#9A8472', fontSize: '12px', margin: '0 0 16px', textAlign: 'center' }}>
          Can't scan it? Enter this key manually: <br />
          <code style={{ fontSize: '13px', color: '#6B5444', wordBreak: 'break-all' }}>{setupData.secret}</code>
        </p>
        {errorBox}
        <Field label="6-digit code" value={confirmCode} onChange={setConfirmCode} placeholder="123456"
          onKeyDown={e => { if (e.key === 'Enter') confirmSetup(); }} />
        <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
          <button onClick={() => { setSetupData(null); setError(null); }} style={{
            padding: '10px 16px', borderRadius: '10px', border: '1px solid #E8DCC8',
            background: '#FBF5EC', color: '#6B5444', fontSize: '13px', fontWeight: 700,
            fontFamily: 'inherit', cursor: 'pointer',
          }}>
            Cancel
          </button>
          <button onClick={confirmSetup} disabled={submitting} style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            padding: '10px 16px', borderRadius: '10px', border: 'none',
            background: '#A8542C', color: '#FFFCF6', fontSize: '13px', fontWeight: 700,
            fontFamily: 'inherit', cursor: submitting ? 'wait' : 'pointer', opacity: submitting ? 0.6 : 1,
          }}>
            {submitting && <Loader2 size={14} className="spin" />} Confirm & enable
          </button>
        </div>
      </div>
    );
  }

  // ── Enabled: status + disable flow ──
  if (status?.enabled) {
    return (
      <div style={{ padding: '8px 0', maxWidth: '420px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px',
          color: '#5A6E50', fontWeight: 700, fontSize: '15px',
        }}>
          <ShieldCheck size={20} /> Two-factor authentication is enabled
        </div>
        <p style={{ color: '#6B5444', fontSize: '14px', margin: '0 0 20px' }}>
          Backup codes remaining: <strong>{status.backupCodesRemaining}</strong>
          {status.backupCodesRemaining === 0 && ' — disable and re-enable 2FA to generate a fresh set.'}
        </p>

        {!disabling ? (
          <button onClick={() => setDisabling(true)} style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '10px 16px', borderRadius: '10px', border: '1px solid rgba(140,58,42,0.3)',
            background: 'rgba(140,58,42,0.08)', color: '#8C3A2A', fontSize: '13px', fontWeight: 700,
            fontFamily: 'inherit', cursor: 'pointer',
          }}>
            <ShieldOff size={14} /> Disable 2FA
          </button>
        ) : (
          <div>
            {errorBox}
            <Field label="Confirm your password" type="password" value={disablePassword} onChange={setDisablePassword}
              placeholder="Your password" onKeyDown={e => { if (e.key === 'Enter') submitDisable(); }} />
            <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
              <button onClick={() => { setDisabling(false); setDisablePassword(''); setError(null); }} style={{
                padding: '10px 16px', borderRadius: '10px', border: '1px solid #E8DCC8',
                background: '#FBF5EC', color: '#6B5444', fontSize: '13px', fontWeight: 700,
                fontFamily: 'inherit', cursor: 'pointer',
              }}>
                Cancel
              </button>
              <button onClick={submitDisable} disabled={submitting} style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                padding: '10px 16px', borderRadius: '10px', border: 'none',
                background: '#8C3A2A', color: '#FFFCF6', fontSize: '13px', fontWeight: 700,
                fontFamily: 'inherit', cursor: submitting ? 'wait' : 'pointer', opacity: submitting ? 0.6 : 1,
              }}>
                {submitting && <Loader2 size={14} className="spin" />} Confirm disable
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Not enabled: entry point ──
  return (
    <div style={{ padding: '8px 0', maxWidth: '420px' }}>
      <p style={{ color: '#6B5444', fontSize: '15px', lineHeight: 1.6, margin: '0 0 20px' }}>
        Add an extra layer of protection to your admin account with an authenticator app
        (Google Authenticator, Authy, etc.).
      </p>
      {errorBox}
      <button onClick={startSetup} disabled={submitting} style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '14px 28px', borderRadius: '12px', border: 'none',
        background: submitting ? '#C9B89E' : '#A8542C', color: '#FFFCF6',
        fontSize: '15px', fontWeight: 700, fontFamily: 'inherit',
        cursor: submitting ? 'wait' : 'pointer',
      }}>
        {submitting ? <Loader2 size={18} className="spin" /> : <ShieldCheck size={18} />}
        {submitting ? 'Starting…' : 'Set up 2FA'}
      </button>
    </div>
  );
}
