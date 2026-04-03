import { useEffect }              from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore }           from './store/authStore.js';
import Login                      from './pages/Login.jsx';
import Book                       from './pages/Book.jsx';
import Calendar                   from './pages/Calendar.jsx';
import Admin                      from './pages/Admin.jsx';
import Settings                   from './pages/Settings.jsx';
import NotFound                   from './pages/NotFound.jsx';

function ProtectedRoute({ children, requiredRole }) {
  const { user, hasRole, loading } = useAuthStore();
  if (loading) return <div className="flex items-center justify-center h-screen">Loading…</div>;
  if (!user)   return <Navigate to="/login" replace />;
  if (requiredRole && !hasRole(requiredRole)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const init = useAuthStore(s => s.init);

  useEffect(() => { init(); }, [init]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={
          <ProtectedRoute><Book /></ProtectedRoute>
        } />
        <Route path="/calendar" element={
          <ProtectedRoute><Calendar /></ProtectedRoute>
        } />
        <Route path="/admin" element={
          <ProtectedRoute requiredRole="institution_admin"><Admin /></ProtectedRoute>
        } />
        <Route path="/settings" element={
          <ProtectedRoute><Settings /></ProtectedRoute>
        } />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
