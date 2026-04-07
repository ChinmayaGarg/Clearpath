import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth.js";
import NotificationBell from "../notifications/NotificationBell.jsx";

export default function TopNav() {
  const { user, isAdmin, logout } = useAuth();

  const navLinks = [
    { to: "/", label: "Book", end: true },
    { to: "/calendar", label: "Calendar" },
    { to: "/professors", label: "Professors" },
    { to: "/students", label: "Students" },
  ];

  if (isAdmin) {
    navLinks.push({ to: "/admin", label: "Admin" });
    navLinks.push({ to: "/analytics", label: "Analytics" });
  }

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-30">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
        <div className="flex items-center gap-6 overflow-x-auto">
          <Link to="/" className="font-semibold text-brand-800">
            Clearpath
          </Link>
          {navLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                `text-sm transition-colors ${
                  isActive
                    ? "text-brand-800 font-medium"
                    : "text-gray-500 hover:text-gray-900"
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </div>

        <div className="flex items-center gap-3">
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
