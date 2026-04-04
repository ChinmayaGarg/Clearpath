/**
 * Exam edit modal — edit exam fields + view CourseDossier + send email.
 * Opened from ExamCard when lead clicks "Edit".
 */
import { useState }     from 'react';
import Modal            from '../ui/Modal.jsx';
import DossierPanel     from './DossierPanel.jsx';
import EmailComposer    from '../email/EmailComposer.jsx';
import { api }          from '../../lib/api.js';
import { useBook }      from '../../hooks/useBook.js';
import { useAuth }      from '../../hooks/useAuth.js';
import { DELIVERY_LABELS } from '../../lib/constants.js';

const TABS = ['Details', 'CourseDossier', 'Email'];

export default function ExamEditModal({ exam, onClose }) {
  const { updateField, loadBook, date } = useBook();
  const { hasFeature }                  = useAuth();
  const [activeTab, setActiveTab]       = useState('Details');
  const [form, setForm]                 = useState({
    courseCode:      exam.course_code      ?? '',
    crossListedCode: exam.cross_listed_code ?? '',
    durationMins:    exam.duration_mins    ?? '',
    examType:        exam.exam_type        ?? 'paper',
    delivery:        exam.delivery         ?? 'pending',
    materials:       exam.materials        ?? '',
    password:        exam.password         ?? '',
    rwgFlag:         exam.rwg_flag         ?? false,
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const canEmail   = hasFeature('prof_email_direct');
  const canDossier = hasFeature('course_dossier');

  const visibleTabs = TABS.filter(t =>
    t === 'Details' ||
    (t === 'CourseDossier' && canDossier) ||
    (t === 'Email' && canEmail)
  );

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      await api.patch(`/exams/${exam.id}`, {
        courseCode:      form.courseCode,
        crossListedCode: form.crossListedCode || null,
        durationMins:    form.durationMins ? Number(form.durationMins) : null,
        examType:        form.examType,
        delivery:        form.delivery,
        materials:       form.materials || null,
        password:        form.password  || null,
        rwgFlag:         form.rwgFlag,
      });
      await loadBook(date);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function applyDossierSuggestions(suggestions) {
    setForm(f => ({
      ...f,
      ...(suggestions.delivery  ? { delivery:  suggestions.delivery  } : {}),
      ...(suggestions.materials ? { materials: suggestions.materials } : {}),
    }));
    setActiveTab('Details');
  }

  return (
    <Modal title={exam.course_code} onClose={onClose} width="max-w-2xl">

      {/* Tab bar */}
      {visibleTabs.length > 1 && (
        <div className="flex gap-1 mb-4 -mx-6 px-6 border-b border-gray-100 pb-0">
          {visibleTabs.map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === tab
                  ? 'border-brand-600 text-brand-800'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {tab}
            </button>
          ))}
        </div>
      )}

      {/* Details tab */}
      {activeTab === 'Details' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Course code</label>
              <input value={form.courseCode}
                onChange={e => setForm(f => ({ ...f, courseCode: e.target.value.toUpperCase() }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                           focus:outline-none focus:ring-2 focus:ring-brand-600" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Cross-listed</label>
              <input value={form.crossListedCode}
                onChange={e => setForm(f => ({ ...f, crossListedCode: e.target.value.toUpperCase() }))}
                placeholder="Optional"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                           focus:outline-none focus:ring-2 focus:ring-brand-600" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Duration (mins)</label>
              <input type="number" value={form.durationMins}
                onChange={e => setForm(f => ({ ...f, durationMins: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                           focus:outline-none focus:ring-2 focus:ring-brand-600" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Type</label>
              <select value={form.examType}
                onChange={e => setForm(f => ({ ...f, examType: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                           focus:outline-none focus:ring-2 focus:ring-brand-600">
                <option value="paper">Paper</option>
                <option value="brightspace">Brightspace</option>
                <option value="crowdmark">Crowdmark</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Delivery</label>
              <select value={form.delivery}
                onChange={e => setForm(f => ({ ...f, delivery: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                           focus:outline-none focus:ring-2 focus:ring-brand-600">
                {Object.entries(DELIVERY_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Materials permitted</label>
            <textarea value={form.materials}
              onChange={e => setForm(f => ({ ...f, materials: e.target.value }))}
              rows={2} placeholder="e.g. Scientific calculator, one-page cue sheet"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                         resize-none focus:outline-none focus:ring-2 focus:ring-brand-600" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Password
              {form.examType === 'brightspace' && (
                <span className="text-red-500 ml-1">required for Brightspace</span>
              )}
            </label>
            <input value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              placeholder={form.examType === 'brightspace' ? 'Required before exam can advance' : 'Optional'}
              className={`w-full px-3 py-2 border rounded-lg text-sm
                         focus:outline-none focus:ring-2 focus:ring-brand-600 ${
                form.examType === 'brightspace' && !form.password
                  ? 'border-amber-400 bg-amber-50'
                  : 'border-gray-300'
              }`} />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.rwgFlag}
              onChange={e => setForm(f => ({ ...f, rwgFlag: e.target.checked }))}
              className="accent-brand-600" />
            <span className="text-sm text-gray-700">RWG flag — requires Word file</span>
          </label>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
          )}

          <div className="flex gap-2 pt-2">
            <button onClick={onClose}
              className="flex-1 py-2 border border-gray-300 text-gray-700 text-sm
                         font-medium rounded-lg hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving}
              className="flex-1 py-2 bg-brand-600 hover:bg-brand-800 text-white
                         text-sm font-medium rounded-lg transition-colors
                         disabled:opacity-50">
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      )}

      {/* CourseDossier tab */}
      {activeTab === 'CourseDossier' && (
        <DossierPanel
          exam={{ ...exam, professor_id: exam.professor_id }}
          onApplySuggestions={applyDossierSuggestions}
        />
      )}

      {/* Email tab */}
      {activeTab === 'Email' && (
        <EmailComposer exam={exam} onClose={() => setActiveTab('Details')} />
      )}

    </Modal>
  );
}
