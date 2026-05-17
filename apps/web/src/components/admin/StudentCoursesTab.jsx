import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { toast } from '../ui/Toast.jsx';
import Spinner from '../ui/Spinner.jsx';

function StudentSearch({ onSelect }) {
  const [query,   setQuery]   = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const timerRef              = useRef(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const q = query.trim();
    if (!q) { setResults([]); return; }

    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await api.get(`/counsellor/students?q=${encodeURIComponent(q)}`);
        setResults(data.students ?? []);
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timerRef.current);
  }, [query]);

  return (
    <div className="max-w-lg">
      <div className="relative mb-4">
        <input
          autoFocus
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search by name, student number, or email…"
          className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm
                     focus:outline-none focus:ring-2 focus:ring-brand-600 pr-10"
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="w-4 h-4 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {!query.trim() && (
        <p className="text-sm text-gray-400 text-center py-8">
          Search by name, student number, or email to get started
        </p>
      )}

      {query.trim() && !loading && results.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-8">
          No students found matching &quot;{query.trim()}&quot;
        </p>
      )}

      {results.length > 0 && (
        <div className="space-y-1">
          {results.map(s => {
            const name = [s.first_name, s.last_name].filter(Boolean).join(' ');
            return (
              <button
                key={s.id}
                onClick={() => onSelect(s)}
                className="w-full text-left px-4 py-3 rounded-xl border border-gray-200
                           bg-white hover:bg-gray-50 transition-colors"
              >
                <span className="text-sm font-medium text-gray-900">{name}</span>
                {s.student_number && (
                  <span className="ml-2 text-xs text-gray-400">#{s.student_number}</span>
                )}
                <div className="text-xs text-gray-400 mt-0.5">{s.email}</div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CourseCombobox({ value, onChange, allCourses }) {
  const [query,     setQuery]     = useState('');
  const [open,      setOpen]      = useState(false);
  const closeTimer                = useRef(null);

  const filtered = query.trim()
    ? allCourses.filter(c => c.code.toUpperCase().includes(query.toUpperCase()))
    : allCourses;

  function selectCourse(code) {
    onChange(code);
    setQuery('');
    setOpen(false);
  }

  function handleBlur() {
    closeTimer.current = setTimeout(() => setOpen(false), 150);
  }

  function handleFocus() {
    clearTimeout(closeTimer.current);
    setOpen(true);
  }

  return (
    <div className="relative flex-1">
      <input
        autoFocus
        value={value ? value : query}
        onChange={e => {
          const v = e.target.value.toUpperCase();
          if (value) onChange('');
          setQuery(v);
          setOpen(true);
        }}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder="Search course code…"
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                   focus:outline-none focus:ring-2 focus:ring-brand-600"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-20 left-0 right-0 mt-1 bg-white border border-gray-200
                       rounded-lg shadow-lg max-h-52 overflow-y-auto">
          {filtered.map(c => (
            <li key={c.id}>
              <button
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => selectCourse(c.code)}
                className="w-full text-left px-3 py-2 hover:bg-brand-50 transition-colors
                           flex items-center gap-2"
              >
                <span className="text-sm font-mono font-medium text-gray-900">{c.code}</span>
                {c.name && (
                  <span className="text-xs text-gray-400">· {c.name}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && query.trim() && filtered.length === 0 && (
        <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-gray-200
                        rounded-lg shadow-lg px-3 py-2 text-sm text-gray-400">
          No matching courses
        </div>
      )}
    </div>
  );
}

function StudentCourses({ student, onBack }) {
  const [courses,        setCourses]        = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [showForm,       setShowForm]       = useState(false);
  const [courseInput,    setCourseInput]    = useState('');
  const [savingCourse,   setSavingCourse]   = useState(false);
  const [allCourses,     setAllCourses]     = useState([]);

  const name = [student.first_name, student.last_name].filter(Boolean).join(' ');

  async function loadCourses() {
    try {
      const data = await api.get(`/counsellor/students/${student.id}/courses`);
      setCourses(data.courses ?? []);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCourses();
    api.get('/institution/course-list').then(d => setAllCourses(d.courses ?? [])).catch(() => {});
  }, [student.id]); // eslint-disable-line

  async function handleAdd(e) {
    e.preventDefault();
    const code = courseInput.trim().toUpperCase();
    if (!code) { toast('Enter a course code', 'warning'); return; }
    setSavingCourse(true);
    try {
      await api.post(`/counsellor/students/${student.id}/courses`, { courseCode: code });
      toast('Course added', 'success');
      setCourseInput('');
      setShowForm(false);
      loadCourses();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSavingCourse(false);
    }
  }

  async function handleRemove(courseCode) {
    try {
      await api.delete(`/counsellor/students/${student.id}/courses/${encodeURIComponent(courseCode)}`);
      toast('Course removed', 'success');
      loadCourses();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  return (
    <div className="max-w-lg">
      {/* Back + student header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={onBack}
          className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
        >
          ← Back
        </button>
        <div>
          <span className="text-base font-semibold text-gray-900">{name}</span>
          {student.student_number && (
            <span className="ml-2 text-sm text-gray-400">#{student.student_number}</span>
          )}
        </div>
      </div>

      {/* Courses card */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-900">Courses</h3>
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="px-3 py-1.5 bg-brand-600 hover:bg-brand-800 text-white
                         text-xs font-medium rounded-lg transition-colors"
            >
              + Add course
            </button>
          )}
        </div>

        {showForm && (
          <form onSubmit={handleAdd} className="flex gap-2 mb-3">
            <CourseCombobox
              value={courseInput}
              onChange={setCourseInput}
              allCourses={allCourses}
            />
            <button
              type="button"
              onClick={() => { setShowForm(false); setCourseInput(''); }}
              className="px-3 py-2 border border-gray-300 text-gray-700 text-sm
                         rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingCourse}
              className="px-3 py-2 bg-brand-600 hover:bg-brand-800 text-white text-sm
                         font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {savingCourse ? 'Adding…' : 'Add'}
            </button>
          </form>
        )}

        {loading ? (
          <div className="flex justify-center py-4"><Spinner /></div>
        ) : courses.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">
            No manually-added courses
          </p>
        ) : (
          <div className="space-y-1.5">
            {courses.map(c => {
              const profName = [c.prof_first_name, c.prof_last_name].filter(Boolean).join(' ');
              return (
                <div
                  key={c.id}
                  className="flex items-center justify-between px-3 py-2 rounded-lg
                             border border-gray-100 bg-gray-50"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-medium font-mono text-gray-800">
                      {c.course_code}
                    </span>
                    {profName && (
                      c.professor_id ? (
                        <Link
                          to={`/professors?id=${c.professor_id}`}
                          className="text-xs text-brand-600 hover:text-brand-800 hover:underline transition-colors truncate"
                        >
                          {profName}
                        </Link>
                      ) : (
                        <span className="text-xs text-gray-400 truncate">{profName}</span>
                      )
                    )}
                  </div>
                  <button
                    onClick={() => handleRemove(c.course_code)}
                    className="text-xs text-gray-400 hover:text-red-500 transition-colors px-2 py-1 shrink-0"
                  >
                    Remove
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function StudentCoursesTab() {
  const [selected, setSelected] = useState(null);

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-900">Link Students to Courses</h2>
        <p className="text-sm text-gray-500 mt-1">
          Search for a student and manage their manually-linked course codes
        </p>
      </div>

      {selected ? (
        <StudentCourses student={selected} onBack={() => setSelected(null)} />
      ) : (
        <StudentSearch onSelect={setSelected} />
      )}
    </div>
  );
}
