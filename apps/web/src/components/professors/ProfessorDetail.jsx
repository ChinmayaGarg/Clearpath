import { useState, useEffect } from 'react';
import { api }                 from '../../lib/api.js';
import { toast }               from '../ui/Toast.jsx';
import Spinner                 from '../ui/Spinner.jsx';

const DELIVERY_LABELS = {
  pickup: 'Pickup', dropped: 'Dropped off',
  delivery: 'Delivery', pending: 'Pending',
};

function DossierCard({ dossier }) {
  return (
    <div className="border border-gray-200 rounded-lg px-3 py-2.5">
      <div className="flex items-center justify-between mb-1">
        <span className="font-medium text-sm text-gray-900">{dossier.course_code}</span>
        {dossier.password_reminder && (
          <span className="text-xs text-amber-600 font-medium bg-amber-50
                           px-1.5 py-0.5 rounded">⚠ Password</span>
        )}
      </div>
      <div className="space-y-0.5">
        {dossier.preferred_delivery && (
          <p className="text-xs text-gray-500">
            Delivery: {DELIVERY_LABELS[dossier.preferred_delivery]}
          </p>
        )}
        {dossier.typical_materials && (
          <p className="text-xs text-gray-500 italic">{dossier.typical_materials}</p>
        )}
        {dossier.notes && (
          <p className="text-xs text-gray-600 mt-1">{dossier.notes}</p>
        )}
      </div>
      <p className="text-xs text-gray-400 mt-1.5">
        Updated {new Date(dossier.updated_at).toLocaleDateString('en-CA', {
          month: 'short', day: 'numeric', year: 'numeric',
        })}
        {dossier.last_updated_by_name && ` by ${dossier.last_updated_by_name}`}
      </p>
    </div>
  );
}

export default function ProfessorDetail({ professorId, onClose, onUpdated }) {
  const [prof,    setProf]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [form,    setForm]    = useState({});
  const [tab,     setTab]     = useState('profile');

  async function load() {
    setLoading(true);
    try {
      const data = await api.get(`/professors/${professorId}`);
      setProf(data.professor);
      setForm({
        firstName:  data.professor.first_name,
        lastName:   data.professor.last_name,
        department: data.professor.department ?? '',
        phone:      data.professor.phone      ?? '',
        office:     data.professor.office     ?? '',
      });
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [professorId]); // eslint-disable-line

  async function handleSave() {
    setSaving(true);
    try {
      await api.put(`/professors/${professorId}`, {
        firstName:  form.firstName  || undefined,
        lastName:   form.lastName   || undefined,
        department: form.department || null,
        phone:      form.phone      || null,
        office:     form.office     || null,
      });
      toast('Professor updated', 'success');
      setEditing(false);
      await load();
      onUpdated?.();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return (
    <div className="flex justify-center py-10"><Spinner /></div>
  );

  if (!prof) return (
    <p className="text-sm text-gray-400 py-6 text-center">Professor not found</p>
  );

  const tabs = ['profile', 'dossiers', 'history'];

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            {prof.first_name} {prof.last_name}
          </h2>
          <p className="text-sm text-gray-500">{prof.email}</p>
        </div>
        {!editing ? (
          <button onClick={() => setEditing(true)}
            className="text-sm text-brand-600 hover:text-brand-800 font-medium">
            Edit
          </button>
        ) : (
          <div className="flex gap-2">
            <button onClick={() => setEditing(false)}
              className="text-sm text-gray-400 hover:text-gray-600">Cancel</button>
            <button onClick={handleSave} disabled={saving}
              className="text-sm text-brand-600 hover:text-brand-800 font-medium
                         disabled:opacity-50">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-100 mb-4">
        {tabs.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-1.5 text-sm capitalize border-b-2 -mb-px transition-colors ${
              tab === t
                ? 'border-brand-600 text-brand-800 font-medium'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {t}
            {t === 'dossiers' && prof.dossiers?.length > 0 && (
              <span className="ml-1.5 text-xs bg-purple-100 text-purple-700
                               px-1.5 py-0.5 rounded-full">
                {prof.dossiers.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Profile tab */}
      {tab === 'profile' && (
        editing ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'First name', key: 'firstName' },
                { label: 'Last name',  key: 'lastName'  },
              ].map(({ label, key }) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
                  <input value={form[key]}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                               focus:outline-none focus:ring-2 focus:ring-brand-600" />
                </div>
              ))}
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
          </div>
        ) : (
          <div className="space-y-2">
            {[
              { label: 'Department', value: prof.department },
              { label: 'Phone',      value: prof.phone      },
              { label: 'Office',     value: prof.office     },
            ].map(({ label, value }) => (
              <div key={label} className="flex gap-3">
                <span className="text-xs text-gray-500 w-24 shrink-0">{label}</span>
                <span className="text-sm text-gray-800">
                  {value ?? <span className="text-gray-300">Not set</span>}
                </span>
              </div>
            ))}
          </div>
        )
      )}

      {/* Dossiers tab */}
      {tab === 'dossiers' && (
        <div className="space-y-2">
          {prof.dossiers?.length > 0 ? (
            prof.dossiers.map(d => <DossierCard key={d.id} dossier={d} />)
          ) : (
            <p className="text-sm text-gray-400 text-center py-6">
              No CourseDossier entries yet for this professor
            </p>
          )}
        </div>
      )}

      {/* History tab */}
      {tab === 'history' && (
        <div className="space-y-2">
          {prof.recentExams?.length > 0 ? (
            prof.recentExams.map(e => (
              <div key={e.id}
                className="flex items-center justify-between text-sm
                           border border-gray-100 rounded-lg px-3 py-2">
                <div>
                  <span className="font-medium text-gray-900">{e.course_code}</span>
                  <span className="text-xs text-gray-400 ml-2">
                    {new Date(e.date).toLocaleDateString('en-CA', {
                      month: 'short', day: 'numeric', year: 'numeric',
                    })}
                  </span>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                  e.status === 'picked_up' ? 'bg-green-100 text-green-700' :
                  e.status === 'cancelled' ? 'bg-red-100 text-red-500'    :
                  'bg-gray-100 text-gray-600'
                }`}>
                  {e.status.replace('_', ' ')}
                </span>
              </div>
            ))
          ) : (
            <p className="text-sm text-gray-400 text-center py-6">
              No exam history yet
            </p>
          )}
        </div>
      )}
    </div>
  );
}
