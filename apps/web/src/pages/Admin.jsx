import { useState } from "react";
import TopNav from "../components/ui/TopNav.jsx";
import UserTable from "../components/admin/UserTable.jsx";
import InviteModal from "../components/admin/InviteModal.jsx";
import StatusBoardSettings from "../components/admin/StatusBoardSettings.jsx";
import CourseProfessorLinkForm from "../components/admin/CourseProfessorLinkForm.jsx";
import BookingsTab from "../components/admin/BookingsTab.jsx";
import RoomsTab from "../components/admin/RoomsTab.jsx";
import ScheduleTab from "../components/admin/ScheduleTab.jsx";

const ADMIN_TABS = ['Users', 'Bookings', 'Rooms', 'Schedule'];

export default function Admin() {
  const [tab,         setTab]        = useState('Users');
  const [showInvite,  setShowInvite] = useState(false);
  const [refreshKey,  setRefreshKey] = useState(0);

  function handleInviteSuccess() {
    setRefreshKey((k) => k + 1);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <TopNav />

      {/* Tab bar */}
      <div className="border-b border-gray-200 bg-white">
        <div className="max-w-5xl mx-auto px-4 flex gap-1">
          {ADMIN_TABS.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors
                ${tab === t
                  ? 'border-brand-600 text-brand-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8">

        {tab === 'Users' && (
          <>
            <div className="mb-8">
              <h1 className="text-xl font-semibold text-gray-900">Administration</h1>
              <p className="text-sm text-gray-500 mt-1">Manage users and roles for your institution</p>
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

        {tab === 'Bookings' && <BookingsTab />}
        {tab === 'Rooms'    && <RoomsTab />}
        {tab === 'Schedule' && <ScheduleTab />}

      </div>
    </div>
  );
}
