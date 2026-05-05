import { useState, useEffect, useCallback } from 'react';
import { api }   from '../../lib/api.js';
import { toast } from '../ui/Toast.jsx';
import Spinner   from '../ui/Spinner.jsx';

// ── Rooms Section ─────────────────────────────────────────────────────────────

function RoomsSection({ availableFeatures }) {
  const [rooms,   setRooms]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding,  setAdding]  = useState(false);
  const [editId,  setEditId]  = useState(null);
  const [saving,  setSaving]  = useState(false);
  const [form, setForm] = useState({ name: '', capacity: '', notes: '', features: [] });

  const loadRooms = useCallback(() => {
    api.get('/institution/rooms')
      .then(res => setRooms(res.data ?? []))
      .catch(err => toast(err.message, 'error'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadRooms(); }, [loadRooms]);

  function startEdit(room) {
    setEditId(room.id);
    setForm({ name: room.name, capacity: String(room.capacity), notes: room.notes ?? '', features: room.features ?? [] });
    setAdding(false);
  }

  function cancelForm() {
    setAdding(false);
    setEditId(null);
    setForm({ name: '', capacity: '', notes: '', features: [] });
  }

  function toggleFeature(code) {
    setForm(f => ({
      ...f,
      features: f.features.includes(code) ? f.features.filter(c => c !== code) : [...f.features, code],
    }));
  }

  async function handleAdd() {
    const cap = parseInt(form.capacity, 10);
    if (!form.name.trim()) return toast('Room name is required', 'error');
    if (!cap || cap < 1)   return toast('Capacity must be at least 1', 'error');
    setSaving(true);
    try {
      const res = await api.post('/institution/rooms', {
        name: form.name.trim(), capacity: cap, notes: form.notes.trim() || undefined, features: form.features,
      });
      setRooms(prev => [...prev, res.data].sort((a, b) => a.capacity - b.capacity || a.name.localeCompare(b.name)));
      cancelForm();
      toast('Room added');
    } catch (err) {
      toast(err.message, 'error');
    } finally { setSaving(false); }
  }

  async function handleEdit() {
    const cap = parseInt(form.capacity, 10);
    if (!form.name.trim()) return toast('Room name is required', 'error');
    if (!cap || cap < 1)   return toast('Capacity must be at least 1', 'error');
    setSaving(true);
    try {
      const res = await api.patch(`/institution/rooms/${editId}`, {
        name: form.name.trim(), capacity: cap, notes: form.notes.trim() || undefined, features: form.features,
      });
      setRooms(prev =>
        prev.map(r => r.id === editId ? { ...res.data, features: form.features } : r)
            .sort((a, b) => a.capacity - b.capacity || a.name.localeCompare(b.name)),
      );
      cancelForm();
      toast('Room updated');
    } catch (err) {
      toast(err.message, 'error');
    } finally { setSaving(false); }
  }

  async function handleDelete(id, name) {
    if (!window.confirm(`Remove room "${name}"?`)) return;
    try {
      await api.delete(`/institution/rooms/${id}`);
      setRooms(prev => prev.filter(r => r.id !== id));
      toast('Room removed');
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  if (loading) return <div className="flex justify-center py-10"><Spinner /></div>;

  return (
    <div className="mb-10">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Exam Rooms</h2>
          <p className="text-xs text-gray-500 mt-0.5">Define the rooms available for scheduling exam bookings</p>
        </div>
        {!adding && !editId && (
          <button
            onClick={() => { setAdding(true); setForm({ name: '', capacity: '', notes: '', features: [] }); }}
            className="px-3 py-1.5 text-xs font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors"
          >
            + Add room
          </button>
        )}
      </div>

      {(adding || editId) && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
          <p className="text-xs font-semibold text-gray-700 mb-3">{adding ? 'New room' : 'Edit room'}</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs text-gray-500 mb-1">Room name *</label>
              <input
                type="text" value={form.name} placeholder="e.g. Room 101"
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Capacity *</label>
              <input
                type="number" min="1" max="200" value={form.capacity} placeholder="e.g. 4"
                onChange={e => setForm(f => ({ ...f, capacity: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Notes (optional)</label>
              <input
                type="text" value={form.notes} placeholder="e.g. Accessible, ground floor"
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            </div>
            {availableFeatures.length > 0 && (
              <div className="col-span-2">
                <label className="block text-xs text-gray-500 mb-2">Room features</label>
                <div className="flex flex-wrap gap-3">
                  {availableFeatures.map(f => (
                    <label key={f.code} className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox" checked={form.features.includes(f.code)}
                        onChange={() => toggleFeature(f.code)}
                        className="rounded border-gray-300 text-brand-600 focus:ring-brand-400"
                      />
                      <span className="text-xs text-gray-700">{f.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="flex gap-2 justify-end mt-3">
            <button onClick={cancelForm} className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5">Cancel</button>
            <button
              onClick={adding ? handleAdd : handleEdit} disabled={saving}
              className="px-4 py-1.5 text-xs font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : adding ? 'Add room' : 'Save changes'}
            </button>
          </div>
        </div>
      )}

      {!rooms.length ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <p className="text-sm font-medium text-gray-700">No rooms defined</p>
          <p className="text-xs text-gray-400 mt-1">Add rooms to start scheduling exam bookings.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Room</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Capacity</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Features</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Notes</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rooms.map(room => (
                <tr key={room.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{room.name}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
                      {room.capacity} seat{room.capacity !== 1 ? 's' : ''}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(room.features ?? []).length > 0
                        ? room.features.map(code => {
                            const feat = availableFeatures.find(f => f.code === code);
                            return (
                              <span key={code} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700">
                                {feat?.label ?? code}
                              </span>
                            );
                          })
                        : <span className="text-xs text-gray-400">—</span>
                      }
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">{room.notes || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => startEdit(room)} className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100">Edit</button>
                      <button onClick={() => handleDelete(room.id, room.name)} className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50">Remove</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Manage Features Section ───────────────────────────────────────────────────

function ManageFeaturesSection({ onFeaturesChanged }) {
  const [features, setFeatures] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [adding,   setAdding]   = useState(false);
  const [editId,   setEditId]   = useState(null);
  const [saving,   setSaving]   = useState(false);
  const [form, setForm] = useState({ label: '' });

  const loadFeatures = useCallback(() => {
    api.get('/institution/room-features?all=true')
      .then(res => { setFeatures(res.data ?? []); onFeaturesChanged(res.data ?? []); })
      .catch(err => toast(err.message, 'error'))
      .finally(() => setLoading(false));
  }, [onFeaturesChanged]);

  useEffect(() => { loadFeatures(); }, [loadFeatures]);

  function startEdit(f) { setEditId(f.id); setForm({ label: f.label }); setAdding(false); }
  function cancelForm() { setAdding(false); setEditId(null); setForm({ label: '' }); }

  async function handleAdd() {
    if (!form.label.trim()) return toast('Label is required', 'error');
    setSaving(true);
    try {
      const res = await api.post('/institution/room-features', {
        code: form.label.trim().toLowerCase().replace(/\s+/g, '_'),
        label: form.label.trim(),
      });
      const updated = [...features, res.data].sort((a, b) => a.label.localeCompare(b.label));
      setFeatures(updated);
      onFeaturesChanged(updated.filter(f => f.is_active));
      cancelForm();
      toast('Feature added');
    } catch (err) {
      toast(err.message, 'error');
    } finally { setSaving(false); }
  }

  async function handleEdit() {
    if (!form.label.trim()) return toast('Label is required', 'error');
    setSaving(true);
    try {
      const res = await api.patch(`/institution/room-features/${editId}`, { label: form.label.trim() });
      const updated = features.map(f => f.id === editId ? res.data : f);
      setFeatures(updated);
      onFeaturesChanged(updated.filter(f => f.is_active));
      cancelForm();
      toast('Feature updated');
    } catch (err) {
      toast(err.message, 'error');
    } finally { setSaving(false); }
  }

  async function handleToggleActive(f) {
    try {
      const res = await api.patch(`/institution/room-features/${f.id}`, { is_active: !f.is_active });
      const updated = features.map(x => x.id === f.id ? res.data : x);
      setFeatures(updated);
      onFeaturesChanged(updated.filter(x => x.is_active));
      toast(res.data.is_active ? 'Feature unhidden' : 'Feature hidden');
    } catch (err) { toast(err.message, 'error'); }
  }

  async function handleDelete(f) {
    if (!window.confirm(`Delete feature "${f.label}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/institution/room-features/${f.id}`);
      const updated = features.filter(x => x.id !== f.id);
      setFeatures(updated);
      onFeaturesChanged(updated.filter(x => x.is_active));
      toast('Feature deleted');
    } catch (err) { toast(err.message, 'error'); }
  }

  if (loading) return <div className="flex justify-center py-6"><Spinner /></div>;

  const active = features.filter(f => f.is_active);
  const hidden = features.filter(f => !f.is_active);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Room Features</h2>
          <p className="text-xs text-gray-500 mt-0.5">Define the features that rooms can have (e.g. Computer, Whiteboard)</p>
        </div>
        {!adding && !editId && (
          <button
            onClick={() => setAdding(true)}
            className="px-3 py-1.5 text-xs font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors"
          >
            + Add feature
          </button>
        )}
      </div>

      {(adding || editId) && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
          <p className="text-xs font-semibold text-gray-700 mb-3">{adding ? 'New feature' : 'Edit feature'}</p>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">Label *</label>
              <input
                type="text" value={form.label} placeholder="e.g. Computer"
                onChange={e => setForm({ label: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            </div>
            <div className="flex gap-2 pb-0.5">
              <button onClick={cancelForm} className="text-xs text-gray-500 hover:text-gray-700 px-3 py-2">Cancel</button>
              <button
                onClick={adding ? handleAdd : handleEdit} disabled={saving}
                className="px-4 py-2 text-xs font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving…' : adding ? 'Add' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {!features.length ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-sm text-gray-400">No features defined yet</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Label</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Code</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {active.map(f => (
                <tr key={f.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-900">{f.label}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-400">{f.code}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => startEdit(f)} className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100">Edit</button>
                      <button onClick={() => handleToggleActive(f)} className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100">Hide</button>
                      <button onClick={() => handleDelete(f)} className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
              {hidden.map(f => (
                <tr key={f.id} className="opacity-50">
                  <td className="px-4 py-3 text-sm text-gray-900">{f.label}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-400">{f.code}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => handleToggleActive(f)} className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100">Unhide</button>
                      <button onClick={() => handleDelete(f)} className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────

export default function RoomsTab() {
  const [availableFeatures, setAvailableFeatures] = useState([]);

  return (
    <div>
      <RoomsSection availableFeatures={availableFeatures} />
      <ManageFeaturesSection onFeaturesChanged={setAvailableFeatures} />
    </div>
  );
}
