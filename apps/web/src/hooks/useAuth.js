/**
 * useAuth — convenience hook wrapping the auth store.
 * Components import this instead of useAuthStore directly.
 */
import { useAuthStore } from '../store/authStore.js';

export function useAuth() {
  const user       = useAuthStore(s => s.user);
  const roles      = useAuthStore(s => s.roles);
  const features   = useAuthStore(s => s.features);
  const loading    = useAuthStore(s => s.loading);
  const logout     = useAuthStore(s => s.logout);
  const hasRole    = useAuthStore(s => s.hasRole);
  const hasFeature = useAuthStore(s => s.hasFeature);

  return {
    user,
    roles,
    features,
    loading,
    logout,
    hasRole,
    hasFeature,
    isAdmin:      hasRole('institution_admin'),
    isLead:       hasRole('lead'),
    isCounsellor: hasRole('counsellor'),
  };
}
