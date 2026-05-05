import { useState, useEffect } from 'react';
import { api }   from '../../lib/api.js';
import { toast } from '../ui/Toast.jsx';
import Spinner   from '../ui/Spinner.jsx';
import Modal     from '../ui/Modal.jsx';

// ── Accommodation Codes Section ───────────────────────────────────────────────

function AccommodationCodesSection() {
  const [codes,   setCodes]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding,  setAdding]  = useState(false);
  const [editId,  setEditId]  = useState(null);
  const [saving,  setSaving]  = useState(false);
  const [form, setForm] = useState({ code: '', label: '', triggers_rwg_flag: false, prefers_solo_room: false });

  useEffect(() => {
    api.get('/institution/accommodation-codes')
      .then(res => setCodes(res.data ?? []))
      .catch(err => toast(err.message, 'error'))
      .finally(() => setLoading(false));
  }, []);

  function startEdit(c) {
    setEditId(c.id);
    setForm({ code: c.code, label: c.label, triggers_rwg_flag: c.triggers_rwg_flag, prefers_solo_room: c.prefers_solo_room });
    setAdding(false);
  }

  function cancelForm() {
    setAdding(false); setEditId(null);
    setForm({ code: '', label: '', triggers_rwg_flag: false, prefers_solo_room: false });
  }

  async function handleAdd() {
    if (!form.code.trim())  return toast('Code is required', 'error');
    if (!form.label.trim()) return toast('Label is required', 'error');
    setSaving(true);
    try {
      const res = await api.post('/institution/accommodation-codes', form);
      setCodes(prev => [...prev, res.data].sort((a, b) => a.code.localeCompare(b.code)));
      cancelForm();
      toast('Accommodation code added');
    } catch (err) { toast(err.message, 'error'); }
    finally { setSaving(false); }
  }

  async function handleEdit() {
    if (!form.label.trim()) return toast('Label is required', 'error');
    setSaving(true);
    try {
      const res = await api.patch(`/institution/accommodation-codes/${editId}`, {
        label: form.label, triggers_rwg_flag: form.triggers_rwg_flag, prefers_solo_room: form.prefers_solo_room,
      });
      setCodes(prev => prev.map(c => c.id === editId ? res.data : c));
      cancelForm();
      toast('Code updated');
    } catch (err) { toast(err.message, 'error'); }
    finally { setSaving(false); }
  }

  async function handleToggleActive(c) {
    try {
      const res = await api.patch(`/institution/accommodation-codes/${c.id}`, { is_active: !c.is_active });
      setCodes(prev => prev.map(x => x.id === c.id ? res.data : x));
      toast(res.data.is_active ? 'Code unhidden' : 'Code hidden');
    } catch (err) { toast(err.message, 'error'); }
  }

  async function handleDelete(c) {
    if (!window.confirm(`Delete code "${c.code}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/institution/accommodation-codes/${c.id}`);
      setCodes(prev => prev.filter(x => x.id !== c.id));
      toast('Code deleted');
    } catch (err) { toast(err.message, 'error'); }
  }

  if (loading) return <div className="flex justify-center py-6"><Spinner /></div>;

  const activeCodes = codes.filter(c => c.is_active);
  const hiddenCodes = codes.filter(c => !c.is_active);

  return (
    <div className="mb-10">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Accommodation Codes</h2>
          <p className="text-xs text-gray-500 mt-0.5">Manage the accommodation codes available for students</p>
        </div>
        {!adding && !editId && (
          <button
            onClick={() => setAdding(true)}
            className="px-3 py-1.5 text-xs font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors"
          >
            + Add code
          </button>
        )}
      </div>

      {adding && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
          <p className="text-xs font-semibold text-gray-700 mb-3">New accommodation code</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Code *</label>
              <input
                type="text" value={form.code} placeholder="e.g. READER"
                onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Label *</label>
              <input
                type="text" value={form.label} placeholder="e.g. Reader / Scribe"
                onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            </div>
            <div className="col-span-2 flex gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.triggers_rwg_flag} onChange={e => setForm(f => ({ ...f, triggers_rwg_flag: e.target.checked }))} className="rounded border-gray-300 text-brand-600 focus:ring-brand-400" />
                <span className="text-xs text-gray-700">Triggers RWG flag (strictly solo room)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.prefers_solo_room} onChange={e => setForm(f => ({ ...f, prefers_solo_room: e.target.checked }))} className="rounded border-gray-300 text-brand-600 focus:ring-brand-400" />
                <span className="text-xs text-gray-700">Prefers solo room</span>
              </label>
            </div>
          </div>
          <div className="flex gap-2 justify-end mt-3">
            <button onClick={cancelForm} className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5">Cancel</button>
            <button
              onClick={handleAdd} disabled={saving}
              className="px-4 py-1.5 text-xs font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : 'Add code'}
            </button>
          </div>
        </div>
      )}

      {editId && (
        <Modal title={`Edit — ${form.code}`} onClose={cancelForm} width="max-w-md">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Label *</label>
              <input
                type="text" value={form.label} placeholder="e.g. Reader / Scribe"
                onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            </div>
            <div className="col-span-2 flex flex-col gap-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.triggers_rwg_flag} onChange={e => setForm(f => ({ ...f, triggers_rwg_flag: e.target.checked }))} className="rounded border-gray-300 text-brand-600 focus:ring-brand-400" />
                <span className="text-xs text-gray-700">Triggers RWG flag (strictly solo room)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.prefers_solo_room} onChange={e => setForm(f => ({ ...f, prefers_solo_room: e.target.checked }))} className="rounded border-gray-300 text-brand-600 focus:ring-brand-400" />
                <span className="text-xs text-gray-700">Prefers solo room</span>
              </label>
            </div>
          </div>
          <div className="flex gap-2 justify-end mt-4">
            <button onClick={cancelForm} className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5">Cancel</button>
            <button
              onClick={handleEdit} disabled={saving}
              className="px-4 py-1.5 text-xs font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </Modal>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Code</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Label</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Flags</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {activeCodes.map(c => (
              <CodeRow key={c.id} c={c} onEdit={startEdit} onToggle={handleToggleActive} onDelete={handleDelete} />
            ))}
            {hiddenCodes.map(c => (
              <CodeRow key={c.id} c={c} onEdit={startEdit} onToggle={handleToggleActive} onDelete={handleDelete} hidden />
            ))}
            {!codes.length && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-400">No accommodation codes</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CodeRow({ c, onEdit, onToggle, onDelete, hidden }) {
  return (
    <tr className={hidden ? 'opacity-50' : 'hover:bg-gray-50'}>
      <td className="px-4 py-3 font-mono text-xs font-medium text-gray-900">{c.code}</td>
      <td className="px-4 py-3 text-xs text-gray-600">{c.label}</td>
      <td className="px-4 py-3">
        <div className="flex gap-1 flex-wrap">
          {c.triggers_rwg_flag && <span className="px-1.5 py-0.5 rounded text-xs bg-purple-50 text-purple-700">RWG</span>}
          {c.prefers_solo_room && <span className="px-1.5 py-0.5 rounded text-xs bg-yellow-50 text-yellow-700">Solo</span>}
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex gap-2 justify-end">
          {!hidden && <button onClick={() => onEdit(c)} className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100">Edit</button>}
          <button onClick={() => onToggle(c)} className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100">
            {hidden ? 'Unhide' : 'Hide'}
          </button>
          <button onClick={() => onDelete(c)} className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50">Delete</button>
        </div>
      </td>
    </tr>
  );
}

// ── Feature Requirements Section ──────────────────────────────────────────────

function FeatureRequirementsSection({ availableFeatures }) {
  const [mappings, setMappings] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(null);

  useEffect(() => {
    api.get('/institution/accommodation-feature-mappings')
      .then(res => setMappings(res.data ?? []))
      .catch(err => toast(err.message, 'error'))
      .finally(() => setLoading(false));
  }, []);

  async function handleToggle(accomId, featureCode, currentFeatures) {
    const updated = currentFeatures.includes(featureCode)
      ? currentFeatures.filter(f => f !== featureCode)
      : [...currentFeatures, featureCode];
    setSaving(accomId);
    try {
      await api.put(`/institution/accommodation-feature-mappings/${accomId}`, { featureCodes: updated });
      setMappings(prev => prev.map(m => m.id === accomId ? { ...m, required_features: updated } : m));
    } catch (err) { toast(err.message, 'error'); }
    finally { setSaving(null); }
  }

  if (loading) return <div className="flex justify-center py-6"><Spinner /></div>;
  if (!availableFeatures.length) return (
    <div>
      <h2 className="text-base font-semibold text-gray-900 mb-1">Accommodation Feature Requirements</h2>
      <p className="text-xs text-gray-400">No room features defined yet. Add features in the Room Setup tab first.</p>
    </div>
  );

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-base font-semibold text-gray-900">Accommodation Feature Requirements</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Map which room features each accommodation code requires during scheduling
        </p>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 w-32">Code</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Label</th>
              {availableFeatures.map(f => (
                <th key={f.code} className="px-4 py-2.5 text-xs font-medium text-gray-500 text-center whitespace-nowrap">
                  {f.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {mappings.map(m => (
              <tr key={m.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-xs font-medium text-gray-900">{m.code}</td>
                <td className="px-4 py-3 text-xs text-gray-600">{m.label}</td>
                {availableFeatures.map(f => {
                  const checked  = (m.required_features ?? []).includes(f.code);
                  const isSaving = saving === m.id;
                  return (
                    <td key={f.code} className="px-4 py-3 text-center">
                      <input
                        type="checkbox" checked={checked} disabled={isSaving}
                        onChange={() => handleToggle(m.id, f.code, m.required_features ?? [])}
                        className="rounded border-gray-300 text-brand-600 focus:ring-brand-400 disabled:opacity-50"
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
            {!mappings.length && (
              <tr><td colSpan={2 + availableFeatures.length} className="px-4 py-8 text-center text-sm text-gray-400">No accommodation codes</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────

export default function AccommodationsTab() {
  const [availableFeatures, setAvailableFeatures] = useState([]);

  useEffect(() => {
    api.get('/institution/room-features')
      .then(res => setAvailableFeatures(res.data ?? []))
      .catch(() => {});
  }, []);

  return (
    <div>
      <AccommodationCodesSection />
      <FeatureRequirementsSection availableFeatures={availableFeatures} />
    </div>
  );
}
