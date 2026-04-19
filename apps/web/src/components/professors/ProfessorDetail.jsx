import { useState, useEffect } from 'react';
import { api }                 from '../../lib/api.js';
import { toast }               from '../ui/Toast.jsx';
import Spinner                 from '../ui/Spinner.jsx';

const EXAM_TYPES = [
  { value: 'midterm', label: 'Midterm' },
  { value: 'endterm', label: 'End term' },
  { value: 'tutorial', label: 'Tutorial' },
  { value: 'lab', label: 'Lab' },
  { value: 'quiz', label: 'Quiz' },
  { value: 'assignment', label: 'Assignment' },
  { value: 'other', label: 'Other' },
];
const DELIVERIES = [
  { value: 'pending', label: 'Not sure yet' },
  { value: 'dropped', label: 'Prof will drop off' },
  { value: 'pickup', label: 'AC picks it up' },
  { value: 'delivery', label: 'Delivered to room' },
  { value: 'file_upload', label: 'File upload' },
];
const TYPE_LABELS = Object.fromEntries(EXAM_TYPES.map(t => [t.value, t.label]));
const DELIVERY_LABELS = Object.fromEntries(DELIVERIES.map(d => [d.value, d.label]));

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

  const tabs = ['profile', 'courses', 'uploads', 'history'];

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

      {/* Courses tab */}
      {tab === 'courses' && (
        <CoursesPanel dossiers={prof.dossiers ?? []} />
      )}

      {/* Uploads tab */}
      {tab === 'uploads' && (
        <LeadUploadPanel professorId={prof.id} />
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

// ── Courses panel ─────────────────────────────────────────────────────────────
function CoursesPanel({ dossiers }) {
  // Collect unique terms in descending order
  const terms = [...new Set(dossiers.map(d => d.term))].sort((a, b) => b.localeCompare(a));
  const [selectedTerm, setSelectedTerm] = useState(terms[0] ?? '');

  const visible = selectedTerm
    ? dossiers.filter(d => d.term === selectedTerm)
    : dossiers;

  if (dossiers.length === 0) {
    return (
      <p className="text-sm text-gray-400 text-center py-6">
        No courses linked to this professor yet
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {/* Term filter */}
      {terms.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setSelectedTerm('')}
            className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
              selectedTerm === ''
                ? 'bg-brand-600 text-white border-brand-600'
                : 'border-gray-200 text-gray-500 hover:border-gray-400'
            }`}
          >
            All terms
          </button>
          {terms.map(t => (
            <button
              key={t}
              onClick={() => setSelectedTerm(t)}
              className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
                selectedTerm === t
                  ? 'bg-brand-600 text-white border-brand-600'
                  : 'border-gray-200 text-gray-500 hover:border-gray-400'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {/* Course list */}
      {visible.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-4">
          No courses for this term
        </p>
      ) : (
        <div className="space-y-1.5">
          {visible.map(d => (
            <div
              key={d.id}
              className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg
                         border border-gray-100 bg-gray-50"
            >
              <span className="text-sm font-medium text-gray-900 shrink-0 whitespace-nowrap">
                {d.course_code}
              </span>
              <span className="text-xs text-gray-400 truncate text-right">{d.term}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Lead upload panel ─────────────────────────────────────────────────────────
const BLANK_FORM = {
  courseCode: '', examTypeLabel: 'midterm', versionLabel: '',
  delivery: 'pending', materials: '', password: '',
  rwgFlag: false, isMakeup: false, makeupNotes: '', estimatedCopies: '',
};

function LeadUploadPanel({ professorId }) {
  const [uploads,     setUploads]     = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [showForm,    setShowForm]    = useState(false);
  const [form,        setForm]        = useState(BLANK_FORM);
  const [step,        setStep]        = useState('details'); // 'details' | 'dates'
  const [saving,      setSaving]      = useState(false);
  const [uploadId,    setUploadId]    = useState(null);
  const [dates,       setDates]       = useState([]);
  const [newDate,     setNewDate]     = useState('');
  const [newTime,     setNewTime]     = useState('');

  async function load() {
    try {
      const d = await api.get(`/portal/professor/${professorId}/uploads`);
      setUploads(d.uploads ?? []);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [professorId]); // eslint-disable-line

  function openNew() {
    setForm(BLANK_FORM);
    setUploadId(null);
    setDates([]);
    setStep('details');
    setShowForm(true);
  }

  async function handleSaveDetails() {
    setSaving(true);
    try {
      const payload = {
        ...form,
        estimatedCopies: form.estimatedCopies !== '' ? Number(form.estimatedCopies) : null,
      };
      let id = uploadId;
      if (id) {
        await api.put(`/portal/professor/${professorId}/uploads/${id}`, payload);
      } else {
        const data = await api.post(`/portal/professor/${professorId}/uploads`, payload);
        id = data.uploadId;
        setUploadId(id);
      }
      setStep('dates');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleAddDate() {
    if (!newDate) return;
    try {
      const data = await api.post(
        `/portal/professor/${professorId}/uploads/${uploadId}/dates`,
        { examDate: newDate, timeSlot: newTime || null },
      );
      setDates(d => [...d, { id: data.dateId, exam_date: newDate, time_slot: newTime || null }]);
      setNewDate(''); setNewTime('');
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function handleRemoveDate(dateId) {
    try {
      await api.delete(`/portal/professor/${professorId}/uploads/${uploadId}/dates/${dateId}`);
      setDates(d => d.filter(x => x.id !== dateId));
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function handleSubmit() {
    if (!dates.length) { toast('Add at least one exam date', 'warning'); return; }
    setSaving(true);
    try {
      await api.post(`/portal/professor/${professorId}/uploads/${uploadId}/submit`, {});
      toast('Exam saved successfully', 'success');
      setShowForm(false);
      load();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="flex justify-center py-6"><Spinner /></div>;

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button onClick={openNew}
          className="px-3 py-1.5 bg-brand-600 hover:bg-brand-800 text-white
                     text-xs font-medium rounded-lg transition-colors">
          + New exam upload
        </button>
      </div>

      {/* Inline form */}
      {showForm && (
        <div className="border border-gray-200 rounded-xl p-4 bg-gray-50 space-y-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-gray-700">
              {step === 'details' ? 'Step 1 — Exam details' : 'Step 2 — Exam dates'}
            </span>
            <button onClick={() => setShowForm(false)}
              className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
          </div>

          {step === 'details' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Course code</label>
                  <input value={form.courseCode}
                    onChange={e => setForm(f => ({ ...f, courseCode: e.target.value.toUpperCase() }))}
                    placeholder="e.g. CSCI 2220"
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm
                               focus:outline-none focus:ring-2 focus:ring-brand-600" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Exam type</label>
                  <select value={form.examTypeLabel}
                    onChange={e => setForm(f => ({ ...f, examTypeLabel: e.target.value }))}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm
                               focus:outline-none focus:ring-2 focus:ring-brand-600">
                    {EXAM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Delivery
                </label>
                <select value={form.delivery}
                  onChange={e => setForm(f => ({ ...f, delivery: e.target.value }))}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm
                             focus:outline-none focus:ring-2 focus:ring-brand-600">
                  {DELIVERIES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
              </div>
              {form.delivery === 'dropped' && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Estimated copies
                  </label>
                  <input type="number" min="1" value={form.estimatedCopies}
                    onChange={e => setForm(f => ({ ...f, estimatedCopies: e.target.value }))}
                    placeholder="e.g. 30"
                    className="w-24 px-2 py-1.5 border border-gray-300 rounded-lg text-sm
                               focus:outline-none focus:ring-2 focus:ring-brand-600" />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Materials</label>
                <input value={form.materials}
                  onChange={e => setForm(f => ({ ...f, materials: e.target.value }))}
                  placeholder="e.g. Scientific calculator, one cue sheet"
                  className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm
                             focus:outline-none focus:ring-2 focus:ring-brand-600" />
              </div>
              <button onClick={handleSaveDetails} disabled={saving || !form.courseCode}
                className="w-full py-2 bg-brand-600 hover:bg-brand-800 text-white text-sm
                           font-medium rounded-lg transition-colors disabled:opacity-50">
                {saving ? 'Saving…' : 'Next →'}
              </button>
            </div>
          )}

          {step === 'dates' && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)}
                  className="flex-1 px-2 py-1.5 border border-gray-300 rounded-lg text-sm
                             focus:outline-none focus:ring-2 focus:ring-brand-600" />
                <input type="time" value={newTime} onChange={e => setNewTime(e.target.value)}
                  className="w-28 px-2 py-1.5 border border-gray-300 rounded-lg text-sm
                             focus:outline-none focus:ring-2 focus:ring-brand-600" />
                <button onClick={handleAddDate} disabled={!newDate}
                  className="px-3 py-1.5 bg-brand-600 hover:bg-brand-800 text-white text-sm
                             font-medium rounded-lg disabled:opacity-50">Add</button>
              </div>
              <div className="space-y-1">
                {dates.map(d => (
                  <div key={d.id} className="flex items-center justify-between px-3 py-1.5
                                             bg-white border border-gray-200 rounded-lg text-sm">
                    <span className="text-gray-700">
                      {new Date(d.exam_date + 'T12:00:00').toLocaleDateString('en-CA', {
                        weekday: 'short', month: 'short', day: 'numeric',
                      })}
                      {d.time_slot && ` · ${d.time_slot.slice(0,5)}`}
                    </span>
                    <button onClick={() => handleRemoveDate(d.id)}
                      className="text-xs text-red-400 hover:text-red-600">Remove</button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setStep('details')}
                  className="flex-1 py-2 border border-gray-300 text-gray-700 text-sm
                             font-medium rounded-lg hover:bg-gray-50">← Back</button>
                <button onClick={handleSubmit} disabled={saving || !dates.length}
                  className="flex-1 py-2 bg-green-600 hover:bg-green-700 text-white text-sm
                             font-medium rounded-lg transition-colors disabled:opacity-50">
                  {saving ? 'Saving…' : 'Save exam'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Existing uploads list */}
      {uploads.length === 0 && !showForm ? (
        <p className="text-sm text-gray-400 text-center py-6">No exam uploads yet</p>
      ) : (
        uploads.map(u => (
          <div key={u.id} className="border border-gray-200 rounded-xl px-4 py-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center flex-wrap gap-2">
                <span className="font-semibold text-gray-900 text-sm">{u.course_code}</span>
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                  {TYPE_LABELS[u.exam_type_label] ?? u.exam_type_label}
                </span>
                {u.is_makeup && (
                  <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded font-medium">Makeup</span>
                )}
              </div>
              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded font-medium shrink-0">
                {u.status}
              </span>
            </div>
            {u.delivery !== 'pending' && (
              <p className="text-xs text-gray-500 mt-1">
                {DELIVERY_LABELS[u.delivery] ?? u.delivery}
                {u.estimated_copies != null && u.delivery === 'dropped' && (
                  <span className="ml-1 text-amber-700">· {u.estimated_copies} est. copies</span>
                )}
              </p>
            )}
            {u.dates?.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {u.dates.map((d, i) => (
                  <span key={i} className="text-xs bg-gray-50 border border-gray-200 px-2 py-0.5 rounded">
                    {new Date(d.exam_date + 'T12:00:00').toLocaleDateString('en-CA', {
                      month: 'short', day: 'numeric',
                    })}
                    {d.time_slot && ` · ${d.time_slot.slice(0,5)}`}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
