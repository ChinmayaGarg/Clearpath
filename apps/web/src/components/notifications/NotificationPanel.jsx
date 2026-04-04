const URGENCY = {
  critical: 'border-l-red-500 bg-red-50',
  high:     'border-l-amber-500 bg-amber-50',
  medium:   'border-l-blue-400 bg-blue-50',
  low:      'border-l-gray-300 bg-gray-50',
};
const ICON = {
  missing_password: '🔒',
  not_emailed:      '✉',
  not_received:     '📬',
  rwg_check:        '📄',
  unresolved:       '⚠',
};

function Item({ n, onDismiss }) {
  return (
    <div className={`border-l-4 ${URGENCY[n.urgency] ?? URGENCY.medium}
                     px-3 py-2.5 rounded-r-lg`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <span className="text-base leading-none mt-0.5">{ICON[n.type]}</span>
          <div>
            <p className="text-xs font-semibold text-gray-900">{n.title}</p>
            <p className="text-xs text-gray-600 mt-0.5">{n.message}</p>
            {n.action && (
              <p className="text-xs font-medium text-brand-700 mt-1">→ {n.action}</p>
            )}
          </div>
        </div>
        <button onClick={() => onDismiss(n.id)}
          className="text-gray-300 hover:text-gray-500 shrink-0 leading-none">×</button>
      </div>
    </div>
  );
}

export default function NotificationPanel({ notifications, onDismiss, onDismissAll, onRefresh }) {
  const critical = notifications.filter(n => n.urgency === 'critical').length;
  const high     = notifications.filter(n => n.urgency === 'high').length;

  return (
    <div className="w-80 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-900">Notifications</span>
          {notifications.length > 0 && (
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
              critical > 0 ? 'bg-red-100 text-red-700' :
              high     > 0 ? 'bg-amber-100 text-amber-700' :
              'bg-gray-100 text-gray-600'
            }`}>{notifications.length}</span>
          )}
        </div>
        <div className="flex gap-3">
          <button onClick={onRefresh}
            className="text-xs text-gray-400 hover:text-gray-600">Refresh</button>
          {notifications.length > 1 && (
            <button onClick={onDismissAll}
              className="text-xs text-gray-400 hover:text-gray-600">Clear all</button>
          )}
        </div>
      </div>

      <div className="max-h-96 overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <div className="text-2xl mb-2">✓</div>
            <p className="text-sm text-gray-500">No active notifications</p>
            <p className="text-xs text-gray-400 mt-0.5">All exams are on track</p>
          </div>
        ) : (
          <div className="p-3 space-y-2">
            {notifications.map(n => <Item key={n.id} n={n} onDismiss={onDismiss} />)}
          </div>
        )}
      </div>

      {notifications.length > 0 && (
        <div className="px-4 py-2 border-t border-gray-100 bg-gray-50">
          <p className="text-xs text-gray-400 text-center">Auto-refreshes every 2 minutes</p>
        </div>
      )}
    </div>
  );
}
