import { useState, useEffect } from 'react';
import { api }                 from '../../lib/api.js';
import { toast }               from '../ui/Toast.jsx';
import Spinner                 from '../ui/Spinner.jsx';
import { formatTime }          from '../../lib/utils.js';

function AccommodationBadge({ code }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
      code.triggers_rwg_flag
        ? 'bg-red-100 text-red-700'
        : 'bg-gray-100 text-gray-600'
    }`}>
      {code.code}
      {code.triggers_rwg_flag && <span className="ml-1 text-red-400">●</span>}
    </span>
  );
}

export default function StudentDetail({ studentId, onClose, onUpdated }) {
  const [student, setStudent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [tab,     setTab]     = useState('profile');
  const [form,    setForm]    = useState({
    phone: '', doNotCall: false, notes: '',
  });

  async function load() {
    setLoading(true);
    try {
      const data = await api.get(`/students/${studentId}`);
      setStudent(data.student);
      setForm({
        phone:     data.student.phone     ?? '',
        doNotCall: data.student.do_not_call ?? false,
        notes:     data.student.notes     ?? '',
      });
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [studentId]); // eslint-disable-line

  async function handleSave() {
    setSaving(true);
    try {
      await api.put(`/students/${studentId}`, {
        phone:     form.phone     || null,
        doNotCall: form.doNotCall,
        notes:     form.notes     || null,
      });
      toast('Profile updated', 'success');
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
  if (!student) return (
    <p className="text-sm text-gray-400 text-center py-6">Student not found</p>
  );

  const name = `${student.first_name || ''} ${student.last_name || ''}`.trim()
    || 'Unknown name';

  return (
    <div>

      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{name}</h2>
          <p className="text-sm font-mono text-gray-500">{student.student_number}</p>
        </div>
        {!editing ? (
          <button onClick={() => setEditing(true)}
            className="text-sm text-brand-600 hover:text-brand-800 font-medium">
            Edit
          </button>
        ) : (
          <div className="flex gap-2">
            <button onClick={() => { setEditing(false); }}
              className="text-sm text-gray-400 hover:text-gray-600">Cancel</button>
            <button onClick={handleSave} disabled={saving}
              className="text-sm text-brand-600 hover:text-brand-800 font-medium
                         disabled:opacity-50">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
      </div>

      {/* Accommodation summary — always visible */}
      {student.allAccommodations?.length > 0 && (
        <div className="mb-4 p-3 bg-gray-50 rounded-xl border border-gray-200">
          <p className="text-xs font-medium text-gray-500 mb-2">
            Accommodation codes on record
          </p>
          <div className="flex flex-wrap gap-1.5">
            {student.allAccommodations.map(c => (
              <AccommodationBadge key={c.code} code={c} />
            ))}
          </div>
        </div>
      )}

      {/* Do not call banner */}
      {student.do_not_call && !editing && (
        <div className="mb-4 flex items-center gap-2 px-3 py-2 bg-red-50
                        border border-red-200 rounded-lg text-sm text-red-700">
          <span className="font-medium">† Do not call</span>
          <span className="text-red-500 text-xs">
            — do not contact this student by phone
          </span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-100 mb-4">
        {['profile', 'history'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-1.5 text-sm capitalize border-b-2 -mb-px transition-colors ${
              tab === t
                ? 'border-brand-600 text-brand-800 font-medium'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {t}
            {t === 'history' && student.history?.length > 0 && (
              <span className="ml-1.5 text-xs bg-gray-100 text-gray-500
                               px-1.5 py-0.5 rounded-full">
                {student.history.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Profile tab */}
      {tab === 'profile' && (
        editing ? (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Phone number
              </label>
              <input
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="e.g. (902) 555-0100"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                           focus:outline-none focus:ring-2 focus:ring-brand-600"
              />
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.doNotCall}
                onChange={e => setForm(f => ({ ...f, doNotCall: e.target.checked }))}
                className="accent-red-600"
              />
              <span className="text-sm text-gray-700">
                † Do not call — do not contact by phone
              </span>
            </label>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Notes for leads
              </label>
              <textarea
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                rows={3}
                placeholder="Any notes about this student's needs or preferences…"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                           resize-none focus:outline-none focus:ring-2 focus:ring-brand-600"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-2.5">
            {[
              { label: 'Phone',  value: student.phone },
              { label: 'Email',  value: student.email?.includes('@student.placeholder')
                  ? null : student.email },
            ].map(({ label, value }) => (
              <div key={label} className="flex gap-3">
                <span className="text-xs text-gray-500 w-20 shrink-0">{label}</span>
                <span className="text-sm text-gray-800">
                  {value ?? <span className="text-gray-300">Not set</span>}
                </span>
              </div>
            ))}
            {student.notes && (
              <div className="flex gap-3">
                <span className="text-xs text-gray-500 w-20 shrink-0">Notes</span>
                <span className="text-sm text-gray-700 italic">{student.notes}</span>
              </div>
            )}
          </div>
        )
      )}

      {/* History tab */}
      {tab === 'history' && (
        <div className="space-y-2">
          {student.history?.length > 0 ? (
            student.history.map(appt => (
              <div key={appt.appointment_id}
                className={`border rounded-xl px-3 py-2.5 ${
                  appt.is_cancelled
                    ? 'border-gray-100 bg-gray-50 opacity-60'
                    : 'border-gray-200 bg-white'
                }`}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-gray-900">
                      {appt.course_code}
                    </span>
                    {appt.is_cancelled && (
                      <span className="text-xs text-red-500">Cancelled</span>
                    )}
                  </div>
                  <span className="text-xs text-gray-400">
                    {new Date(appt.date).toLocaleDateString('en-CA', {
                      month: 'short', day: 'numeric', year: 'numeric',
                    })}
                  </span>
                </div>
                <div className="text-xs text-gray-500 mb-1.5">
                  {appt.room_name} · {formatTime(appt.start_time)} · {appt.duration_mins} min
                </div>
                {appt.accommodations?.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {appt.accommodations.map(a => (
                      <span key={a.code}
                        className="text-xs bg-gray-100 text-gray-600
                                   px-1.5 py-0.5 rounded font-medium">
                        {a.code}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))
          ) : (
            <p className="text-sm text-gray-400 text-center py-6">
              No appointment history yet
            </p>
          )}
        </div>
      )}

    </div>
  );
}
