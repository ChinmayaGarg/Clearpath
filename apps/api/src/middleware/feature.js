/**
 * Feature gate middleware.
 * Checks whether the institution has access to a given feature
 * before allowing the request to proceed.
 *
 * Usage in routes:
 *   router.get('/analytics', requireFeature('analytics_dashboard'), handler);
 */
import pool from '../db/pool.js';

// Simple in-memory cache — key: `${institutionId}:${featureKey}`, TTL: 60s
const cache = new Map();
const CACHE_TTL_MS = 60_000;

export function requireFeature(featureKey) {
  return async (req, res, next) => {
    try {
      const institutionId = req.institutionId;
      if (!institutionId) {
        return res.status(403).json({ ok: false, error: 'Institution not resolved' });
      }

      const cacheKey = `${institutionId}:${featureKey}`;
      const cached = cache.get(cacheKey);
      if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
        if (!cached.allowed) {
          return res.status(403).json({ ok: false, error: 'Feature not available on your plan', feature: featureKey });
        }
        return next();
      }

      const result = await pool.query(
        'SELECT public.can_use_feature($1, $2) AS allowed',
        [institutionId, featureKey]
      );

      const allowed = result.rows[0]?.allowed ?? false;
      cache.set(cacheKey, { allowed, ts: Date.now() });

      if (!allowed) {
        return res.status(403).json({ ok: false, error: 'Feature not available on your plan', feature: featureKey });
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}
