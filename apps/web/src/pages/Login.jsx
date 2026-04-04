import { useState }     from 'react';
import { useNavigate }  from 'react-router-dom';
import { useAuthStore } from '../store/authStore.js';

export default function Login() {
  const navigate  = useNavigate();
  // Granular selectors — only re-render when these specific values change
  const login     = useAuthStore(s => s.login);
  const user      = useAuthStore(s => s.user);

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  // Already logged in — redirect immediately without re-rendering
  if (user) {
    navigate('/', { replace: true });
    return null;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm bg-white rounded-xl shadow-sm
                      border border-gray-200 p-8">

        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-gray-900">Clearpath</h1>
          <p className="text-sm text-gray-500 mt-1">
            Accessibility Centre — sign in to continue
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@dal.ca"
              autoComplete="username"
              required
              disabled={loading}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                         focus:outline-none focus:ring-2 focus:ring-brand-600
                         disabled:opacity-60"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Password"
              autoComplete="current-password"
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
            className="w-full py-2 px-4 bg-brand-600 hover:bg-brand-800 text-white
                       text-sm font-medium rounded-lg transition-colors
                       disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="mt-4 text-center">
          <a href="/forgot-password"
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
            Forgot password?
          </a>
        </div>

      </div>
    </div>
  );
}
