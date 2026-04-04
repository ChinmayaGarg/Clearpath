/**
 * CourseDossier panel — shown when editing an exam.
 *
 * Two modes:
 *  1. Read mode — shows existing dossier data for this professor/course
 *  2. Edit mode — lets a lead update the dossier inline
 *
 * Also shows the prefill banner when opening an exam that has empty
 * delivery/materials fields — one click to apply the suggestions.
 */
import { useState, useEffect } from 'react';
import { api }                 from '../../lib/api.js';

const DELIVERY_LABELS = {
  pickup:   'Pickup by lead',
  dropped:  'Dropped off by professor',
  delivery: 'Delivery to room',
  pending:  'To be confirmed',
};

function PrefillBanner({ prefill, onApply }) {
  if (!prefill?.suggestions || !Object.keys(prefill.suggestions).length) return null;

  const parts = [];
  if (prefill.suggestions.delivery) {
    parts.push(`delivery: ${DELIVERY_LABELS[prefill.suggestions.delivery]}`);
  }
  if (prefill.suggestions.materials) {
    parts.push(`materials: "${prefill.suggestions.materials}"`);
  }

  return (
    <div className="flex items-start gap-3 bg-brand-50 border border-brand-600
                    border-opacity-30 rounded-lg px-3 py-2.5">
      <div className="flex-1">
        <p className="text-xs font-medium text-brand-800">
          CourseDossier suggestion
        </p>
        <p className="text-xs text-brand-600 mt-0.5">
          {parts.join(' · ')}
        </p>
        {prefill.dossier?.notes && (
          <p className="text-xs text-brand-600 mt-1 italic">
            Note: {prefill.dossier.notes}
          </p>
        )}
        {prefill.passwordReminder && (
          <p className="text-xs text-amber-600 font-medium mt-1">
            ⚠ Password reminder — this professor typically requires a password
          </p>
        )}
      </div>
      <button
        onClick={() => onApply(prefill.suggestions)}
        className="shrink-0 px-2.5 py-1 bg-brand-600 hover:bg-brand-800
                   text-white text-xs font-medium rounded transition-colors"
      >
        Apply
      </button>
    </div>
  );
}

export default function DossierPanel({ exam, onApplySuggestions }) {
  const [dossier,  setDossier]  = useState(null);
  const [prefill,  setPrefill]  = useState(null);
  const [editing,  setEditing]  = useState(false);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');

  const [form, setForm] = useState({
    preferredDelivery: '',
    typicalMaterials:  '',
    passwordReminder:  false,
    notes:             '',
  });

  useEffect(() => {
    async function load() {
      if (!exam?.id) return;
      setLoading(true);
      try {
        const data = await api.get(`/dossier/exam/${exam.id}`);
        setPrefill(data.prefill);
        if (data.prefill?.dossier) {
          const d = data.prefill.dossier;
          setDossier(d);
          setForm({
            preferredDelivery: d.preferred_delivery ?? '',
            typicalMaterials:  d.typical_materials  ?? '',
            passwordReminder:  d.password_reminder  ?? false,
            notes:             d.notes              ?? '',
          });
        }
      } catch (err) {
        // CourseDossier may not be enabled on this plan — fail silently
        if (!err.message.includes('not available')) {
          setError(err.message);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [exam?.id]);

  async function handleSave() {
    if (!exam?.professor_id) {
      setError('No professor linked to this exam — link a professor first');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.put('/dossier', {
        professorId:       exam.professor_id,
        courseCode:        exam.course_code,
        preferredDelivery: form.preferredDelivery || null,
        typicalMaterials:  form.typicalMaterials  || null,
        passwordReminder:  form.passwordReminder,
        notes:             form.notes             || null,
      });
      setEditing(false);
      // Refresh
      const data = await api.get(`/dossier/exam/${exam.id}`);
      setDossier(data.prefill?.dossier ?? null);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return null;

  return (
    <div className="space-y-3">

      {/* Prefill banner */}
      {!editing && prefill && (
        <PrefillBanner
          prefill={prefill}
          onApply={onApplySuggestions}
        />
      )}

      {/* Dossier card */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50
                        border-b border-gray-200">
          <h3 className="text-xs font-medium text-gray-600 uppercase tracking-wide">
            CourseDossier
          </h3>
          {!editing ? (
            <button
              onClick={() => setEditing(true)}
              className="text-xs text-brand-600 hover:text-brand-800 font-medium"
            >
              {dossier ? 'Edit' : 'Add entry'}
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => setEditing(false)}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="text-xs text-brand-600 hover:text-brand-800 font-medium
                           disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          )}
        </div>

        <div className="px-4 py-3">
          {error && (
            <p className="text-xs text-red-600 mb-3">{error}</p>
          )}

          {editing ? (
            <div className="space-y-3">
              {/* Preferred delivery */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Preferred delivery
                </label>
                <select
                  value={form.preferredDelivery}
                  onChange={e => setForm(f => ({ ...f, preferredDelivery: e.target.value }))}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded-lg
                             text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                >
                  <option value="">Unknown</option>
                  <option value="pickup">Pickup by lead</option>
                  <option value="dropped">Dropped off by professor</option>
                  <option value="delivery">Delivery to room</option>
                </select>
              </div>

              {/* Typical materials */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Typical materials
                </label>
                <textarea
                  value={form.typicalMaterials}
                  onChange={e => setForm(f => ({ ...f, typicalMaterials: e.target.value }))}
                  rows={2}
                  placeholder="e.g. Scientific calculator, one-page cue sheet"
                  className="w-full px-2 py-1.5 border border-gray-300 rounded-lg
                             text-sm resize-none focus:outline-none focus:ring-2
                             focus:ring-brand-600"
                />
              </div>

              {/* Password reminder */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.passwordReminder}
                  onChange={e => setForm(f => ({ ...f, passwordReminder: e.target.checked }))}
                  className="accent-brand-600"
                />
                <span className="text-xs text-gray-700">
                  Password reminder — always ask for a password
                </span>
              </label>

              {/* Notes */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Notes for leads
                </label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  rows={3}
                  placeholder="Anything leads should know about this professor or course…"
                  className="w-full px-2 py-1.5 border border-gray-300 rounded-lg
                             text-sm resize-none focus:outline-none focus:ring-2
                             focus:ring-brand-600"
                />
              </div>
            </div>

          ) : dossier ? (
            <div className="space-y-2 text-sm">
              {dossier.preferred_delivery && (
                <div className="flex gap-2">
                  <span className="text-xs text-gray-500 w-28 shrink-0">Delivery</span>
                  <span className="text-xs text-gray-800">
                    {DELIVERY_LABELS[dossier.preferred_delivery]}
                  </span>
                </div>
              )}
              {dossier.typical_materials && (
                <div className="flex gap-2">
                  <span className="text-xs text-gray-500 w-28 shrink-0">Materials</span>
                  <span className="text-xs text-gray-800">{dossier.typical_materials}</span>
                </div>
              )}
              {dossier.password_reminder && (
                <div className="flex gap-2">
                  <span className="text-xs text-gray-500 w-28 shrink-0">Password</span>
                  <span className="text-xs text-amber-600 font-medium">
                    Always ask for password
                  </span>
                </div>
              )}
              {dossier.notes && (
                <div className="flex gap-2">
                  <span className="text-xs text-gray-500 w-28 shrink-0">Notes</span>
                  <span className="text-xs text-gray-700 italic">{dossier.notes}</span>
                </div>
              )}
              <p className="text-xs text-gray-400 pt-1">
                Updated {new Date(dossier.updated_at).toLocaleDateString('en-CA', {
                  month: 'short', day: 'numeric', year: 'numeric',
                })}
                {dossier.last_updated_by_name && ` by ${dossier.last_updated_by_name}`}
              </p>
            </div>
          ) : (
            <p className="text-xs text-gray-400 py-1">
              No dossier yet for {exam?.course_code}. Add one to help future leads.
            </p>
          )}
        </div>
      </div>

    </div>
  );
}
