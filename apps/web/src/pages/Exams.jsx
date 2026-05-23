import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import TopNav from '../components/ui/TopNav.jsx';
import { api } from '../lib/api.js';
import { toast } from '../components/ui/Toast.jsx';
import Spinner from '../components/ui/Spinner.jsx';
import ExamSidePanel from '../components/exams/ExamSidePanel.jsx';

const DELIVERY_LABELS = {
  pending:     'Not confirmed',
  pickup:      'AC picks up',
  delivery:    'Delivered to room',
  file_upload: 'File upload',
};

const DELIVERY_BADGE = {
  file_upload:      'bg-blue-100 text-blue-700',
  dropped:          'bg-amber-100 text-amber-700',
  dropped_confirmed:'bg-green-100 text-green-700',
  pickup:           'bg-green-100 text-green-700',
  delivery:         'bg-purple-100 text-purple-700',
  pending:          'bg-gray-100 text-gray-500',
};

function deliveryLabel(delivery, dropoffConfirmedAt) {
  if (delivery === 'dropped') {
    return dropoffConfirmedAt ? 'Prof dropped off' : 'Prof will drop off';
  }
  return DELIVERY_LABELS[delivery] ?? delivery ?? '—';
}

function deliveryBadgeClass(delivery, dropoffConfirmedAt) {
  if (delivery === 'dropped') {
    return dropoffConfirmedAt ? DELIVERY_BADGE.dropped_confirmed : DELIVERY_BADGE.dropped;
  }
  return DELIVERY_BADGE[delivery] ?? 'bg-gray-100 text-gray-600';
}

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
        <span className={`text-xs px-2 py-0.5 rounded font-medium ${deliveryBadgeClass(exam.delivery, exam.dropoff_confirmed_at)}`}>
          {deliveryLabel(exam.delivery, exam.dropoff_confirmed_at)}
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
  const [deliveryFilter, setDeliveryFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');

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
    setFiltered(
      exams.filter(e => {
        if (deliveryFilter && e.delivery !== deliveryFilter) return false;
        if (dateFilter && !(e.dates ?? []).some(d => d.exam_date === dateFilter)) return false;
        if (!q) return true;
        return (
          e.course_code.toLowerCase().includes(q) ||
          `${e.prof_first} ${e.prof_last}`.toLowerCase().includes(q) ||
          (e.exam_type_label ?? '').toLowerCase().includes(q)
        );
      }),
    );
  }, [search, deliveryFilter, dateFilter, exams]);

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

        {/* Search + Filters */}
        <div className="mb-4 flex items-center gap-2 flex-wrap">
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by course, professor, or type…"
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-72
                       focus:outline-none focus:ring-2 focus:ring-brand-600"
          />
          <select
            value={deliveryFilter}
            onChange={e => setDeliveryFilter(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-2
                       focus:outline-none focus:ring-2 focus:ring-brand-600"
          >
            <option value="">All delivery types</option>
            <option value="file_upload">File upload</option>
            <option value="dropped">Prof drop-off</option>
            <option value="pickup">AC picks up</option>
            <option value="delivery">Delivered to room</option>
            <option value="pending">Not confirmed</option>
          </select>
          <input
            type="date"
            value={dateFilter}
            onChange={e => setDateFilter(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-2
                       focus:outline-none focus:ring-2 focus:ring-brand-600"
          />
          {dateFilter && (
            <button
              onClick={() => setDateFilter('')}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              Clear date
            </button>
          )}
          {(search || deliveryFilter || dateFilter) && filtered.length !== exams.length && (
            <span className="text-xs text-gray-400">{filtered.length} of {exams.length}</span>
          )}
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
