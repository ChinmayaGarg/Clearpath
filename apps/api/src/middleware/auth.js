/**
 * Authentication middleware.
 * Validates session cookies, attaches req.user + req.tenantSchema.
 * Must run before any route handler that requires authentication.
 */
import { validateSession }   from '../services/authService.js';
import pool                  from '../db/pool.js';

export async function requireAuth(req, res, next) {
  try {
    const session = await validateSession(req.cookies);

    if (!session) {
      return res.status(401).json({ ok: false, error: 'Not authenticated' });
    }

    req.user         = session.user;
    req.userRoles    = session.roles;
    req.tenantSchema = session.schema;
    req.sessionId    = session.sessionId;

    // Resolve institution_id for feature gate checks
    const instResult = await pool.query(
      `SELECT id FROM public.institution
       WHERE email_domain = $1 AND is_active = TRUE`,
      [session.user.emailDomain]
    );
    req.institutionId = instResult.rows[0]?.id ?? null;

    next();
  } catch (err) {
    next(err);
  }
}
