import { useState, useRef } from 'react';
import { useBookStore }     from '../../store/bookStore.js';
import { toast }            from '../ui/Toast.jsx';

function FileResult({ result }) {
  const [showUnmatched, setShowUnmatched] = useState(false);
  const hasError     = !!result.error;
  const hasUnmatched = result.unmatchedItems?.length > 0;

  return (
    <div className={`rounded-lg border px-3 py-2 text-sm ${
      hasError ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-gray-50'
    }`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-gray-700 truncate">{result.filename}</span>
        {hasError ? (
          <span className="text-red-600 text-xs shrink-0">{result.error}</span>
        ) : (
          <span className="text-gray-500 text-xs shrink-0">
            {result.added} new · {result.merged} merged
            {hasUnmatched && (
              <button
                onClick={() => setShowUnmatched(s => !s)}
                className="ml-2 text-amber-600 hover:text-amber-800"
              >
                {result.unmatched} unmatched
              </button>
            )}
          </span>
        )}
      </div>

      {hasUnmatched && showUnmatched && (
        <div className="mt-2 border-t border-amber-200 pt-2 space-y-0.5">
          <p className="text-xs text-amber-700 font-medium mb-1">
            No course code found — not imported:
          </p>
          {result.unmatchedItems.map((u, i) => (
            <div key={i} className="text-xs text-amber-600 font-mono">
              {u.studentId} · {u.startTime} · {u.roomName} · {u.reason}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PdfImport({ onImportComplete }) {
  const activeDate   = useBookStore(s => s.activeDate);
  const loadBook     = useBookStore(s => s.loadBook);
  const loadAllDates = useBookStore(s => s.loadAllDates);
  const fileInputRef = useRef(null);

  const [dragging,  setDragging]  = useState(false);
  const [uploading, setUploading] = useState(false);
  const [results,   setResults]   = useState([]);
  const [summary,   setSummary]   = useState(null);
  const [error,     setError]     = useState('');

  async function handleFiles(files) {
    const pdfs = Array.from(files).filter(f =>
      f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
    );

    if (!pdfs.length) {
      setError('Please select PDF files only');
      return;
    }

    setError('');
    setResults([]);
    setSummary(null);
    setUploading(true);

    try {
      const formData = new FormData();
      pdfs.forEach(f => formData.append('pdfs', f));

      const res = await fetch('/api/pdf/import', {
        method:      'POST',
        body:        formData,
        credentials: 'include',
      });

      const data = await res.json();

      if (!res.ok) {
        const msg = data.error || 'Import failed';
        setError(msg);
        toast(msg, 'error');
        return;
      }

      setResults(data.results ?? []);
      setSummary(data.summary);

      // Reload book data for any affected dates
      const dates = [...new Set(
        (data.results ?? []).filter(r => r.date).map(r => r.date)
      )];

      await loadAllDates();

      if (dates.includes(activeDate)) {
        await loadBook(activeDate);
      }

      // Show toast summary
      const s = data.summary;
      if (s.errors > 0 && s.added === 0 && s.merged === 0) {
        toast(`Import failed for all ${s.files} file(s)`, 'error');
      } else if (s.errors > 0) {
        toast(`Imported with errors — ${s.added} new, ${s.merged} merged, ${s.errors} failed`, 'warning');
      } else if (s.added === 0 && s.merged === 0) {
        toast('No new exams found — all appointments may already be in the book', 'info');
      } else {
        toast(
          `✓ ${s.files} PDF${s.files !== 1 ? 's' : ''} imported — ${s.added} new exam${s.added !== 1 ? 's' : ''}, ${s.merged} merged${s.unmatched > 0 ? `, ${s.unmatched} unmatched` : ''}`,
          'success'
        );
      }

      // If all good and caller wants to close, do it after a short delay
      // so the user can see the results
      if (s.errors === 0 && onImportComplete) {
        setTimeout(() => onImportComplete(), 1500);
      }

    } catch (err) {
      const msg = err.message || 'Upload failed';
      setError(msg);
      toast(msg, 'error');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  }

  return (
    <div className="space-y-3">

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => !uploading && fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-xl p-8 text-center
                    transition-colors ${uploading ? 'cursor-default' : 'cursor-pointer'} ${
          dragging
            ? 'border-brand-600 bg-brand-50'
            : 'border-gray-300 hover:border-gray-400 bg-gray-50 hover:bg-gray-100'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          multiple
          className="hidden"
          onChange={e => handleFiles(e.target.files)}
        />

        {uploading ? (
          <div className="text-sm text-gray-500">
            <div className="w-6 h-6 border-2 border-brand-600 border-t-transparent
                            rounded-full animate-spin mx-auto mb-3" />
            <p className="font-medium text-gray-700">Parsing PDFs…</p>
            <p className="text-xs mt-1 text-gray-400">This may take a moment</p>
          </div>
        ) : (
          <div className="text-sm text-gray-500">
            <div className="text-3xl mb-2">↑</div>
            <p className="font-medium text-gray-700">Drop SARS PDFs here</p>
            <p className="text-xs mt-1">or click to select · multiple files supported</p>
          </div>
        )}
      </div>

      {/* Inline error */}
      {error && (
        <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
      )}

      {/* Summary bar */}
      {summary && (
        <div className={`flex items-center flex-wrap gap-3 px-3 py-2 rounded-lg text-sm border ${
          summary.errors > 0
            ? 'bg-amber-50 border-amber-200'
            : 'bg-green-50 border-green-200'
        }`}>
          <span className={`font-medium ${summary.errors > 0 ? 'text-amber-800' : 'text-green-700'}`}>
            {summary.files} file{summary.files !== 1 ? 's' : ''} processed
          </span>
          <span className="text-green-600">{summary.added} new</span>
          <span className="text-gray-500">{summary.merged} merged</span>
          {summary.unmatched > 0 && (
            <span className="text-amber-600">{summary.unmatched} unmatched</span>
          )}
          {summary.errors > 0 && (
            <span className="text-red-600">{summary.errors} failed</span>
          )}
        </div>
      )}

      {/* Per-file results */}
      {results.length > 0 && (
        <div className="space-y-2">
          {results.map((r, i) => <FileResult key={i} result={r} />)}
        </div>
      )}

    </div>
  );
}
