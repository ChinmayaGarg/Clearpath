/**
 * StatusBoardSettings — lets admins generate a shareable board URL.
 * Lives inside the Admin page.
 */
import { useState } from 'react';
import { api }      from '../../lib/api.js';
import { toast }    from '../ui/Toast.jsx';

export default function StatusBoardSettings() {
  const [token,    setToken]    = useState('');
  const [boardUrl, setBoardUrl] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [copied,   setCopied]   = useState(false);

  async function generate() {
    setLoading(true);
    try {
      const data = await api.post('/status/token', {});
      setToken(data.token);
      // Build the board URL — points to the React /board/:token route
      const url = `${window.location.origin}/board/${data.token}`;
      setBoardUrl(url);
      toast('Board URL generated', 'success');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function copy() {
    await navigator.clipboard.writeText(boardUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function openBoard() {
    window.open(boardUrl, '_blank', 'noopener');
  }

  return (
    <div className="border border-gray-200 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-gray-900 mb-1">
        Live status board
      </h3>
      <p className="text-xs text-gray-500 mb-4">
        Generate a shareable URL for the front desk monitor. The board
        shows all exams for today, auto-refreshes every 30 seconds,
        and requires no login.
      </p>

      {boardUrl ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 p-3 bg-gray-50
                          border border-gray-200 rounded-lg">
            <code className="text-xs text-gray-700 flex-1 truncate font-mono">
              {boardUrl}
            </code>
            <button
              onClick={copy}
              className="shrink-0 text-xs font-medium text-brand-600
                         hover:text-brand-800 transition-colors"
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>

          <div className="flex gap-2">
            <button
              onClick={openBoard}
              className="flex-1 py-2 bg-brand-600 hover:bg-brand-800
                         text-white text-sm font-medium rounded-lg
                         transition-colors"
            >
              Open board ↗
            </button>
            <button
              onClick={generate}
              disabled={loading}
              className="py-2 px-3 border border-gray-300 text-gray-600
                         text-sm rounded-lg hover:bg-gray-50 transition-colors
                         disabled:opacity-50"
              title="Regenerate — invalidates the old URL"
            >
              Regenerate
            </button>
          </div>

          <p className="text-xs text-gray-400">
            ⚠ Regenerating creates a new URL and invalidates the old one.
            Update any bookmarks or browser tabs using the old URL.
          </p>
        </div>
      ) : (
        <button
          onClick={generate}
          disabled={loading}
          className="w-full py-2 bg-brand-600 hover:bg-brand-800 text-white
                     text-sm font-medium rounded-lg transition-colors
                     disabled:opacity-50"
        >
          {loading ? 'Generating…' : 'Generate board URL'}
        </button>
      )}
    </div>
  );
}
