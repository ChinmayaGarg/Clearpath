import { useState, useEffect, useCallback } from 'react';

let addToastFn = null;

export function toast(message, type = 'info') {
  if (addToastFn) {
    addToastFn({ message, type, id: Date.now() + Math.random() });
  }
}

export function ToastContainer() {
  const [toasts, setToasts] = useState([]);

  addToastFn = useCallback((t) => {
    setToasts(prev => [...prev, t]);
    setTimeout(() => {
      setToasts(prev => prev.filter(x => x.id !== t.id));
    }, 4000);
  }, []);

  const colours = {
    success: 'bg-green-600 text-white',
    error:   'bg-red-600 text-white',
    warning: 'bg-amber-500 text-white',
    info:    'bg-gray-800 text-white',
  };

  if (!toasts.length) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none"
         style={{ maxWidth: '380px' }}>
      {toasts.map(t => (
        <div
          key={t.id}
          className={`${colours[t.type] ?? colours.info} text-sm font-medium
                      px-4 py-3 rounded-lg shadow-lg animate-fade-in
                      pointer-events-auto`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
