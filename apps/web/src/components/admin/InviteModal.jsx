import { useState } from 'react';
import { api }      from '../../lib/api.js';
import { useAuth }  from '../../hooks/useAuth.js';

const ALL_ROLES = [
  { value: 'institution_admin', label: 'Admin' },
  { value: 'lead',              label: 'Lead' },
  { value: 'professor',         label: 'Professor' },
  { value: 'student',           label: 'Student' },
  { value: 'counsellor',        label: 'Counsellor' },
];

export default function InviteModal({ onClose, onSuccess }) {
  const { user }        = useAuth();
  const domain          = user?.email?.split('@')[1] ?? '';
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', roles: [],
  });
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [tempPass, setTempPass] = useState(null);
  const [copied,   setCopied]   = useState(false);

  function toggleRole(role) {
    setForm(f => ({
      ...f,
      roles: f.roles.includes(role)
        ? f.roles.filter(r => r !== role)
        : [...f.roles, role],
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (form.roles.length === 0) {
      setError('Select at least one role');
      return;
    }

    setLoading(true);
    try {
      const result = await api.post('/users/invite', form);
      if (result._dev_temporaryPassword) {
        setTempPass(result._dev_temporaryPassword);
      } else {
        onSuccess?.();
        onClose?.();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(tempPass);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (tempPass) {
    return (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-lg w-full max-w-md">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-base font-medium text-gray-900">User invited</h2>
          </div>
          <div className="px-6 py-5 space-y-4">
            <p className="text-sm text-gray-600">
              <span className="font-medium">{form.email}</span> has been created.
              Share this temporary password with them — it won't be shown again.
            </p>
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3
                            flex items-center justify-between gap-3">
              <code className="text-sm font-mono text-gray-900 break-all">{tempPass}</code>
              <button
                onClick={handleCopy}
                className="shrink-0 text-xs font-medium text-brand-600 hover:text-brand-800
                           transition-colors"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <button
              onClick={() => { onSuccess?.(); onClose?.(); }}
              className="w-full py-2 bg-brand-600 hover:bg-brand-800 text-white text-sm
                         font-medium rounded-lg transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-md">

        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-medium text-gray-900">Invite user</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-lg leading-none"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                First name
              </label>
              <input
                type="text"
                required
                value={form.firstName}
                onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                           focus:outline-none focus:ring-2 focus:ring-brand-600"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Last name
              </label>
              <input
                type="text"
                required
                value={form.lastName}
                onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                           focus:outline-none focus:ring-2 focus:ring-brand-600"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Email <span className="text-gray-400 font-normal">must be @{domain}</span>
            </label>
            <input
              type="email"
              required
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder={`name@${domain}`}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                         focus:outline-none focus:ring-2 focus:ring-brand-600"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2">
              Roles <span className="text-gray-400 font-normal">(select all that apply)</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {ALL_ROLES.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => toggleRole(value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    form.roles.includes(value)
                      ? 'bg-brand-600 text-white border-brand-600'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 border border-gray-300 text-gray-700 text-sm
                         font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2 bg-brand-600 hover:bg-brand-800 text-white
                         text-sm font-medium rounded-lg transition-colors
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Inviting…' : 'Send invitation'}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
