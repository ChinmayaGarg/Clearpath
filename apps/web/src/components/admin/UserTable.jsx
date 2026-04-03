import { useState, useEffect } from 'react';
import { api }                 from '../../lib/api.js';
import { useAuth }             from '../../hooks/useAuth.js';

const ROLE_LABELS = {
  institution_admin: 'Admin',
  lead:              'Lead',
  professor:         'Professor',
  student:           'Student',
  counsellor:        'Counsellor',
};

const ROLE_COLOURS = {
  institution_admin: 'bg-purple-100 text-purple-800',
  lead:              'bg-blue-100 text-blue-800',
  professor:         'bg-teal-100 text-teal-800',
  student:           'bg-green-100 text-green-800',
  counsellor:        'bg-amber-100 text-amber-800',
};

function RoleBadge({ role }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${ROLE_COLOURS[role] ?? 'bg-gray-100 text-gray-700'}`}>
      {ROLE_LABELS[role] ?? role}
    </span>
  );
}

export default function UserTable({ onInvite }) {
  const { user: currentUser } = useAuth();
  const [users,   setUsers]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  async function load() {
    setLoading(true);
    try {
      const data = await api.get('/users');
      setUsers(data.users);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleDisable(userId) {
    if (!confirm('Deactivate this user? All their sessions will be terminated immediately.')) return;
    try {
      await api.put(`/users/${userId}/disable`, {});
      load();
    } catch (err) { alert(err.message); }
  }

  async function handleEnable(userId) {
    try {
      await api.put(`/users/${userId}/enable`, {});
      load();
    } catch (err) { alert(err.message); }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-12 text-sm text-gray-400">
      Loading users…
    </div>
  );

  if (error) return (
    <div className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-lg">{error}</div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-medium text-gray-900">
          Users <span className="text-gray-400 font-normal">({users.length})</span>
        </h2>
        <button
          onClick={onInvite}
          className="px-3 py-1.5 bg-brand-600 hover:bg-brand-800 text-white text-sm
                     font-medium rounded-lg transition-colors"
        >
          + Invite user
        </button>
      </div>

      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Roles</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Last active</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map(u => (
              <tr key={u.id} className={`hover:bg-gray-50 ${!u.is_active ? 'opacity-50' : ''}`}>
                <td className="px-4 py-3 font-medium text-gray-900">
                  {u.first_name} {u.last_name}
                  {u.id === currentUser?.id && (
                    <span className="ml-2 text-xs text-gray-400">(you)</span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-600">{u.email}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {u.roles.length > 0
                      ? u.roles.map(r => <RoleBadge key={r} role={r} />)
                      : <span className="text-gray-400 text-xs">No roles</span>
                    }
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">
                  {u.last_login_at
                    ? new Date(u.last_login_at).toLocaleDateString('en-CA', {
                        month: 'short', day: 'numeric', year: 'numeric',
                      })
                    : 'Never'
                  }
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                    u.is_active
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-500'
                  }`}>
                    {u.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  {u.id !== currentUser?.id && (
                    u.is_active
                      ? <button
                          onClick={() => handleDisable(u.id)}
                          className="text-xs text-red-500 hover:text-red-700 transition-colors"
                        >
                          Disable
                        </button>
                      : <button
                          onClick={() => handleEnable(u.id)}
                          className="text-xs text-green-600 hover:text-green-800 transition-colors"
                        >
                          Enable
                        </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
