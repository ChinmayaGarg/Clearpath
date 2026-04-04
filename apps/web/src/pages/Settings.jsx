import { useState }  from 'react';
import { useAuth }   from '../hooks/useAuth.js';
import { api }       from '../lib/api.js';
import { toast }     from '../components/ui/Toast.jsx';

export default function Settings() {
  const { user }  = useAuth();
  const [current, setCurrent] = useState('');
  const [newPw,   setNewPw]   = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving,  setSaving]  = useState(false);

  async function handleChange(e) {
    e.preventDefault();
    if (newPw !== confirm) { toast('Passwords do not match', 'error'); return; }
    setSaving(true);
    try {
      await api.put('/auth/password', { currentPassword: current, newPassword: newPw });
      toast('Password changed — please log in again', 'success');
      setCurrent(''); setNewPw(''); setConfirm('');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-md mx-auto px-4 py-8">
      <h1 className="text-xl font-semibold text-gray-900 mb-6">Settings</h1>
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-sm font-medium text-gray-900 mb-4">Change password</h2>
        <form onSubmit={handleChange} className="space-y-3">
          {[
            { label: 'Current password', value: current, set: setCurrent },
            { label: 'New password',     value: newPw,   set: setNewPw   },
            { label: 'Confirm new',      value: confirm, set: setConfirm },
          ].map(({ label, value, set }) => (
            <div key={label}>
              <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
              <input type="password" value={value} onChange={e => set(e.target.value)}
                required minLength={label === 'Current password' ? 1 : 12}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                           focus:outline-none focus:ring-2 focus:ring-brand-600" />
            </div>
          ))}
          <button type="submit" disabled={saving}
            className="w-full py-2 bg-brand-600 hover:bg-brand-800 text-white
                       text-sm font-medium rounded-lg transition-colors mt-2
                       disabled:opacity-50">
            {saving ? 'Saving…' : 'Update password'}
          </button>
        </form>
      </div>
    </div>
  );
}
