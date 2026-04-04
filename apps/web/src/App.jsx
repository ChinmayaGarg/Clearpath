import { useEffect }              from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore }           from './store/authStore.js';
import { ToastContainer }         from './components/ui/Toast.jsx';
import Login                      from './pages/Login.jsx';
import Book                       from './pages/Book.jsx';
import Calendar                   from './pages/Calendar.jsx';
import Admin                      from './pages/Admin.jsx';
import Settings                   from './pages/Settings.jsx';
import NotFound                   from './pages/NotFound.jsx';
import Professors                 from './pages/Professors.jsx';
import Students                   from './pages/Students.jsx';
import Spinner                    from './components/ui/Spinner.jsx';

function ProtectedRoute({ children, requiredRole }) {
  const { user, roles, loading } = useAuthStore();
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <Spinner size="lg" />
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  if (requiredRole && !roles.includes(requiredRole)) {
    return <Navigate to="/" replace />;
  }
  return children;
}

export default function App() {
  const init = useAuthStore(s => s.init);
  useEffect(() => { init(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
        <Route path="/students" element={
          <ProtectedRoute><Students /></ProtectedRoute>
        } />
        <Route path="/professors" element={
          <ProtectedRoute><Professors /></ProtectedRoute>
        } />
        <Route path="*" element={<NotFound />} />
      </Routes>
      <ToastContainer />
    </BrowserRouter>
  );
}
