/**
 * Tenant schema router middleware.
 * Resolves the institution's schema from the authenticated user's email domain,
 * and attaches it to req.tenantSchema for use by all downstream route handlers.
 *
 * Must run AFTER auth middleware (req.user must be set).
 */
import pool from '../db/pool.js';

export async function resolveTenant(req, res, next) {
  try {
    const emailDomain = req.user?.emailDomain;
    if (!emailDomain) {
      return res.status(401).json({ ok: false, error: 'Unauthenticated' });
    }

    const result = await pool.query(
      'SELECT public.resolve_tenant_schema($1) AS schema_name',
      [emailDomain]
    );

    const schemaName = result.rows[0]?.schema_name;
    if (!schemaName) {
      return res.status(403).json({ ok: false, error: 'Institution not found or inactive' });
    }

    req.tenantSchema = schemaName;
    next();
  } catch (err) {
    next(err);
  }
}
