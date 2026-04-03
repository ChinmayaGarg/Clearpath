/**
 * Authentication middleware.
 * Validates the session token from the httpOnly cookie.
 * Attaches req.user on success.
 */
import crypto          from 'crypto';
import { tenantQuery } from '../db/tenantPool.js';
import pool            from '../db/pool.js';

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function requireAuth(req, res, next) {
  try {
    const rawToken = req.cookies?.authToken;
    if (!rawToken) {
      return res.status(401).json({ ok: false, error: 'Not authenticated' });
    }

    const tokenHash = hashToken(rawToken);

    // Resolve schema from token — we need the domain first.
    // We look up the session in public schema via a platform-level session table,
    // or resolve the schema from the token's email domain stored in the cookie payload.
    // For simplicity: decode email from a short-lived signed cookie, then resolve schema.
    // Full implementation uses a two-step lookup.

    const emailDomain = req.cookies?.tenantDomain;
    if (!emailDomain) {
      return res.status(401).json({ ok: false, error: 'Not authenticated' });
    }

    // Resolve schema
    const schemaResult = await pool.query(
      'SELECT public.resolve_tenant_schema($1) AS schema_name',
      [emailDomain]
    );
    const schema = schemaResult.rows[0]?.schema_name;
    if (!schema) {
      return res.status(401).json({ ok: false, error: 'Institution not found' });
    }

    // Validate session in tenant schema
    const sessionResult = await tenantQuery(
      schema,
      `SELECT s.id, s.user_id, s.expires_at,
              u.email, u.email_domain, u.first_name, u.last_name, u.is_active
       FROM session s
       JOIN "user" u ON u.id = s.user_id
       WHERE s.token_hash = $1
         AND s.expires_at > NOW()
         AND u.is_active = TRUE`,
      [tokenHash]
    );

    if (!sessionResult.rows.length) {
      return res.status(401).json({ ok: false, error: 'Session expired' });
    }

    const session = sessionResult.rows[0];

    // Fetch roles
    const rolesResult = await tenantQuery(
      schema,
      `SELECT role FROM user_role
       WHERE user_id = $1 AND is_active = TRUE`,
      [session.user_id]
    );

    // Update last_active_at
    await tenantQuery(
      schema,
      `UPDATE session SET last_active_at = NOW() WHERE id = $1`,
      [session.id]
    );

    req.user = {
      id:          session.user_id,
      email:       session.email,
      emailDomain: session.email_domain,
      firstName:   session.first_name,
      lastName:    session.last_name,
      roles:       rolesResult.rows.map(r => r.role),
    };
    req.tenantSchema = schema;

    next();
  } catch (err) {
    next(err);
  }
}
