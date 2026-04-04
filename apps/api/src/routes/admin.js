/**
 * Platform admin routes — only accessible to platform admins.
 * Used by Chinmaya to manage institutions, plans, and feature grants.
 *
 * GET  /api/admin/institutions              List all institutions
 * GET  /api/admin/institutions/:id          Get one institution
 * POST /api/admin/institutions/:id/grant    Grant a feature to an institution
 * DELETE /api/admin/institutions/:id/grant/:featureId  Revoke a grant
 * GET  /api/admin/tenants                   List tenant registry status
 */
import { Router } from 'express';
import pool       from '../db/pool.js';
import { logger } from '../utils/logger.js';

const router = Router();

// ── Platform admin auth check ─────────────────────────────────────────────────
// These routes use a separate simple token check — platform admins
// don't go through the tenant schema resolution flow.
// For now, protected by checking a PLATFORM_ADMIN_KEY env variable.
// In production, replace with proper platform admin session handling.
function requirePlatformAdmin(req, res, next) {
  const key = req.headers['x-platform-key'];
  if (!key || key !== process.env.PLATFORM_ADMIN_KEY) {
    return res.status(403).json({ ok: false, error: 'Platform admin access required' });
  }
  next();
}

router.use(requirePlatformAdmin);

// ── GET /api/admin/institutions ───────────────────────────────────────────────
router.get('/institutions', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT
         i.id, i.name, i.slug, i.email_domain,
         i.is_active, i.trial_ends_at, i.created_at,
         p.name        AS plan_name,
         s.status      AS subscription_status,
         tr.db_status  AS schema_status,
         tr.migration_version
       FROM public.institution i
       JOIN public.plan            p  ON p.id  = i.plan_id
       LEFT JOIN public.subscription    s  ON s.institution_id = i.id
       LEFT JOIN public.tenant_registry tr ON tr.institution_id = i.id
       ORDER BY i.created_at DESC`
    );
    res.json({ ok: true, institutions: result.rows });
  } catch (err) { next(err); }
});

// ── GET /api/admin/institutions/:id ──────────────────────────────────────────
router.get('/institutions/:id', async (req, res, next) => {
  try {
    const [instResult, grantsResult] = await Promise.all([
      pool.query(
        `SELECT i.*, p.name AS plan_name, s.status AS subscription_status,
                tr.schema_name, tr.db_status, tr.migration_version
         FROM public.institution i
         JOIN public.plan p ON p.id = i.plan_id
         LEFT JOIN public.subscription s ON s.institution_id = i.id
         LEFT JOIN public.tenant_registry tr ON tr.institution_id = i.id
         WHERE i.id = $1`,
        [req.params.id]
      ),
      pool.query(
        `SELECT g.id, f.key, f.name, g.granted_at, g.expires_at, g.is_active, g.reason
         FROM public.institution_feature_grant g
         JOIN public.feature f ON f.id = g.feature_id
         WHERE g.institution_id = $1
         ORDER BY g.granted_at DESC`,
        [req.params.id]
      ),
    ]);

    if (!instResult.rows.length) {
      return res.status(404).json({ ok: false, error: 'Institution not found' });
    }

    res.json({
      ok:          true,
      institution: instResult.rows[0],
      grants:      grantsResult.rows,
    });
  } catch (err) { next(err); }
});

// ── POST /api/admin/institutions/:id/grant ────────────────────────────────────
router.post('/institutions/:id/grant', async (req, res, next) => {
  try {
    const { featureKey, reason, expiresAt } = req.body;
    if (!featureKey) {
      return res.status(400).json({ ok: false, error: 'featureKey required' });
    }

    // Resolve feature ID
    const featureResult = await pool.query(
      `SELECT id FROM public.feature WHERE key = $1`,
      [featureKey]
    );
    if (!featureResult.rows.length) {
      return res.status(404).json({ ok: false, error: `Feature '${featureKey}' not found` });
    }
    const featureId = featureResult.rows[0].id;

    // Resolve platform admin ID (placeholder — use first admin for now)
    const adminResult = await pool.query(
      `SELECT id FROM public.platform_admin LIMIT 1`
    );
    const adminId = adminResult.rows[0]?.id;

    await pool.query(
      `INSERT INTO public.institution_feature_grant
         (institution_id, feature_id, granted_by, reason, expires_at, is_active)
       VALUES ($1, $2, $3, $4, $5, TRUE)
       ON CONFLICT (institution_id, feature_id)
       DO UPDATE SET
         is_active  = TRUE,
         expires_at = EXCLUDED.expires_at,
         reason     = EXCLUDED.reason,
         granted_at = NOW()`,
      [req.params.id, featureId, adminId, reason ?? 'manual_grant', expiresAt ?? null]
    );

    logger.info('Feature grant created', { institutionId: req.params.id, featureKey });
    res.json({ ok: true, message: `Feature '${featureKey}' granted` });
  } catch (err) { next(err); }
});

// ── DELETE /api/admin/institutions/:id/grant/:featureKey ──────────────────────
router.delete('/institutions/:id/grant/:featureKey', async (req, res, next) => {
  try {
    await pool.query(
      `UPDATE public.institution_feature_grant g
       SET is_active = FALSE
       FROM public.feature f
       WHERE f.id = g.feature_id
         AND g.institution_id = $1
         AND f.key = $2`,
      [req.params.id, req.params.featureKey]
    );
    res.json({ ok: true, message: 'Grant revoked' });
  } catch (err) { next(err); }
});

// ── GET /api/admin/tenants ────────────────────────────────────────────────────
router.get('/tenants', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT tr.*, i.name, i.slug
       FROM public.tenant_registry tr
       JOIN public.institution i ON i.id = tr.institution_id
       ORDER BY tr.provisioned_at DESC`
    );
    res.json({ ok: true, tenants: result.rows });
  } catch (err) { next(err); }
});

// ── GET /api/admin/features ───────────────────────────────────────────────────
router.get('/features', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT f.*, COUNT(pf.plan_id) AS plan_count
       FROM public.feature f
       LEFT JOIN public.plan_feature pf ON pf.feature_id = f.id
       GROUP BY f.id
       ORDER BY f.key`
    );
    res.json({ ok: true, features: result.rows });
  } catch (err) { next(err); }
});

export default router;
