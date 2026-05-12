import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import TopNav from '../components/ui/TopNav.jsx';
import { api } from '../lib/api.js';
import { toast } from '../components/ui/Toast.jsx';
import Spinner from '../components/ui/Spinner.jsx';
import ExamSidePanel from '../components/exams/ExamSidePanel.jsx';

const DELIVERY_LABELS = {
  pending:     'Not confirmed',
  dropped:     'Prof drop-off',
  pickup:      'AC picks up',
  delivery:    'Delivered to room',
  file_upload: 'File upload',
};

const DELIVERY_BADGE = {
  file_upload: 'bg-blue-100 text-blue-700',
  dropped:     'bg-amber-100 text-amber-700',
  pickup:      'bg-green-100 text-green-700',
  delivery:    'bg-purple-100 text-purple-700',
  pending:     'bg-gray-100 text-gray-500',
};

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-CA', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function ExamRow({ exam, onClick }) {
  const typeParts = [exam.exam_type_label, exam.version_label].filter(Boolean);
  const typeLabel = typeParts.join(' · ');

  const firstDate = exam.dates?.[0];
  const extraDates = (exam.dates?.length ?? 0) - 1;

  const fileCount = (exam.file_path ? 1 : 0) + (exam.extra_files?.length ?? 0);

  return (
    <tr
      onClick={onClick}
      className="hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-0"
    >
      <td className="px-4 py-3">
        <span className="font-medium text-gray-900 text-sm font-mono">{exam.course_code}</span>
      </td>
      <td className="px-4 py-3 text-sm text-gray-600">
        {typeLabel || <span className="text-gray-300">—</span>}
      </td>
      <td className="px-4 py-3 text-sm text-gray-600">
        {exam.prof_first} {exam.prof_last}
      </td>
      <td className="px-4 py-3 text-sm text-gray-500">
        {firstDate ? (
          <>
            {formatDate(firstDate.exam_date)}
            {extraDates > 0 && (
              <span className="ml-1 text-xs text-gray-400">+{extraDates} more</span>
            )}
          </>
        ) : '—'}
      </td>
      <td className="px-4 py-3">
        <span className={`text-xs px-2 py-0.5 rounded font-medium ${
          DELIVERY_BADGE[exam.delivery] ?? 'bg-gray-100 text-gray-600'
        }`}>
          {DELIVERY_LABELS[exam.delivery] ?? exam.delivery ?? '—'}
        </span>
      </td>
      <td className="px-4 py-3 text-center">
        {fileCount > 0 ? (
          <span className="text-xs text-gray-500">📎 {fileCount}</span>
        ) : (
          <span className="text-gray-300 text-xs">—</span>
        )}
      </td>
    </tr>
  );
}

export default function Exams() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [exams, setExams] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const selectedId = searchParams.get('id');
  const selectedExam = exams.find(e => String(e.upload_id) === selectedId) ?? null;

  function selectExam(id) { setSearchParams(id ? { id } : {}); }

  async function load() {
    setLoading(true);
    try {
      const data = await api.get('/prep/exams');
      setExams(data.uploads ?? []);
      setFiltered(data.uploads ?? []);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line

  useEffect(() => {
    const q = search.toLowerCase().trim();
    if (!q) { setFiltered(exams); return; }
    setFiltered(
      exams.filter(e =>
        e.course_code.toLowerCase().includes(q) ||
        `${e.prof_first} ${e.prof_last}`.toLowerCase().includes(q) ||
        (e.exam_type_label ?? '').toLowerCase().includes(q),
      ),
    );
  }, [search, exams]);

  return (
    <div className="min-h-screen bg-gray-50">
      <TopNav />

      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Exam uploads</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {exams.length} submitted exam{exams.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="mb-4">
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by course, professor, or type…"
            className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-lg
                       text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
          />
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-sm text-gray-400">
            {search ? 'No exams match your search' : 'No submitted exam uploads yet'}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Course</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Type</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Professor</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Date(s)</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Delivery</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-gray-500">Files</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(e => (
                  <ExamRow
                    key={e.upload_id}
                    exam={e}
                    onClick={() => selectExam(e.upload_id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedExam && (
        <ExamSidePanel
          exam={selectedExam}
          onClose={() => selectExam(null)}
        />
      )}
    </div>
  );
}
