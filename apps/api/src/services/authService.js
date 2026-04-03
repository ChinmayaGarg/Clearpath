/**
 * Auth service — business logic for authentication.
 * Routes call this; this calls DB query functions.
 * Keeps routes thin and logic testable.
 */
import pool                          from '../db/pool.js';
import { hashToken, hashPassword,
         generateToken, generateSalt } from '../utils/crypto.js';
import { logger }                    from '../utils/logger.js';
import {
  findUserByEmail,
  findUserById,
  updateLastLogin,
  updatePassword,
  createPasswordResetToken,
  consumePasswordResetToken,
} from '../db/queries/users.js';
import {
  createSession,
  findSessionByToken,
  getUserRoles,
  touchSession,
  deleteSession,
  deleteAllUserSessions,
} from '../db/queries/sessions.js';
import { logAction } from '../db/queries/audit.js';

const SESSION_COOKIE  = 'authToken';
const DOMAIN_COOKIE   = 'tenantDomain';
const COOKIE_MAX_AGE  = 8 * 60 * 60 * 1000; // 8 hours in ms
const IS_PRODUCTION   = process.env.NODE_ENV === 'production';

/**
 * Resolve tenant schema from email domain.
 * Returns schema name or null if no matching active institution.
 */
export async function resolveSchemaFromEmail(email) {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return null;

  const result = await pool.query(
    'SELECT public.resolve_tenant_schema($1) AS schema_name',
    [domain]
  );
  return result.rows[0]?.schema_name ?? null;
}

/**
 * Resolve institution_id from email domain.
 * Used for feature gate checks.
 */
export async function resolveInstitutionFromEmail(email) {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return null;

  const result = await pool.query(
    `SELECT i.id
     FROM public.institution i
     LEFT JOIN public.domain_allowlist da ON da.institution_id = i.id
     WHERE (i.email_domain = $1 OR da.domain = $1)
       AND i.is_active = TRUE
     LIMIT 1`,
    [domain]
  );
  return result.rows[0]?.id ?? null;
}

/**
 * Log in a user.
 * Returns { user, roles } on success.
 * Throws on invalid credentials or inactive account.
 */
export async function login(schema, { email, password, ipAddress, userAgent }) {
  const user = await findUserByEmail(schema, email);

  if (!user || !user.is_active) {
    // Don't reveal whether the email exists
    logger.warn('Login failed — user not found or inactive', { email, schema });
    throw Object.assign(new Error('Invalid credentials'), { status: 401 });
  }

  const expectedHash = hashPassword(password, user.salt);
  if (expectedHash !== user.password_hash) {
    logger.warn('Login failed — wrong password', { email, schema });
    throw Object.assign(new Error('Invalid credentials'), { status: 401 });
  }

  // Generate session
  const rawToken  = generateToken();
  const tokenHash = hashToken(rawToken);

  await createSession(schema, {
    userId:    user.id,
    tokenHash,
    ipAddress,
    userAgent,
  });

  await updateLastLogin(schema, user.id);

  const roles = await getUserRoles(schema, user.id);

  // Audit
  await logAction(schema, {
    entityType: 'user',
    entityId:   user.id,
    action:     'login',
    changedBy:  user.id,
  });

  logger.info('Login successful', { email, schema });

  return {
    rawToken,
    emailDomain: user.email_domain,
    user: {
      id:        user.id,
      email:     user.email,
      firstName: user.first_name,
      lastName:  user.last_name,
    },
    roles,
  };
}

/**
 * Validate a request session from cookies.
 * Returns { user, roles, sessionId, schema } or null.
 */
export async function validateSession(cookies) {
  const rawToken    = cookies?.[SESSION_COOKIE];
  const emailDomain = cookies?.[DOMAIN_COOKIE];

  if (!rawToken || !emailDomain) return null;

  const schema = await pool.query(
    'SELECT public.resolve_tenant_schema($1) AS schema_name',
    [emailDomain]
  );
  const schemaName = schema.rows[0]?.schema_name;
  if (!schemaName) return null;

  const tokenHash = hashToken(rawToken);
  const session   = await findSessionByToken(schemaName, tokenHash);
  if (!session) return null;

  const roles = await getUserRoles(schemaName, session.user_id);

  // Touch session — non-blocking
  touchSession(schemaName, session.session_id).catch(() => {});

  return {
    schema: schemaName,
    sessionId: session.session_id,
    user: {
      id:          session.user_id,
      email:       session.email,
      emailDomain: session.email_domain,
      firstName:   session.first_name,
      lastName:    session.last_name,
    },
    roles,
  };
}

/**
 * Log out — delete session, clear cookies.
 */
export async function logout(schema, cookies) {
  const rawToken = cookies?.[SESSION_COOKIE];
  if (rawToken) {
    const tokenHash = hashToken(rawToken);
    await deleteSession(schema, tokenHash);
  }
}

/**
 * Change password for an authenticated user.
 */
export async function changePassword(schema, userId, { currentPassword, newPassword }) {
  const user = await findUserById(schema, userId);
  if (!user) throw Object.assign(new Error('User not found'), { status: 404 });

  const currentHash = hashPassword(currentPassword, user.salt);
  // Note: user from findUserById doesn't include password_hash — fetch it
  const fullUser = await findUserByEmail(schema, user.email);

  if (currentHash !== fullUser.password_hash) {
    throw Object.assign(new Error('Current password incorrect'), { status: 401 });
  }

  const newSalt = generateSalt();
  const newHash = hashPassword(newPassword, newSalt);

  await updatePassword(schema, userId, { passwordHash: newHash, salt: newSalt });

  // Invalidate all other sessions after password change
  await deleteAllUserSessions(schema, userId);

  await logAction(schema, {
    entityType: 'user',
    entityId:   userId,
    action:     'updated',
    fieldName:  'password',
    changedBy:  userId,
  });

  logger.info('Password changed', { userId, schema });
}

/**
 * Initiate password reset — generates token, returns it for email sending.
 * Always returns success to prevent email enumeration.
 */
export async function initiatePasswordReset(schema, email) {
  const user = await findUserByEmail(schema, email);
  if (!user || !user.is_active) {
    // Silently succeed — don't reveal if email exists
    return null;
  }

  const rawToken  = generateToken();
  const tokenHash = hashToken(rawToken);

  await createPasswordResetToken(schema, user.id, tokenHash);

  logger.info('Password reset initiated', { userId: user.id, schema });

  return {
    rawToken,
    user: { email: user.email, firstName: user.first_name },
  };
}

/**
 * Complete password reset using the token from the email link.
 */
export async function completePasswordReset(schema, { token, newPassword }) {
  const tokenHash = hashToken(token);
  const userId    = await consumePasswordResetToken(schema, tokenHash);

  if (!userId) {
    throw Object.assign(new Error('Token invalid or expired'), { status: 400 });
  }

  const newSalt = generateSalt();
  const newHash = hashPassword(newPassword, newSalt);

  await updatePassword(schema, userId, { passwordHash: newHash, salt: newSalt });
  await deleteAllUserSessions(schema, userId);

  await logAction(schema, {
    entityType: 'user',
    entityId:   userId,
    action:     'updated',
    fieldName:  'password',
    changedBy:  userId,
  });

  logger.info('Password reset completed', { userId, schema });
}

/**
 * Set session cookies on the response.
 * Two cookies:
 *   authToken    — the session token (httpOnly, not readable by JS)
 *   tenantDomain — the email domain (readable by JS for schema routing)
 */
export function setSessionCookies(res, { rawToken, emailDomain }) {
  const cookieBase = {
    httpOnly: true,
    secure:   IS_PRODUCTION,
    sameSite: 'strict',
    maxAge:   COOKIE_MAX_AGE,
  };

  res.cookie(SESSION_COOKIE, rawToken, cookieBase);
  res.cookie(DOMAIN_COOKIE, emailDomain, {
    ...cookieBase,
    httpOnly: false, // readable by JS — contains only the domain, no secrets
  });
}

/**
 * Clear session cookies on the response.
 */
export function clearSessionCookies(res) {
  res.clearCookie(SESSION_COOKIE);
  res.clearCookie(DOMAIN_COOKIE);
}
