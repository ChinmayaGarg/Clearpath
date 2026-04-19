import { useState, useEffect } from 'react';
import { api }   from '../../lib/api.js';
import { toast } from '../ui/Toast.jsx';
import Spinner   from '../ui/Spinner.jsx';

export default function RoomsTab() {
  const [rooms,   setRooms]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding,  setAdding]  = useState(false);  // show add form
  const [editId,  setEditId]  = useState(null);   // id being edited
  const [saving,  setSaving]  = useState(false);

  // Form state (shared by add + edit)
  const [form, setForm] = useState({ name: '', capacity: '', notes: '' });

  useEffect(() => {
    api.get('/institution/rooms')
      .then(res => setRooms(res.data ?? []))
      .catch(err => toast(err.message, 'error'))
      .finally(() => setLoading(false));
  }, []);

  function startEdit(room) {
    setEditId(room.id);
    setForm({ name: room.name, capacity: String(room.capacity), notes: room.notes ?? '' });
    setAdding(false);
  }

  function cancelForm() {
    setAdding(false);
    setEditId(null);
    setForm({ name: '', capacity: '', notes: '' });
  }

  async function handleAdd() {
    const cap = parseInt(form.capacity, 10);
    if (!form.name.trim()) return toast('Room name is required', 'error');
    if (!cap || cap < 1)   return toast('Capacity must be at least 1', 'error');
    setSaving(true);
    try {
      const res = await api.post('/institution/rooms', {
        name:     form.name.trim(),
        capacity: cap,
        notes:    form.notes.trim() || undefined,
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
        name:     form.name.trim(),
        capacity: cap,
        notes:    form.notes.trim() || undefined,
      });
      setRooms(prev =>
        prev.map(r => r.id === editId ? res.data : r)
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
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Exam Rooms</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Define the rooms available for scheduling exam bookings
          </p>
        </div>
        {!adding && !editId && (
          <button
            onClick={() => { setAdding(true); setForm({ name: '', capacity: '', notes: '' }); }}
            className="px-3 py-1.5 text-xs font-medium text-white bg-brand-600
                       hover:bg-brand-700 rounded-lg transition-colors"
          >
            + Add room
          </button>
        )}
      </div>

      {/* Add / Edit form */}
      {(adding || editId) && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
          <p className="text-xs font-semibold text-gray-700 mb-3">
            {adding ? 'New room' : 'Edit room'}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs text-gray-500 mb-1">Room name *</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Room 101"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                           focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Capacity *</label>
              <input
                type="number"
                min="1"
                max="200"
                value={form.capacity}
                onChange={e => setForm(f => ({ ...f, capacity: e.target.value }))}
                placeholder="e.g. 4"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                           focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Notes (optional)</label>
              <input
                type="text"
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="e.g. Accessible, computer available"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                           focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end mt-3">
            <button onClick={cancelForm} className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5">
              Cancel
            </button>
            <button
              onClick={adding ? handleAdd : handleEdit}
              disabled={saving}
              className="px-4 py-1.5 text-xs font-medium text-white bg-brand-600
                         hover:bg-brand-700 rounded-lg disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : adding ? 'Add room' : 'Save changes'}
            </button>
          </div>
        </div>
      )}

      {/* Room list */}
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
                  <td className="px-4 py-3 text-xs text-gray-400">{room.notes || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => startEdit(room)}
                        className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(room.id, room.name)}
                        className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50"
                      >
                        Remove
                      </button>
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
