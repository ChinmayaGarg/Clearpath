import { useState } from 'react';

const DELIVERY_LABELS = {
  pending:     'Not confirmed',
  pickup:      'AC picks up',
  delivery:    'Delivered to room',
  file_upload: 'File upload',
};

function deliveryLabel(delivery, dropoffConfirmedAt) {
  if (delivery === 'dropped') {
    return dropoffConfirmedAt ? 'Prof dropped off' : 'Prof will drop off';
  }
  return DELIVERY_LABELS[delivery] ?? delivery ?? '—';
}

function deliveryBadgeClass(delivery, dropoffConfirmedAt) {
  if (delivery === 'dropped') {
    return dropoffConfirmedAt ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700';
  }
  return DELIVERY_BADGE[delivery] ?? 'bg-gray-100 text-gray-600';
}

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

function formatTime(timeStr) {
  if (!timeStr) return null;
  const [h, m] = timeStr.split(':');
  const hour = parseInt(h);
  return `${hour % 12 || 12}:${m}${hour >= 12 ? 'pm' : 'am'}`;
}

function formatBytes(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function downloadFile(url, filename) {
  try {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error('Download failed');
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch {
    alert('Download failed. Please try again.');
  }
}

function DetailRow({ label, value }) {
  if (!value && value !== 0 && value !== false) return null;
  return (
    <div className="flex gap-3">
      <span className="text-xs text-gray-500 w-36 shrink-0">{label}</span>
      <span className="text-sm text-gray-800">{value}</span>
    </div>
  );
}

function DetailsTab({ exam }) {
  const [showPassword, setShowPassword] = useState(false);

  const typeParts = [exam.exam_type_label, exam.version_label].filter(Boolean);
  const typeLabel = typeParts.join(' · ');

  return (
    <div className="space-y-5">
      {/* Exam Info */}
      <section>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Exam Info</h3>
        <div className="space-y-2">
          <DetailRow label="Course" value={<span className="font-mono">{exam.course_code}</span>} />
          <DetailRow label="Type" value={typeLabel} />
          <DetailRow label="Professor" value={
            <a href={`mailto:${exam.prof_email}`} className="text-brand-600 hover:underline">
              {exam.prof_first} {exam.prof_last}
            </a>
          } />
          {exam.dates?.length > 0 && (
            <div className="flex gap-3">
              <span className="text-xs text-gray-500 w-36 shrink-0">Date(s)</span>
              <div className="space-y-0.5">
                {exam.dates.map((d, i) => (
                  <div key={i} className="text-sm text-gray-800">
                    {formatDate(d.exam_date)}
                    {d.time_slot && ` · ${formatTime(d.time_slot)}`}
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-3">
            <span className="text-xs text-gray-500 w-36 shrink-0">Delivery</span>
            <span className={`text-xs px-2 py-0.5 rounded font-medium ${deliveryBadgeClass(exam.delivery, exam.dropoff_confirmed_at)}`}>
              {deliveryLabel(exam.delivery, exam.dropoff_confirmed_at)}
            </span>
          </div>
          {exam.dropoff_confirmed_at && (
            <DetailRow label="Drop-off confirmed" value={
              new Date(exam.dropoff_confirmed_at).toLocaleString('en-CA', {
                month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
              })
            } />
          )}
          {exam.submitted_at && (
            <DetailRow label="Submitted" value={
              new Date(exam.submitted_at).toLocaleString('en-CA', {
                month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
              })
            } />
          )}
          <div className="flex gap-2 flex-wrap mt-1">
            {exam.rwg_flag && (
              <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded font-medium">RWG Word doc</span>
            )}
            {exam.is_makeup && (
              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-medium">Makeup</span>
            )}
          </div>
        </div>
      </section>

      {/* Exam Settings */}
      <section>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Exam Settings</h3>
        <div className="space-y-2">
          <DetailRow label="Duration" value={exam.exam_duration_mins ? `${exam.exam_duration_mins} min` : null} />
          <DetailRow label="Format" value={exam.exam_format} />
          <DetailRow label="Booklet" value={exam.booklet_type} />
          <DetailRow label="Scantron" value={exam.scantron_needed ? 'Yes' : null} />
          <DetailRow label="Calculator" value={exam.calculator_type} />
          <DetailRow label="Materials" value={exam.materials} />
          <DetailRow label="Collection method" value={exam.exam_collection_method} />
          {exam.student_instructions && (
            <div className="flex gap-3">
              <span className="text-xs text-gray-500 w-36 shrink-0">Student instructions</span>
              <span className="text-sm text-gray-800 whitespace-pre-wrap">{exam.student_instructions}</span>
            </div>
          )}
          {exam.password && (
            <div className="flex gap-3 items-center">
              <span className="text-xs text-gray-500 w-36 shrink-0">Password</span>
              <span className="text-sm text-gray-800 font-mono">
                {showPassword ? exam.password : '••••••••'}
              </span>
              <button
                onClick={() => setShowPassword(v => !v)}
                className="text-xs text-brand-600 hover:text-brand-800 ml-1"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          )}
          {exam.is_makeup && exam.makeup_notes && (
            <DetailRow label="Makeup notes" value={exam.makeup_notes} />
          )}
          {exam.estimated_copies && (
            <DetailRow label="Est. copies" value={exam.estimated_copies} />
          )}
        </div>
      </section>
    </div>
  );
}

function FilesTab({ exam }) {
  const hasLegacy = !!exam.file_path;
  const extraFiles = exam.extra_files ?? [];
  const totalFiles = (hasLegacy ? 1 : 0) + extraFiles.length;

  if (totalFiles === 0) {
    return <p className="text-sm text-gray-400 text-center py-8">No files uploaded yet</p>;
  }

  return (
    <div className="space-y-2">
      {hasLegacy && (
        <div className="flex items-center justify-between gap-3 border border-gray-200 rounded-lg px-3 py-2.5">
          <div>
            <p className="text-sm font-medium text-gray-900">
              {exam.file_original_name ?? `${exam.course_code} exam`}
            </p>
            {exam.file_size && (
              <p className="text-xs text-gray-400">{formatBytes(exam.file_size)}</p>
            )}
          </div>
          <button
            onClick={() => downloadFile(
              `/api/prep/uploads/${exam.upload_id}/file`,
              exam.file_original_name ?? `${exam.course_code}.pdf`,
            )}
            className="px-3 py-1 text-xs font-medium bg-brand-600 hover:bg-brand-800
                       text-white rounded-lg transition-colors shrink-0"
          >
            Download
          </button>
        </div>
      )}
      {extraFiles.map(f => (
        <div key={f.id} className="flex items-center justify-between gap-3 border border-gray-200 rounded-lg px-3 py-2.5">
          <div>
            <p className="text-sm font-medium text-gray-900">{f.name}</p>
            {f.size && <p className="text-xs text-gray-400">{formatBytes(f.size)}</p>}
          </div>
          <button
            onClick={() => downloadFile(
              `/api/prep/uploads/${exam.upload_id}/files/${f.id}`,
              f.name,
            )}
            className="px-3 py-1 text-xs font-medium bg-brand-600 hover:bg-brand-800
                       text-white rounded-lg transition-colors shrink-0"
          >
            Download
          </button>
        </div>
      ))}
    </div>
  );
}

const TABS = ['Details', 'Files'];

export default function ExamSidePanel({ exam, onClose }) {
  const [tab, setTab] = useState('Details');

  const typeParts = [exam.exam_type_label, exam.version_label].filter(Boolean);
  const typeLabel = typeParts.join(' · ');

  const fileCount = (exam.file_path ? 1 : 0) + (exam.extra_files?.length ?? 0);

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed top-0 right-0 h-full w-1/2 bg-white shadow-xl z-50
                      flex flex-col border-l border-gray-200">

        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-200 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-900 font-mono">{exam.course_code}</h2>
            <p className="text-xs text-gray-500 mt-0.5">{typeLabel}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {exam.prof_first} {exam.prof_last}
            </p>
          </div>
          <button
            onClick={onClose}
            className="ml-4 text-gray-400 hover:text-gray-600 text-xl leading-none mt-0.5"
          >
            ×
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-gray-200 shrink-0 px-1">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-2.5 text-xs font-medium border-b-2 -mb-px transition-colors ${
                tab === t
                  ? 'border-brand-600 text-brand-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {t}
              {t === 'Files' && fileCount > 0 && (
                <span className="ml-1.5 bg-gray-100 text-gray-500 text-xs px-1.5 py-0.5 rounded-full">
                  {fileCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {tab === 'Details' && <DetailsTab exam={exam} />}
          {tab === 'Files' && <FilesTab exam={exam} />}
        </div>
      </div>
    </>
  );
}
