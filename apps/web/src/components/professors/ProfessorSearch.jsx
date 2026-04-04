/**
 * Inline professor search/link for the exam edit modal.
 * Searches as the user types and lets them link a professor to the exam.
 */
import { useState, useEffect, useRef } from 'react';
import { api }                         from '../../lib/api.js';
import { toast }                       from '../ui/Toast.jsx';

export default function ProfessorSearch({ exam, onLinked }) {
  const [query,     setQuery]     = useState('');
  const [results,   setResults]   = useState([]);
  const [searching, setSearching] = useState(false);
  const [linking,   setLinking]   = useState(false);
  const [open,      setOpen]      = useState(false);
  const debounce                  = useRef(null);
  const wrapperRef                = useRef(null);

  // Current linked professor display name
  const linked = exam.professor_name
    ? `${exam.professor_name} (${exam.professor_email ?? ''})`
    : null;

  useEffect(() => {
    function handleClick(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function handleInput(e) {
    const q = e.target.value;
    setQuery(q);
    setOpen(true);

    clearTimeout(debounce.current);
    if (q.length < 2) { setResults([]); return; }

    debounce.current = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await api.get(`/professors/search?q=${encodeURIComponent(q)}`);
        setResults(data.professors);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  }

  async function handleLink(professor) {
    setLinking(true);
    setOpen(false);
    setQuery('');
    try {
      await api.post(`/professors/${professor.id}/link/${exam.id}`, {});
      toast(`Linked to ${professor.first_name} ${professor.last_name}`, 'success');
      onLinked?.();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLinking(false);
    }
  }

  return (
    <div ref={wrapperRef} className="relative">
      <label className="block text-xs font-medium text-gray-700 mb-1">
        Professor
      </label>

      {/* Current link */}
      {linked && (
        <div className="flex items-center gap-2 mb-2 px-3 py-1.5 bg-teal-50
                        border border-teal-200 rounded-lg text-xs text-teal-800">
          <span className="flex-1 truncate">{linked}</span>
          <button
            onClick={() => handleLink({ id: null })}
            className="text-teal-400 hover:text-teal-600 shrink-0"
            title="Unlink professor"
          >
            ×
          </button>
        </div>
      )}

      {/* Search input */}
      <input
        type="search"
        value={query}
        onChange={handleInput}
        onFocus={() => query.length >= 2 && setOpen(true)}
        placeholder={linked ? 'Search to change professor…' : 'Search by name or email…'}
        disabled={linking}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                   focus:outline-none focus:ring-2 focus:ring-brand-600
                   disabled:opacity-50"
      />

      {/* Dropdown */}
      {open && (query.length >= 2) && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border
                        border-gray-200 rounded-xl shadow-lg z-20 overflow-hidden">
          {searching ? (
            <div className="px-4 py-3 text-xs text-gray-400">Searching…</div>
          ) : results.length === 0 ? (
            <div className="px-4 py-3 text-xs text-gray-400">
              No professors found — add them in the Professor directory
            </div>
          ) : (
            results.map(p => (
              <button
                key={p.id}
                onClick={() => handleLink(p)}
                className="w-full text-left px-4 py-2.5 hover:bg-gray-50
                           transition-colors border-b border-gray-50 last:border-0"
              >
                <div className="text-sm font-medium text-gray-900">
                  {p.first_name} {p.last_name}
                </div>
                <div className="text-xs text-gray-500">
                  {p.email}
                  {p.department && ` · ${p.department}`}
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
