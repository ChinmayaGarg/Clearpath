import TopNav        from '../components/ui/TopNav.jsx';
import AttendanceTab from '../components/admin/AttendanceTab.jsx';

export default function Attendance() {
  return (
    <div className="min-h-screen bg-gray-50">
      <TopNav />
      <div className="max-w-4xl mx-auto px-4 py-8">
        <AttendanceTab />
      </div>
    </div>
  );
}
