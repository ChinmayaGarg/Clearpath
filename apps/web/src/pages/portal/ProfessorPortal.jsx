import { useState, useEffect } from 'react';
import { useNavigate }         from 'react-router-dom';
import { useAuthStore }        from '../../store/authStore.js';
import { api }                 from '../../lib/api.js';
import { toast }               from '../../components/ui/Toast.jsx';
import Spinner                 from '../../components/ui/Spinner.jsx';
import UploadList              from '../../components/portal/UploadList.jsx';
import UploadForm              from '../../components/portal/UploadForm.jsx';
import ReuseRequests           from '../../components/portal/ReuseRequests.jsx';

const TABS = ['My uploads', 'Reuse requests', 'Notifications'];

export default function ProfessorPortal() {
  const user                   = useAuthStore(s => s.user);
  const logout                 = useAuthStore(s => s.logout);
  const navigate               = useNavigate();
  const [tab,      setTab]     = useState('My uploads');
  const [me,       setMe]      = useState(null);
  const [loading,  setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId,   setEditId]  = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  async function loadMe() {
    try {
      const data = await api.get('/portal/me');
      setMe(data);
    } catch (err) {
      if (err.message.includes('professor profile')) {
        toast('No professor profile found for your account', 'error');
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadMe(); }, []); // eslint-disable-line

  function refresh() {
    setRefreshKey(k => k + 1);
    loadMe();
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <Spinner size="lg" />
    </div>
  );

  const profile = me?.profile;
  const stats   = me?.stats;
  const unread  = me?.unread ?? 0;

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Nav */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-brand-800">Clearpath</span>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
              Professor portal
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400">{user?.email}</span>
            <button
              onClick={async () => { await logout(); navigate('/login'); }}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              Sign out
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 py-6">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-gray-900">
            {profile
              ? `${profile.first_name} ${profile.last_name}`
              : 'Professor portal'
            }
          </h1>
          {profile?.department && (
            <p className="text-sm text-gray-500 mt-0.5">{profile.department}</p>
          )}
        </div>

        {/* Stat cards */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {[
              { label: 'Submitted',  value: stats.submitted,     colour: 'text-green-700 bg-green-50 border-green-200'  },
              { label: 'Drafts',     value: stats.drafts,        colour: 'text-amber-700 bg-amber-50 border-amber-200'  },
              { label: 'Courses',    value: stats.courses,       colour: 'text-brand-800 bg-brand-50 border-brand-600 border-opacity-20' },
              { label: 'Unread',     value: unread,              colour: unread > 0 ? 'text-red-700 bg-red-50 border-red-200' : 'text-gray-500 bg-gray-50 border-gray-200' },
            ].map(({ label, value, colour }) => (
              <div key={label} className={`border rounded-xl px-4 py-3 ${colour}`}>
                <div className="text-2xl font-bold">{value}</div>
                <div className="text-xs font-medium mt-0.5">{label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 border-b border-gray-200 mb-5">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm border-b-2 -mb-px transition-colors ${
                tab === t
                  ? 'border-brand-600 text-brand-800 font-medium'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {t}
              {t === 'Reuse requests' && me?.reuseCount > 0 && (
                <span className="ml-1.5 text-xs bg-amber-100 text-amber-700
                                 px-1.5 py-0.5 rounded-full">
                  {me.reuseCount}
                </span>
              )}
              {t === 'Notifications' && unread > 0 && (
                <span className="ml-1.5 text-xs bg-red-100 text-red-700
                                 px-1.5 py-0.5 rounded-full">
                  {unread}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === 'My uploads' && (
          <div>
            <div className="flex justify-end mb-4">
              <button
                onClick={() => { setEditId(null); setShowForm(true); }}
                className="px-3 py-1.5 bg-brand-600 hover:bg-brand-800 text-white
                           text-sm font-medium rounded-lg transition-colors"
              >
                + New exam upload
              </button>
            </div>
            <UploadList
              key={refreshKey}
              onEdit={id => { setEditId(id); setShowForm(true); }}
              onRefresh={refresh}
            />
          </div>
        )}

        {tab === 'Reuse requests' && (
          <ReuseRequests key={refreshKey} onRefresh={refresh} />
        )}

        {tab === 'Notifications' && (
          <NotificationsTab onRead={refresh} />
        )}

      </div>

      {/* Upload form modal */}
      {showForm && (
        <UploadForm
          uploadId={editId}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); refresh(); }}
        />
      )}
    </div>
  );
}

function NotificationsTab({ onRead }) {
  const [notifications, setNotifications] = useState([]);
  const [loading,       setLoading]       = useState(true);

  useEffect(() => {
    api.get('/portal/notifications')
      .then(d => setNotifications(d.notifications))
      .catch(console.error)
      .finally(() => setLoading(false));

    // Mark all read
    api.post('/portal/notifications/read', {}).catch(() => {});
    onRead();
  }, []); // eslint-disable-line

  const TYPE_META = {
    upload_needed:   { icon: '📋', label: 'Upload needed',   colour: 'border-l-amber-400 bg-amber-50'   },
    upload_received: { icon: '✓',  label: 'Upload received', colour: 'border-l-green-400 bg-green-50'   },
    reuse_requested: { icon: '🔄', label: 'Reuse requested', colour: 'border-l-blue-400 bg-blue-50'     },
    reuse_approved:  { icon: '✓',  label: 'Reuse approved',  colour: 'border-l-green-400 bg-green-50'   },
    reuse_denied:    { icon: '✕',  label: 'Reuse denied',    colour: 'border-l-red-400 bg-red-50'       },
  };

  if (loading) return <div className="flex justify-center py-10"><Spinner /></div>;

  if (!notifications.length) return (
    <div className="text-center py-12 text-sm text-gray-400">
      No notifications yet
    </div>
  );

  return (
    <div className="space-y-2">
      {notifications.map(n => {
        const meta = TYPE_META[n.type] ?? { icon: '·', colour: 'border-l-gray-300 bg-gray-50' };
        return (
          <div key={n.id}
            className={`border-l-4 ${meta.colour} px-4 py-3 rounded-r-xl flex
                        items-start gap-3 ${!n.is_read ? 'font-medium' : ''}`}>
            <span className="text-base shrink-0">{meta.icon}</span>
            <div className="flex-1">
              <p className="text-sm text-gray-900">{n.message}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {new Date(n.created_at).toLocaleString('en-CA', {
                  month: 'short', day: 'numeric',
                  hour: 'numeric', minute: '2-digit',
                })}
              </p>
            </div>
            {!n.is_read && (
              <span className="w-2 h-2 bg-brand-600 rounded-full shrink-0 mt-1" />
            )}
          </div>
        );
      })}
    </div>
  );
}
