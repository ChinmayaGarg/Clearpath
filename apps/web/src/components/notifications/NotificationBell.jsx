import { useState, useEffect, useRef } from 'react';
import { useBook }                     from '../../hooks/useBook.js';
import { api }                         from '../../lib/api.js';
import NotificationPanel               from './NotificationPanel.jsx';

const POLL_MS = 2 * 60 * 1000;

export default function NotificationBell() {
  const { date }                          = useBook();
  const [notifications, setNotifications] = useState([]);
  const [open,          setOpen]          = useState(false);
  const [dismissed,     setDismissed]     = useState(new Set());
  const panelRef                          = useRef(null);
  const pollRef                           = useRef(null);

  async function load() {
    try {
      const data = await api.get(`/notifications?date=${date}`);
      setNotifications(data.notifications ?? []);
    } catch { /* best-effort */ }
  }

  useEffect(() => {
    load();
    pollRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(pollRef.current);
  }, [date]); // eslint-disable-line

  useEffect(() => {
    function handle(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  const active   = notifications.filter(n => !dismissed.has(n.id));
  const critical = active.filter(n => n.urgency === 'critical').length;
  const high     = active.filter(n => n.urgency === 'high').length;
  const colour   = critical > 0 ? 'bg-red-500' : high > 0 ? 'bg-amber-500' : 'bg-brand-600';

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(o => !o)}
        className="relative p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
        title="Notifications"
      >
        <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24"
          stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002
               6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388
               6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3
               0 11-6 0v-1m6 0H9" />
        </svg>
        {active.length > 0 && (
          <span className={`absolute -top-1 -right-1 ${colour} text-white text-xs
                            font-bold w-4 h-4 rounded-full flex items-center
                            justify-center leading-none`}>
            {active.length > 9 ? '9+' : active.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-50">
          <NotificationPanel
            notifications={active}
            onDismiss={id => setDismissed(s => new Set([...s, id]))}
            onDismissAll={() => setDismissed(new Set(active.map(n => n.id)))}
            onRefresh={load}
          />
        </div>
      )}
    </div>
  );
}
