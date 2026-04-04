import { useState }    from 'react';
import UserTable       from '../components/admin/UserTable.jsx';
import InviteModal           from '../components/admin/InviteModal.jsx';
import StatusBoardSettings from '../components/admin/StatusBoardSettings.jsx';
import { useAuth }     from '../hooks/useAuth.js';

export default function Admin() {
  const { user }              = useAuth();
  const [showInvite, setShowInvite] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  function handleInviteSuccess() {
    setRefreshKey(k => k + 1);
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">

      <div className="mb-8">
        <h1 className="text-xl font-semibold text-gray-900">Administration</h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage users and roles for your institution
        </p>
      </div>

      <div className="mb-8">
        <StatusBoardSettings />
      </div>

      <UserTable
        key={refreshKey}
        onInvite={() => setShowInvite(true)}
      />

      {showInvite && (
        <InviteModal
          onClose={() => setShowInvite(false)}
          onSuccess={handleInviteSuccess}
        />
      )}

    </div>
  );
}
