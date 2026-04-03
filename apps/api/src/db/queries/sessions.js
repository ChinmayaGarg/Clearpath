/**
 * Session query functions.
 * All queries run inside the tenant schema via tenantQuery().
 */
import { tenantQuery } from '../tenantPool.js';

/**
 * Create a new session for a user.
 * Automatically expires in 8 hours (configurable).
 */
export async function createSession(schema, { userId, tokenHash, ipAddress, userAgent }) {
  const result = await tenantQuery(schema,
    `INSERT INTO session (user_id, token_hash, ip_address, user_agent, expires_at)
     VALUES ($1, $2, $3, $4, NOW() + INTERVAL '8 hours')
     RETURNING id, expires_at`,
    [userId, tokenHash, ipAddress, userAgent]
  );
  return result.rows[0];
}

/**
 * Look up a session by token hash.
 * Returns session + user data in one query.
 * Returns null if session not found or expired.
 */
export async function findSessionByToken(schema, tokenHash) {
  const result = await tenantQuery(schema,
    `SELECT
       s.id          AS session_id,
       s.expires_at,
       u.id          AS user_id,
       u.email,
       u.email_domain,
       u.first_name,
       u.last_name,
       u.is_active
     FROM session s
     JOIN "user" u ON u.id = s.user_id
     WHERE s.token_hash = $1
       AND s.expires_at > NOW()
       AND u.is_active = TRUE`,
    [tokenHash]
  );
  return result.rows[0] ?? null;
}

/**
 * Fetch all active roles for a user.
 */
export async function getUserRoles(schema, userId) {
  const result = await tenantQuery(schema,
    `SELECT role FROM user_role
     WHERE user_id = $1 AND is_active = TRUE`,
    [userId]
  );
  return result.rows.map(r => r.role);
}

/**
 * Touch last_active_at on a session — called on every authenticated request.
 */
export async function touchSession(schema, sessionId) {
  await tenantQuery(schema,
    `UPDATE session SET last_active_at = NOW() WHERE id = $1`,
    [sessionId]
  );
}

/**
 * Delete a single session (logout).
 */
export async function deleteSession(schema, tokenHash) {
  await tenantQuery(schema,
    `DELETE FROM session WHERE token_hash = $1`,
    [tokenHash]
  );
}

/**
 * Delete all sessions for a user (force logout everywhere).
 * Used by admins to immediately revoke access.
 */
export async function deleteAllUserSessions(schema, userId) {
  const result = await tenantQuery(schema,
    `DELETE FROM session WHERE user_id = $1 RETURNING id`,
    [userId]
  );
  return result.rowCount;
}

/**
 * Delete all expired sessions — run as a background job.
 */
export async function deleteExpiredSessions(schema) {
  const result = await tenantQuery(schema,
    `DELETE FROM session WHERE expires_at < NOW() RETURNING id`
  );
  return result.rowCount;
}
