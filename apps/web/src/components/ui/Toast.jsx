import { useState, useEffect, useCallback } from 'react';

let addToastFn = null;

export function toast(message, type = 'info') {
  addToastFn?.({ message, type, id: Date.now() });
}

export function ToastContainer() {
  const [toasts, setToasts] = useState([]);

  addToastFn = useCallback((t) => {
    setToasts(prev => [...prev, t]);
    setTimeout(() => setToasts(prev => prev.filter(x => x.id !== t.id)), 3500);
  }, []);

  const colours = {
    success: 'bg-green-600',
    error:   'bg-red-600',
    info:    'bg-gray-800',
    warning: 'bg-amber-500',
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div key={t.id}
          className={`${colours[t.type] ?? colours.info} text-white text-sm
                      font-medium px-4 py-2.5 rounded-lg shadow-lg
                      animate-fade-in pointer-events-auto max-w-sm`}>
          {t.message}
        </div>
      ))}
    </div>
  );
}
