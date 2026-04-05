/**
 * Account claiming flow — three steps:
 * 1. /claim           Enter email → check if claimable
 * 2. /claim           Link sent confirmation
 * 3. /claim/:token    Set password and activate
 */
import { useState }       from 'react';
import { useParams,
         useNavigate }     from 'react-router-dom';
import { toast }          from '../components/ui/Toast.jsx';

// ── Step 1 + 2: Email entry and confirmation ──────────────────────────────────
export function ClaimStart() {
  const [email,    setEmail]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [sent,     setSent]     = useState(false);
  const [error,    setError]    = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // First check if claimable
      const check = await fetch('/api/claim/check', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email }),
      }).then(r => r.json());

      if (check.alreadyActive) {
        setError('This account is already active — sign in normally or reset your password.');
        return;
      }

      if (!check.claimable) {
        setError('No professor account found for this email address. Contact your Accessibility Centre.');
        return;
      }

      // Send the claim link
      await fetch('/api/claim/send', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email }),
      });

      setSent(true);
    } catch (err) {
      setError('Something went wrong — try again');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm bg-white rounded-xl shadow-sm
                      border border-gray-200 p-8">

        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">Clearpath</h1>
          <p className="text-sm text-gray-500 mt-1">Professor portal</p>
        </div>

        {sent ? (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
              <p className="text-sm font-medium text-green-800">Check your email</p>
              <p className="text-sm text-green-700 mt-1">
                We've sent an activation link to <strong>{email}</strong>.
                It expires in 24 hours.
              </p>
            </div>
            <p className="text-xs text-gray-400 text-center">
              Didn't receive it?{' '}
              <button
                onClick={() => setSent(false)}
                className="text-brand-600 hover:text-brand-800"
              >
                Try again
              </button>
            </p>

            {/* Dev mode — show the link would appear in terminal */}
            {import.meta.env.DEV && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-xs text-amber-700 font-medium">
                  Dev mode — check the API terminal for the claim link
                </p>
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Your institutional email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@dal.ca"
                required
                disabled={loading}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                           focus:outline-none focus:ring-2 focus:ring-brand-600
                           disabled:opacity-60"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 bg-brand-600 hover:bg-brand-800 text-white
                         text-sm font-medium rounded-lg transition-colors
                         disabled:opacity-50"
            >
              {loading ? 'Checking…' : 'Send activation link'}
            </button>

            <p className="text-center text-xs text-gray-400">
              Already have a password?{' '}
              <a href="/login" className="text-brand-600 hover:text-brand-800">
                Sign in
              </a>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

// ── Step 3: Set password via token ────────────────────────────────────────────
export function ClaimSetPassword() {
  const { token }            = useParams();
  const navigate             = useNavigate();
  const [name,     setName]  = useState('');
  const [email,    setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');
  const [tokenError, setTokenError] = useState('');

  // Validate token on mount
  useState(() => {
    fetch(`/api/claim/${token}`)
      .then(r => r.json())
      .then(data => {
        if (!data.ok) {
          setTokenError(data.error);
        } else {
          setName(data.name);
          setEmail(data.email);
        }
      })
      .catch(() => setTokenError('Failed to validate link'))
      .finally(() => setLoading(false));
  });

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (password.length < 12) {
      setError('Password must be at least 12 characters');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/claim/${token}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ password }),
      }).then(r => r.json());

      if (!res.ok) {
        setError(res.error ?? 'Something went wrong');
        return;
      }

      toast('Account activated — welcome to Clearpath!', 'success');
      navigate('/login');
    } catch (err) {
      setError('Something went wrong — try again');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-5 h-5 border-2 border-brand-600 border-t-transparent
                      rounded-full animate-spin" />
    </div>
  );

  if (tokenError) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm bg-white rounded-xl border border-gray-200 p-8">
        <h1 className="text-lg font-semibold text-gray-900 mb-2">Link expired</h1>
        <p className="text-sm text-red-600 mb-4">{tokenError}</p>
        <a href="/claim"
          className="block text-center py-2 bg-brand-600 text-white text-sm
                     font-medium rounded-lg hover:bg-brand-800 transition-colors">
          Request a new link
        </a>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm bg-white rounded-xl shadow-sm
                      border border-gray-200 p-8">

        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">Activate account</h1>
          {name && (
            <p className="text-sm text-gray-500 mt-1">Welcome, {name}</p>
          )}
          {email && (
            <p className="text-xs text-gray-400 mt-0.5">{email}</p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Set your password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="At least 12 characters"
              autoComplete="new-password"
              required
              disabled={saving}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                         focus:outline-none focus:ring-2 focus:ring-brand-600
                         disabled:opacity-60"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Confirm password
            </label>
            <input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="Repeat your password"
              autoComplete="new-password"
              required
              disabled={saving}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                         focus:outline-none focus:ring-2 focus:ring-brand-600
                         disabled:opacity-60"
            />
          </div>

          {/* Password strength hint */}
          {password.length > 0 && password.length < 12 && (
            <p className="text-xs text-amber-600">
              {12 - password.length} more character{12 - password.length !== 1 ? 's' : ''} needed
            </p>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={saving || password.length < 12 || password !== confirm}
            className="w-full py-2 bg-brand-600 hover:bg-brand-800 text-white
                       text-sm font-medium rounded-lg transition-colors
                       disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Activating…' : 'Activate account'}
          </button>
        </form>

      </div>
    </div>
  );
}
