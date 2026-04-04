import { Link } from 'react-router-dom';
export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-semibold text-gray-900">Page not found</h1>
      <Link to="/" className="text-brand-600 hover:text-brand-800 text-sm">
        ← Back to book
      </Link>
    </div>
  );
}
