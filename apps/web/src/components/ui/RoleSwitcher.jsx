import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate }    from 'react-router-dom';

const ROLE_PORTALS = [
  { role: 'institution_admin', label: 'Admin',      path: '/analytics' },
  { role: 'lead',              label: 'Prep',        path: '/prep' },
  { role: 'counsellor',        label: 'Counsellor',  path: '/counsellor' },
  { role: 'professor',         label: 'Professor',   path: '/portal' },
  { role: 'student',           label: 'Student',     path: '/student' },
];

export default function RoleSwitcher({ roles }) {
  const location = useLocation();
  const navigate  = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const myPortals = ROLE_PORTALS.filter(p => roles.includes(p.role));
  if (myPortals.length <= 1) return null;

  const activePortal = myPortals.find(p => location.pathname.startsWith(p.path)) ?? myPortals[0];

  useEffect(() => {
    if (!open) return;
    function handleClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200
                   rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
      >
        {activePortal.label}
        <span className="text-gray-400">{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-40 bg-white border border-gray-200 rounded-xl
                        shadow-lg z-50 py-1 overflow-hidden">
          {myPortals.map(p => {
            const isActive = p.path === activePortal.path;
            return (
              <button
                key={p.role}
                onClick={() => { navigate(p.path); setOpen(false); }}
                className={`w-full text-left px-4 py-2 text-sm flex items-center justify-between
                  transition-colors
                  ${isActive
                    ? 'bg-brand-50 text-brand-800 font-medium'
                    : 'text-gray-700 hover:bg-gray-50'}`}
              >
                {p.label}
                {isActive && <span className="text-brand-600 text-xs">✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
