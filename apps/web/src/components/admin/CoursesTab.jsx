import { useState, useEffect } from 'react';
import { api }   from '../../lib/api.js';
import { toast } from '../ui/Toast.jsx';
import Spinner   from '../ui/Spinner.jsx';

const EMPTY_FORM = { code: '', name: '', department: '' };

export default function CoursesTab() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding,  setAdding]  = useState(false);
  const [editId,  setEditId]  = useState(null);
  const [saving,  setSaving]  = useState(false);
  const [form,    setForm]    = useState(EMPTY_FORM);
  const [editForm, setEditForm] = useState(EMPTY_FORM);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await api.get('/institution/course-list');
      setCourses(res.courses ?? []);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd() {
    if (!form.code.trim()) return toast('Course code is required', 'error');
    setSaving(true);
    try {
      const res = await api.post('/institution/course-list', {
        code:       form.code.trim().toUpperCase(),
        name:       form.name.trim()       || null,
        department: form.department.trim() || null,
      });
      setCourses(prev => [...prev, res.course].sort((a, b) => a.code.localeCompare(b.code)));
      setForm(EMPTY_FORM);
      setAdding(false);
      toast('Course added', 'success');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  function startEdit(course) {
    setEditId(course.id);
    setEditForm({
      code:       course.code,
      name:       course.name       ?? '',
      department: course.department ?? '',
    });
    setAdding(false);
  }

  function cancelEdit() {
    setEditId(null);
    setEditForm(EMPTY_FORM);
  }

  async function handleSaveEdit(id) {
    setSaving(true);
    try {
      const res = await api.patch(`/institution/course-list/${id}`, {
        name:       editForm.name.trim()       || null,
        department: editForm.department.trim() || null,
      });
      setCourses(prev => prev.map(c => c.id === id ? res.course : c));
      setEditId(null);
      toast('Course updated', 'success');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate(id, code) {
    if (!confirm(`Deactivate ${code}? It will no longer appear in dropdowns.`)) return;
    try {
      await api.delete(`/institution/course-list/${id}`);
      setCourses(prev => prev.filter(c => c.id !== id));
      toast('Course deactivated', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Courses</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Master list of courses offered by this institution
          </p>
        </div>
        {!adding && (
          <button
            onClick={() => { setAdding(true); setEditId(null); }}
            className="px-3 py-1.5 bg-brand-600 hover:bg-brand-800 text-white
                       text-sm font-medium rounded-lg transition-colors"
          >
            + Add course
          </button>
        )}
      </div>

      {/* Add form */}
      {adding && (
        <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
          <p className="text-sm font-medium text-gray-700">New course</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Code <span className="text-red-500">*</span>
              </label>
              <input
                value={form.code}
                onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                placeholder="e.g. CSCI 1100"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                           focus:outline-none focus:ring-2 focus:ring-brand-600"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Name</label>
              <input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Introduction to CS"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                           focus:outline-none focus:ring-2 focus:ring-brand-600"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Department</label>
              <input
                value={form.department}
                onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
                placeholder="e.g. Computer Science"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                           focus:outline-none focus:ring-2 focus:ring-brand-600"
              />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => { setAdding(false); setForm(EMPTY_FORM); }}
              className="px-4 py-2 border border-gray-300 text-gray-600 text-sm rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={saving}
              className="px-4 py-2 bg-brand-600 hover:bg-brand-800 text-white text-sm
                         font-medium rounded-lg disabled:opacity-50 transition-colors"
            >
              {saving ? 'Adding…' : 'Add course'}
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : courses.length === 0 ? (
        <div className="text-center py-16 text-sm text-gray-400">
          No courses yet — add one to get started
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Code</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Name</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Department</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {courses.map(course => (
                <tr key={course.id} className="border-b border-gray-100 last:border-0">
                  {editId === course.id ? (
                    <>
                      <td className="px-4 py-2">
                        <span className="text-sm font-mono font-medium text-gray-900">
                          {course.code}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <input
                          value={editForm.name}
                          onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm
                                     focus:outline-none focus:ring-2 focus:ring-brand-600"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          value={editForm.department}
                          onChange={e => setEditForm(f => ({ ...f, department: e.target.value }))}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm
                                     focus:outline-none focus:ring-2 focus:ring-brand-600"
                        />
                      </td>
                      <td className="px-4 py-2 text-right whitespace-nowrap">
                        <div className="flex justify-end gap-3">
                          <button onClick={cancelEdit}
                            className="text-xs text-gray-400 hover:text-gray-600">
                            Cancel
                          </button>
                          <button onClick={() => handleSaveEdit(course.id)} disabled={saving}
                            className="text-xs text-brand-600 hover:text-brand-800 font-medium disabled:opacity-50">
                            {saving ? 'Saving…' : 'Save'}
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-3 text-sm font-mono font-medium text-gray-900">
                        {course.code}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {course.name ?? <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {course.department ?? <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="flex justify-end gap-3">
                          <button onClick={() => startEdit(course)}
                            className="text-xs text-brand-600 hover:text-brand-800 font-medium">
                            Edit
                          </button>
                          <button onClick={() => handleDeactivate(course.id, course.code)}
                            className="text-xs text-gray-400 hover:text-red-600">
                            Deactivate
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
