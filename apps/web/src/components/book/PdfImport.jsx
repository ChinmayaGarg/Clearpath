/**
 * PDF import component.
 * Drag-and-drop or file picker — uploads SARS PDFs to /api/pdf/import.
 * Shows per-file results with added/merged/unmatched counts.
 */
import { useState, useRef } from 'react';
import { useBook }          from '../../hooks/useBook.js';

function FileResult({ result }) {
  const [showUnmatched, setShowUnmatched] = useState(false);
  const hasError    = !!result.error;
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
            {result.unmatched > 0 && (
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
        <div className="mt-2 border-t border-amber-200 pt-2">
          <p className="text-xs text-amber-700 font-medium mb-1">
            No course code found — these students were not imported:
          </p>
          <div className="space-y-0.5">
            {result.unmatchedItems.map((u, i) => (
              <div key={i} className="text-xs text-amber-600 font-mono">
                {u.studentId} · {u.startTime} · {u.roomName} · {u.reason}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function PdfImport({ onImportComplete }) {
  const { date, loadBook } = useBook();
  const fileInputRef        = useRef(null);
  const [dragging, setDragging]   = useState(false);
  const [uploading, setUploading] = useState(false);
  const [results, setResults]     = useState([]);
  const [summary, setSummary]     = useState(null);
  const [error, setError]         = useState('');

  async function handleFiles(files) {
    const pdfs = Array.from(files).filter(f => f.type === 'application/pdf');
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
        setError(data.error || 'Import failed');
        return;
      }

      setResults(data.results);
      setSummary(data.summary);

      // Reload the book for any dates that were populated
      const dates = [...new Set(data.results.filter(r => r.date).map(r => r.date))];
      if (dates.includes(date)) {
        await loadBook(date);
      }

      onImportComplete?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
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
        onClick={() => fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer
                    transition-colors ${
          dragging
            ? 'border-brand-600 bg-brand-50'
            : 'border-gray-300 hover:border-gray-400 bg-gray-50 hover:bg-gray-100'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          multiple
          className="hidden"
          onChange={e => handleFiles(e.target.files)}
        />

        {uploading ? (
          <div className="text-sm text-gray-500">
            <div className="w-5 h-5 border-2 border-brand-600 border-t-transparent
                            rounded-full animate-spin mx-auto mb-2" />
            Parsing PDFs…
          </div>
        ) : (
          <div className="text-sm text-gray-500">
            <div className="text-2xl mb-2">↑</div>
            <p className="font-medium text-gray-700">Drop SARS PDFs here</p>
            <p className="text-xs mt-1">or click to select files · multiple files supported</p>
          </div>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
      )}

      {/* Summary bar */}
      {summary && (
        <div className="flex items-center gap-4 px-3 py-2 bg-green-50 border
                        border-green-200 rounded-lg text-sm">
          <span className="text-green-700 font-medium">
            {summary.files} file{summary.files !== 1 ? 's' : ''} imported
          </span>
          <span className="text-green-600">{summary.added} new exams</span>
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
