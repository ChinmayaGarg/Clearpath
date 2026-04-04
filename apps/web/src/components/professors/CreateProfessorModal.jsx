import { useState } from 'react';
import Modal        from '../ui/Modal.jsx';
import { api }      from '../../lib/api.js';
import { toast }    from '../ui/Toast.jsx';
import { useAuth }  from '../../hooks/useAuth.js';

export default function CreateProfessorModal({ onClose, onCreated }) {
  const { user }  = useAuth();
  const domain    = user?.email?.split('@')[1] ?? '';
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '',
    department: '', phone: '', office: '',
  });
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/professors', form);
      toast(`${form.firstName} ${form.lastName} added`, 'success');
      onCreated?.();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Add professor" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'First name', key: 'firstName', required: true },
            { label: 'Last name',  key: 'lastName',  required: true },
          ].map(({ label, key, required }) => (
            <div key={key}>
              <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
              <input required={required} value={form[key]}
                onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                           focus:outline-none focus:ring-2 focus:ring-brand-600" />
            </div>
          ))}
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Email <span className="text-gray-400 font-normal">(@{domain})</span>
          </label>
          <input type="email" required value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            placeholder={`professor@${domain}`}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                       focus:outline-none focus:ring-2 focus:ring-brand-600" />
        </div>

        {[
          { label: 'Department', key: 'department', placeholder: 'e.g. Computer Science' },
          { label: 'Phone',      key: 'phone',      placeholder: 'e.g. (902) 494-0000'   },
          { label: 'Office',     key: 'office',     placeholder: 'e.g. Goldberg 310'      },
        ].map(({ label, key, placeholder }) => (
          <div key={key}>
            <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
            <input value={form[key]} placeholder={placeholder}
              onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                         focus:outline-none focus:ring-2 focus:ring-brand-600" />
          </div>
        ))}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose}
            className="flex-1 py-2 border border-gray-300 text-gray-700 text-sm
                       font-medium rounded-lg hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={saving}
            className="flex-1 py-2 bg-brand-600 hover:bg-brand-800 text-white
                       text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
            {saving ? 'Adding…' : 'Add professor'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
