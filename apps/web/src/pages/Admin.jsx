import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import TopNav from "../components/ui/TopNav.jsx";
import UserTable from "../components/admin/UserTable.jsx";
import InviteModal from "../components/admin/InviteModal.jsx";
import StatusBoardSettings from "../components/admin/StatusBoardSettings.jsx";
import CourseProfessorLinkForm from "../components/admin/CourseProfessorLinkForm.jsx";
import CoursesTab from "../components/admin/CoursesTab.jsx";
import BookingsTab from "../components/admin/BookingsTab.jsx";
import RoomsTab from "../components/admin/RoomsTab.jsx";
import ScheduleTab from "../components/admin/ScheduleTab.jsx";
import ScheduleExamsTab from "../components/admin/ScheduleExamsTab.jsx";
import CancellationRequestsTab from "../components/admin/CancellationRequestsTab.jsx";
import AccommodationsTab from "../components/admin/AccommodationsTab.jsx";
import StudentCoursesTab from "../components/admin/StudentCoursesTab.jsx";

const ADMIN_TABS = ["Users", "Courses", "Link Courses to Prof", "Link Student to Courses", "Exam Booking Requests", "Room Setup", "Accommodations", "Assign Rooms", "Auto-Approve Exams", "Exam Cancellation Requests"];

export default function Admin() {
  const [searchParams] = useSearchParams();
  const initialTab = ADMIN_TABS.includes(searchParams.get('tab')) ? searchParams.get('tab') : "Users";
  const [tab, setTab] = useState(initialTab);
  const [showInvite, setShowInvite] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  function handleInviteSuccess() {
    setRefreshKey((k) => k + 1);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <TopNav />

      <div className="flex" style={{ minHeight: 'calc(100vh - 3.5rem)' }}>

        {/* Left sidebar */}
        <aside className="w-52 shrink-0 bg-white border-r border-gray-200 sticky top-14
                          h-[calc(100vh-3.5rem)] overflow-y-auto">
          <nav className="py-4">
            <p className="px-4 mb-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">
              Admin
            </p>
            {ADMIN_TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`w-full text-left px-4 py-2 text-sm transition-colors border-l-2 ${
                  tab === t
                    ? "border-brand-600 text-brand-700 bg-brand-50 font-medium"
                    : "border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                }`}
              >
                {t}
              </button>
            ))}
          </nav>
        </aside>

        {/* Content area */}
        <main className="flex-1 overflow-y-auto px-8 py-8 bg-gray-50">
          {tab === "Users" && (
            <>
              <div className="mb-8">
                <h1 className="text-xl font-semibold text-gray-900">
                  Administration
                </h1>
                <p className="text-sm text-gray-500 mt-1">
                  Manage users and roles for your institution
                </p>
              </div>

              <div className="mb-8">
                <StatusBoardSettings />
              </div>

              <UserTable key={refreshKey} onInvite={() => setShowInvite(true)} />

              {showInvite && (
                <InviteModal
                  onClose={() => setShowInvite(false)}
                  onSuccess={handleInviteSuccess}
                />
              )}
            </>
          )}

          {tab === "Courses" && <CoursesTab />}

          {tab === "Link Courses to Prof" && (
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <CourseProfessorLinkForm />
            </div>
          )}

          {tab === "Link Student to Courses" && <StudentCoursesTab />}

          {tab === "Exam Booking Requests" && <BookingsTab />}
          {tab === "Room Setup" && <RoomsTab />}
          {tab === "Accommodations" && <AccommodationsTab />}
          {tab === "Assign Rooms" && <ScheduleTab />}
          {tab === "Auto-Approve Exams" && <ScheduleExamsTab />}
          {tab === "Exam Cancellation Requests" && <CancellationRequestsTab />}
        </main>

      </div>
    </div>
  );
}
