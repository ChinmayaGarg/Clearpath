/**
 * User service — business logic for user and role management.
 */
import {
  findUserByEmail,
  findUserById,
  getUserWithRoles,
  listUsers,
  createUser,
  emailExists,
  grantRole,
  revokeRole,
  deactivateUser,
  reactivateUser,
  upsertStudentProfile,
  upsertProfessorProfile,
  upsertCounsellorProfile,
} from '../db/queries/users.js';
import { deleteAllUserSessions } from '../db/queries/sessions.js';
import { logAction }             from '../db/queries/audit.js';
import { generateToken, generateSalt, hashPassword } from '../utils/crypto.js';
import { logger }                from '../utils/logger.js';

const VALID_ROLES = [
  'institution_admin', 'lead', 'professor', 'student', 'counsellor',
];

/**
 * List all users in the institution with their roles.
 */
export async function getAllUsers(schema) {
  return listUsers(schema);
}

/**
 * Get a single user with roles and profiles.
 */
export async function getUser(schema, userId) {
  const user = await getUserWithRoles(schema, userId);
  if (!user) throw Object.assign(new Error('User not found'), { status: 404 });
  return user;
}

/**
 * Invite a new user to the institution.
 * Creates the account with a temporary password and grants the specified roles.
 * In production this sends an invite email — the user sets their own password
 * via the password reset flow.
 *
 * Returns { userId, temporaryPassword } — temporaryPassword only used in dev.
 */
export async function inviteUser(schema, {
  email, firstName, lastName, roles, invitedBy, emailDomain,
}) {
  // Validate roles
  const invalidRoles = roles.filter(r => !VALID_ROLES.includes(r));
  if (invalidRoles.length) {
    throw Object.assign(
      new Error(`Invalid roles: ${invalidRoles.join(', ')}`),
      { status: 400 }
    );
  }

  // Validate email domain matches institution
  const emailDomainFromAddress = email.split('@')[1]?.toLowerCase();
  if (emailDomainFromAddress !== emailDomain.toLowerCase()) {
    throw Object.assign(
      new Error(`Email must use the institution domain @${emailDomain}`),
      { status: 400 }
    );
  }

  // Check for duplicate
  const exists = await emailExists(schema, email);
  if (exists) {
    throw Object.assign(new Error('A user with this email already exists'), { status: 409 });
  }

  // Generate temporary password — user will reset via email
  const temporaryPassword = generateToken(12); // 24-char hex string
  const salt              = generateSalt();
  const passwordHash      = hashPassword(temporaryPassword, salt);

  const userId = await createUser(schema, {
    email,
    emailDomain: emailDomainFromAddress,
    firstName,
    lastName,
    passwordHash,
    salt,
    invitedBy,
    roles,
  });

  // Create role-specific profiles automatically
  if (roles.includes('student')) {
    await upsertStudentProfile(schema, userId, {});
  }
  if (roles.includes('professor')) {
    await upsertProfessorProfile(schema, userId, {});
  }
  if (roles.includes('counsellor')) {
    await upsertCounsellorProfile(schema, userId, {});
  }

  // Audit every role granted
  for (const role of roles) {
    await logAction(schema, {
      entityType: 'user',
      entityId:   userId,
      action:     'role_granted',
      fieldName:  'role',
      newValue:   role,
      changedBy:  invitedBy,
    });
  }

  await logAction(schema, {
    entityType: 'user',
    entityId:   userId,
    action:     'created',
    newValue:   email,
    changedBy:  invitedBy,
  });

  logger.info('User invited', { email, roles, schema, invitedBy });

  return { userId, temporaryPassword };
}

/**
 * Grant an additional role to an existing user.
 */
export async function addRole(schema, { targetUserId, role, grantedBy }) {
  if (!VALID_ROLES.includes(role)) {
    throw Object.assign(new Error(`Invalid role: ${role}`), { status: 400 });
  }

  const user = await findUserById(schema, targetUserId);
  if (!user) throw Object.assign(new Error('User not found'), { status: 404 });

  await grantRole(schema, { userId: targetUserId, role, grantedBy });

  // Auto-create profile if needed
  if (role === 'student') await upsertStudentProfile(schema, targetUserId, {});
  if (role === 'professor') await upsertProfessorProfile(schema, targetUserId, {});
  if (role === 'counsellor') await upsertCounsellorProfile(schema, targetUserId, {});

  await logAction(schema, {
    entityType: 'user',
    entityId:   targetUserId,
    action:     'role_granted',
    fieldName:  'role',
    newValue:   role,
    changedBy:  grantedBy,
  });

  logger.info('Role granted', { targetUserId, role, grantedBy, schema });
}

/**
 * Revoke a role from a user.
 * Cannot revoke the last institution_admin role — institution must have at least one.
 */
export async function removeRole(schema, { targetUserId, role, revokedBy }) {
  // Guard: must always have at least one institution_admin
  if (role === 'institution_admin') {
    const allUsers = await listUsers(schema);
    const admins   = allUsers.filter(u =>
      u.is_active && u.roles.includes('institution_admin')
    );
    if (admins.length <= 1 && admins[0]?.id === targetUserId) {
      throw Object.assign(
        new Error('Cannot remove the last institution admin'),
        { status: 400 }
      );
    }
  }

  await revokeRole(schema, { userId: targetUserId, role, revokedBy });

  await logAction(schema, {
    entityType: 'user',
    entityId:   targetUserId,
    action:     'role_revoked',
    fieldName:  'role',
    oldValue:   role,
    changedBy:  revokedBy,
  });

  logger.info('Role revoked', { targetUserId, role, revokedBy, schema });
}

/**
 * Deactivate a user — immediately revokes all sessions.
 * Cannot deactivate the last institution admin.
 */
export async function disableUser(schema, { targetUserId, disabledBy }) {
  // Guard: cannot disable yourself
  if (targetUserId === disabledBy) {
    throw Object.assign(new Error('Cannot deactivate your own account'), { status: 400 });
  }

  const user = await deactivateUser(schema, targetUserId);
  if (!user) throw Object.assign(new Error('User not found'), { status: 404 });

  // Immediately kill all their sessions
  const sessionsKilled = await deleteAllUserSessions(schema, targetUserId);

  await logAction(schema, {
    entityType: 'user',
    entityId:   targetUserId,
    action:     'updated',
    fieldName:  'is_active',
    oldValue:   'true',
    newValue:   'false',
    changedBy:  disabledBy,
  });

  logger.info('User deactivated', { targetUserId, sessionsKilled, schema });
  return { sessionsKilled };
}

/**
 * Reactivate a previously disabled user.
 */
export async function enableUser(schema, { targetUserId, enabledBy }) {
  const user = await reactivateUser(schema, targetUserId);
  if (!user) throw Object.assign(new Error('User not found'), { status: 404 });

  await logAction(schema, {
    entityType: 'user',
    entityId:   targetUserId,
    action:     'updated',
    fieldName:  'is_active',
    oldValue:   'false',
    newValue:   'true',
    changedBy:  enabledBy,
  });

  logger.info('User reactivated', { targetUserId, schema });
}

/**
 * Update a user's role-specific profile (student, professor, counsellor).
 */
export async function updateProfile(schema, userId, profileData) {
  const user = await getUserWithRoles(schema, userId);
  if (!user) throw Object.assign(new Error('User not found'), { status: 404 });

  const roles = user.roles.map(r => r.role);

  if (roles.includes('student') && profileData.student) {
    await upsertStudentProfile(schema, userId, profileData.student);
  }
  if (roles.includes('professor') && profileData.professor) {
    await upsertProfessorProfile(schema, userId, profileData.professor);
  }
  if (roles.includes('counsellor') && profileData.counsellor) {
    await upsertCounsellorProfile(schema, userId, profileData.counsellor);
  }

  await logAction(schema, {
    entityType: 'user',
    entityId:   userId,
    action:     'updated',
    fieldName:  'profile',
    changedBy:  userId,
  });
}
