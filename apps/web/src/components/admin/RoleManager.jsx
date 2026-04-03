import { useState } from 'react';
import { api }      from '../../lib/api.js';

const ALL_ROLES = [
  { value: 'institution_admin', label: 'Admin',      description: 'Manage users, settings, view analytics' },
  { value: 'lead',              label: 'Lead',       description: 'Run daily book, import PDFs, send emails' },
  { value: 'professor',         label: 'Professor',  description: 'View own exams, upload files' },
  { value: 'student',           label: 'Student',    description: 'View own appointments' },
  { value: 'counsellor',        label: 'Counsellor', description: 'View student profiles and accommodation reports' },
];

export default function RoleManager({ user, onUpdate }) {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const currentRoles = user.roles.map(r => r.role ?? r);

  async function toggleRole(role) {
    setError('');
    setLoading(true);
    try {
      if (currentRoles.includes(role)) {
        await api.delete(`/users/${user.id}/roles/${role}`);
      } else {
        await api.post(`/users/${user.id}/roles`, { role });
      }
      onUpdate?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h3 className="text-sm font-medium text-gray-900 mb-3">Roles</h3>

      {error && (
        <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded mb-3">{error}</p>
      )}

      <div className="space-y-2">
        {ALL_ROLES.map(({ value, label, description }) => {
          const active = currentRoles.includes(value);
          return (
            <label
              key={value}
              className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                active
                  ? 'border-brand-600 bg-brand-50'
                  : 'border-gray-200 hover:border-gray-300 bg-white'
              }`}
            >
              <input
                type="checkbox"
                checked={active}
                disabled={loading}
                onChange={() => toggleRole(value)}
                className="mt-0.5 accent-brand-600"
              />
              <div>
                <div className="text-sm font-medium text-gray-900">{label}</div>
                <div className="text-xs text-gray-500">{description}</div>
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}
