/**
 * useFeature — check if the current institution has access to a feature.
 *
 * Usage:
 *   const canEmail = useFeature('prof_email_direct');
 *   if (!canEmail) return <UpgradeBanner feature="prof_email_direct" />;
 */
import { useAuthStore } from '../store/authStore.js';
import { FEATURES }     from '@clearpath/shared/features';

export function useFeature(featureKey) {
  return useAuthStore(s => s.hasFeature(featureKey));
}

// Re-export FEATURES constants for convenience
export { FEATURES };
