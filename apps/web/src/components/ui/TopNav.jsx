import { Link, NavLink } from "react-router-dom";
import { useState, useEffect } from "react";
import { useAuth } from "../../hooks/useAuth.js";
import NotificationBell from "../notifications/NotificationBell.jsx";
import RoleSwitcher from "./RoleSwitcher.jsx";

function useUnreadMessageCount(enabled) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const load = () =>
      fetch('/api/prep/messages', { credentials: 'include' })
        .then(r => r.json())
        .then(d => {
          if (d.ok) setCount(d.conversations.reduce((s, c) => s + (c.unread_count ?? 0), 0));
        })
        .catch(() => {});
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [enabled]);
  return count;
}

export default function TopNav() {
  const { user, roles, isAdmin, isLead, logout } = useAuth();
  const unread = useUnreadMessageCount(isAdmin || isLead);

  const navLinks = [
    { to: "/professors", label: "Professors" },
    { to: "/students", label: "Students" },
  ];

  if (isAdmin || isLead) {
    navLinks.unshift({ to: "/analytics", label: "Analytics" });
  }

  if (isAdmin) {
    navLinks.push({ to: "/admin", label: "Admin" });
  }

  if (isAdmin || isLead) {
    navLinks.push({ to: "/exams", label: "Exams" });
    navLinks.push({ to: "/prep", label: "Prep" });
    navLinks.push({ to: "/attendance", label: "Attendance" });
    navLinks.push({ to: "/messages", label: "Messages", badge: unread > 0 ? unread : null });
  }

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
        <div className="flex items-center gap-8 min-w-0 overflow-x-auto">
          <Link to="/" className="font-semibold text-brand-800">
            Clearpath
          </Link>
          {navLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                `text-sm transition-colors flex items-center gap-1.5 ${
                  isActive
                    ? "text-brand-800 font-medium"
                    : "text-gray-500 hover:text-gray-900"
                }`
              }
            >
              {link.label}
              {link.badge && (
                <span className="bg-brand-600 text-white text-xs px-1.5 py-0.5 rounded-full leading-none">
                  {link.badge}
                </span>
              )}
            </NavLink>
          ))}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <RoleSwitcher roles={roles} />
          <NotificationBell />
          <span className="text-xs text-gray-400">{user?.email}</span>
          <button
            onClick={logout}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    </nav>
  );
}
