/**
 * ExportButton — opens the print-ready daily book in a new tab.
 * The server returns a fully self-contained HTML page with a print button.
 * The lead clicks print in that tab → browser's native print dialog
 * → Save as PDF or send to printer.
 */
import { useState } from 'react';
import { toast }    from '../ui/Toast.jsx';

export default function ExportButton({ date }) {
  const [loading, setLoading] = useState(false);

  async function handleExport() {
    setLoading(true);
    try {
      // Open in new tab — the server returns HTML directly
      const url = `/api/export/book/${date}`;

      // Verify the book exists first
      const check = await fetch(url, { credentials: 'include' });
      if (!check.ok) {
        const data = await check.json();
        toast(data.error ?? 'Export failed', 'error');
        return;
      }

      // Open print view in new tab
      window.open(url, '_blank', 'noopener');
      toast('Book opened for printing', 'success');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleExport}
      disabled={loading}
      title="Export and print daily book"
      className="px-3 py-1.5 text-sm text-gray-600 border border-gray-200
                 rounded-lg hover:bg-gray-50 transition-colors
                 disabled:opacity-50 disabled:cursor-not-allowed
                 flex items-center gap-1.5"
    >
      <span>{loading ? '…' : '🖨'}</span>
      <span>{loading ? 'Preparing…' : 'Export'}</span>
    </button>
  );
}
