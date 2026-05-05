import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import TopNav from "../components/ui/TopNav.jsx";
import UserTable from "../components/admin/UserTable.jsx";
import InviteModal from "../components/admin/InviteModal.jsx";
import StatusBoardSettings from "../components/admin/StatusBoardSettings.jsx";
import CourseProfessorLinkForm from "../components/admin/CourseProfessorLinkForm.jsx";
import BookingsTab from "../components/admin/BookingsTab.jsx";
import RoomsTab from "../components/admin/RoomsTab.jsx";
import ScheduleTab from "../components/admin/ScheduleTab.jsx";
import ScheduleExamsTab from "../components/admin/ScheduleExamsTab.jsx";
import CancellationRequestsTab from "../components/admin/CancellationRequestsTab.jsx";
import AttendanceTab from "../components/admin/AttendanceTab.jsx";

const ADMIN_TABS = ["Users", "Exam Requests", "Room Setup", "Assign Rooms", "Auto-Approve Exams", "Exam Cancellation Requests", "Attendance"];

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

      {/* Tab bar */}
      <div className="border-b border-gray-200 bg-white">
        <div className="max-w-5xl mx-auto px-4 flex gap-1">
          {ADMIN_TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors
                ${
                  tab === t
                    ? "border-brand-600 text-brand-700"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8">
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

            <div className="mb-8 bg-white rounded-lg border border-gray-200 p-6">
              <CourseProfessorLinkForm />
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

        {tab === "Exam Requests" && <BookingsTab />}
        {tab === "Room Setup" && <RoomsTab />}
        {tab === "Assign Rooms" && <ScheduleTab />}
        {tab === "Auto-Approve Exams" && <ScheduleExamsTab />}
        {tab === "Exam Cancellation Requests" && <CancellationRequestsTab />}
        {tab === "Attendance" && <AttendanceTab />}
      </div>
    </div>
  );
}
