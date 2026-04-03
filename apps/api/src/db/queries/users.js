/**
 * User query functions — all tenant-scoped.
 */
import { tenantQuery, tenantTransaction } from '../tenantPool.js';

/**
 * Find a user by email within a tenant schema.
 */
export async function findUserByEmail(schema, email) {
  const result = await tenantQuery(schema,
    `SELECT id, email, email_domain, first_name, last_name,
            password_hash, salt, is_active, last_login_at
     FROM "user"
     WHERE email = $1`,
    [email.toLowerCase()]
  );
  return result.rows[0] ?? null;
}

/**
 * Find a user by ID.
 */
export async function findUserById(schema, id) {
  const result = await tenantQuery(schema,
    `SELECT id, email, email_domain, first_name, last_name, is_active
     FROM "user"
     WHERE id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}

/**
 * Update last_login_at timestamp.
 */
export async function updateLastLogin(schema, userId) {
  await tenantQuery(schema,
    `UPDATE "user" SET last_login_at = NOW() WHERE id = $1`,
    [userId]
  );
}

/**
 * Update a user's password hash and salt.
 */
export async function updatePassword(schema, userId, { passwordHash, salt }) {
  await tenantQuery(schema,
    `UPDATE "user"
     SET password_hash = $1, salt = $2, updated_at = NOW()
     WHERE id = $3`,
    [passwordHash, salt, userId]
  );
}

/**
 * Create a password reset token for a user.
 * Expires in 1 hour. Invalidates any existing tokens for this user.
 */
export async function createPasswordResetToken(schema, userId, tokenHash) {
  await tenantQuery(schema,
    `DELETE FROM password_reset_token WHERE user_id = $1`,
    [userId]
  );
  const result = await tenantQuery(schema,
    `INSERT INTO password_reset_token (user_id, token_hash, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '1 hour')
     RETURNING id, expires_at`,
    [userId, tokenHash]
  );
  return result.rows[0];
}

/**
 * Find and consume a password reset token.
 * Returns the user_id if the token is valid and unused.
 * Marks the token as used atomically.
 */
export async function consumePasswordResetToken(schema, tokenHash) {
  return tenantTransaction(schema, async (client) => {
    const tokenResult = await client.query(
      `SELECT id, user_id, expires_at, used_at
       FROM password_reset_token
       WHERE token_hash = $1
         AND expires_at > NOW()
         AND used_at IS NULL`,
      [tokenHash]
    );
    const token = tokenResult.rows[0];
    if (!token) return null;

    await client.query(
      `UPDATE password_reset_token SET used_at = NOW() WHERE id = $1`,
      [token.id]
    );

    return token.user_id;
  });
}

/**
 * List all users in a tenant schema with their roles.
 */
export async function listUsers(schema) {
  const result = await tenantQuery(schema,
    `SELECT
       u.id, u.email, u.first_name, u.last_name,
       u.is_active, u.last_login_at, u.created_at,
       COALESCE(
         json_agg(ur.role ORDER BY ur.role)
         FILTER (WHERE ur.role IS NOT NULL AND ur.is_active = TRUE),
         '[]'
       ) AS roles
     FROM "user" u
     LEFT JOIN user_role ur ON ur.user_id = u.id
     GROUP BY u.id
     ORDER BY u.last_name, u.first_name`
  );
  return result.rows;
}

/**
 * Create a new user and assign roles in a single transaction.
 * Used during invitation flow.
 */
export async function createUser(schema, {
  email, emailDomain, firstName, lastName,
  passwordHash, salt, invitedBy, roles,
}) {
  return tenantTransaction(schema, async (client) => {
    const userResult = await client.query(
      `INSERT INTO "user"
         (email, email_domain, first_name, last_name, password_hash, salt, invited_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [email, emailDomain, firstName, lastName, passwordHash, salt, invitedBy]
    );
    const userId = userResult.rows[0].id;

    for (const role of roles) {
      await client.query(
        `INSERT INTO user_role (user_id, role, granted_by, granted_at)
         VALUES ($1, $2, $3, NOW())`,
        [userId, role, invitedBy]
      );
    }

    return userId;
  });
}

/**
 * Grant a role to a user.
 * Silently succeeds if the role already exists (idempotent).
 */
export async function grantRole(schema, { userId, role, grantedBy }) {
  await tenantQuery(schema,
    `INSERT INTO user_role (user_id, role, granted_by, granted_at, is_active)
     VALUES ($1, $2, $3, NOW(), TRUE)
     ON CONFLICT (user_id, role)
     DO UPDATE SET is_active = TRUE, granted_by = $3, granted_at = NOW()`,
    [userId, role, grantedBy]
  );
}

/**
 * Revoke a role from a user.
 * Soft delete — sets is_active = FALSE, preserves history.
 */
export async function revokeRole(schema, { userId, role, revokedBy }) {
  const result = await tenantQuery(schema,
    `UPDATE user_role
     SET is_active = FALSE
     WHERE user_id = $1 AND role = $2
     RETURNING id`,
    [userId, role]
  );
  if (result.rowCount === 0) {
    throw Object.assign(new Error('Role not found for this user'), { status: 404 });
  }
  // Audit the revocation
  return result.rows[0];
}

/**
 * Deactivate a user — prevents login but preserves all data and audit trail.
 */
export async function deactivateUser(schema, userId) {
  const result = await tenantQuery(schema,
    `UPDATE "user"
     SET is_active = FALSE, updated_at = NOW()
     WHERE id = $1
     RETURNING id, email`,
    [userId]
  );
  return result.rows[0] ?? null;
}

/**
 * Reactivate a previously deactivated user.
 */
export async function reactivateUser(schema, userId) {
  const result = await tenantQuery(schema,
    `UPDATE "user"
     SET is_active = TRUE, updated_at = NOW()
     WHERE id = $1
     RETURNING id, email`,
    [userId]
  );
  return result.rows[0] ?? null;
}

/**
 * Check whether an email already exists in this tenant schema.
 */
export async function emailExists(schema, email) {
  const result = await tenantQuery(schema,
    `SELECT 1 FROM "user" WHERE email = $1 LIMIT 1`,
    [email.toLowerCase()]
  );
  return result.rows.length > 0;
}

/**
 * Get a single user with their roles and profile summaries.
 */
export async function getUserWithRoles(schema, userId) {
  const result = await tenantQuery(schema,
    `SELECT
       u.id, u.email, u.first_name, u.last_name,
       u.is_active, u.last_login_at, u.created_at,
       COALESCE(
         json_agg(
           json_build_object('role', ur.role, 'granted_at', ur.granted_at)
           ORDER BY ur.role
         ) FILTER (WHERE ur.role IS NOT NULL AND ur.is_active = TRUE),
         '[]'
       ) AS roles,
       sp.student_number,
       sp.phone        AS student_phone,
       pp.department   AS prof_department,
       pp.office       AS prof_office
     FROM "user" u
     LEFT JOIN user_role       ur ON ur.user_id = u.id
     LEFT JOIN student_profile sp ON sp.user_id = u.id
     LEFT JOIN professor_profile pp ON pp.user_id = u.id
     WHERE u.id = $1
     GROUP BY u.id, sp.student_number, sp.phone, pp.department, pp.office`,
    [userId]
  );
  return result.rows[0] ?? null;
}

/**
 * Create or update a StudentProfile for a user.
 */
export async function upsertStudentProfile(schema, userId, { studentNumber, phone, doNotCall }) {
  await tenantQuery(schema,
    `INSERT INTO student_profile (user_id, student_number, phone, do_not_call)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id)
     DO UPDATE SET
       student_number = EXCLUDED.student_number,
       phone          = EXCLUDED.phone,
       do_not_call    = EXCLUDED.do_not_call,
       updated_at     = NOW()`,
    [userId, studentNumber ?? null, phone ?? null, doNotCall ?? false]
  );
}

/**
 * Create or update a ProfessorProfile for a user.
 */
export async function upsertProfessorProfile(schema, userId, { department, phone, office }) {
  await tenantQuery(schema,
    `INSERT INTO professor_profile (user_id, department, phone, office)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id)
     DO UPDATE SET
       department = EXCLUDED.department,
       phone      = EXCLUDED.phone,
       office     = EXCLUDED.office,
       updated_at = NOW()`,
    [userId, department ?? null, phone ?? null, office ?? null]
  );
}

/**
 * Create or update a CounsellorProfile for a user.
 */
export async function upsertCounsellorProfile(schema, userId, { department }) {
  await tenantQuery(schema,
    `INSERT INTO counsellor_profile (user_id, department)
     VALUES ($1, $2)
     ON CONFLICT (user_id)
     DO UPDATE SET
       department = EXCLUDED.department,
       updated_at = NOW()`,
    [userId, department ?? null]
  );
}
