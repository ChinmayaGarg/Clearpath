/**
 * Feature service — check feature access for an institution.
 * Thin wrapper around the can_use_feature DB function.
 */
import pool from '../db/pool.js';

const cache    = new Map();
const TTL_MS   = 60_000;

export async function canUseFeature(institutionId, featureKey) {
  const cacheKey = `${institutionId}:${featureKey}`;
  const cached   = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < TTL_MS) return cached.allowed;

  const result = await pool.query(
    'SELECT public.can_use_feature($1, $2) AS allowed',
    [institutionId, featureKey]
  );
  const allowed = result.rows[0]?.allowed ?? false;
  cache.set(cacheKey, { allowed, ts: Date.now() });
  return allowed;
}

export function clearFeatureCache(institutionId) {
  for (const key of cache.keys()) {
    if (key.startsWith(institutionId)) cache.delete(key);
  }
}
