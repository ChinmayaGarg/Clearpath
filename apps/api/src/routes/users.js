/**
 * User & Role management routes
 *
 * GET    /api/users                  List all users (admin only)
 * GET    /api/users/:id              Get one user with roles + profiles
 * POST   /api/users/invite           Invite a new user
 * POST   /api/users/:id/roles        Grant a role to a user
 * DELETE /api/users/:id/roles/:role  Revoke a role from a user
 * PUT    /api/users/:id/profile      Update role-specific profile data
 * PUT    /api/users/:id/disable      Deactivate a user (kills all sessions)
 * PUT    /api/users/:id/enable       Reactivate a user
 * GET    /api/users/:id/audit        Get audit trail for a user
 */
import { Router }         from 'express';
import { requireAuth }    from '../middleware/auth.js';
import { requireRole }    from '../middleware/role.js';
import { requireFeature } from '../middleware/feature.js';
import {
  inviteUserSchema,
  grantRoleSchema,
  updateStudentProfileSchema,
} from '../utils/validation.js';
import {
  getAllUsers,
  getUser,
  inviteUser,
  addRole,
  removeRole,
  disableUser,
  enableUser,
  updateProfile,
} from '../services/userService.js';
import { getAuditTrail } from '../db/queries/audit.js';

const router = Router();

// All user routes require authentication
router.use(requireAuth);

// ── GET /api/users ────────────────────────────────────────────────────────────
router.get('/',
  requireRole('institution_admin'),
  async (req, res, next) => {
    try {
      const users = await getAllUsers(req.tenantSchema);
      res.json({ ok: true, users });
    } catch (err) { next(err); }
  }
);

// ── GET /api/users/:id ────────────────────────────────────────────────────────
router.get('/:id',
  requireRole('institution_admin', 'lead'),
  async (req, res, next) => {
    try {
      const user = await getUser(req.tenantSchema, req.params.id);
      res.json({ ok: true, user });
    } catch (err) { next(err); }
  }
);

// ── POST /api/users/invite ────────────────────────────────────────────────────
router.post('/invite',
  requireRole('institution_admin'),
  requireFeature('multi_user_access'),
  async (req, res, next) => {
    try {
      const data = inviteUserSchema.parse(req.body);

      const result = await inviteUser(req.tenantSchema, {
        email:       data.email,
        firstName:   data.firstName,
        lastName:    data.lastName,
        roles:       data.roles,
        invitedBy:   req.user.id,
        emailDomain: req.user.emailDomain,
      });

      // TODO: send invite email via packages/email
      // In dev, return the temporary password for testing
      const response = {
        ok:     true,
        userId: result.userId,
        message: `Invitation created for ${data.email}`,
      };

      if (process.env.NODE_ENV !== 'production') {
        response._dev_temporaryPassword = result.temporaryPassword;
      }

      res.status(201).json(response);
    } catch (err) { next(err); }
  }
);

// ── POST /api/users/:id/roles ─────────────────────────────────────────────────
router.post('/:id/roles',
  requireRole('institution_admin'),
  async (req, res, next) => {
    try {
      const { role } = grantRoleSchema.parse(req.body);

      await addRole(req.tenantSchema, {
        targetUserId: req.params.id,
        role,
        grantedBy:    req.user.id,
      });

      res.json({ ok: true, message: `Role '${role}' granted` });
    } catch (err) { next(err); }
  }
);

// ── DELETE /api/users/:id/roles/:role ─────────────────────────────────────────
router.delete('/:id/roles/:role',
  requireRole('institution_admin'),
  async (req, res, next) => {
    try {
      const { role } = grantRoleSchema.parse({ role: req.params.role });

      await removeRole(req.tenantSchema, {
        targetUserId: req.params.id,
        role,
        revokedBy:    req.user.id,
      });

      res.json({ ok: true, message: `Role '${role}' revoked` });
    } catch (err) { next(err); }
  }
);

// ── PUT /api/users/:id/profile ────────────────────────────────────────────────
router.put('/:id/profile',
  async (req, res, next) => {
    try {
      // Users can update their own profile; admins can update anyone's
      const isOwn  = req.params.id === req.user.id;
      const isAdmin = req.userRoles.includes('institution_admin');

      if (!isOwn && !isAdmin) {
        return res.status(403).json({ ok: false, error: 'Cannot edit another user\'s profile' });
      }

      const data = updateStudentProfileSchema.parse(req.body);
      await updateProfile(req.tenantSchema, req.params.id, data);

      res.json({ ok: true, message: 'Profile updated' });
    } catch (err) { next(err); }
  }
);

// ── PUT /api/users/:id/disable ────────────────────────────────────────────────
router.put('/:id/disable',
  requireRole('institution_admin'),
  async (req, res, next) => {
    try {
      const result = await disableUser(req.tenantSchema, {
        targetUserId: req.params.id,
        disabledBy:   req.user.id,
      });

      res.json({
        ok:             true,
        message:        'User deactivated and all sessions terminated',
        sessionsKilled: result.sessionsKilled,
      });
    } catch (err) { next(err); }
  }
);

// ── PUT /api/users/:id/enable ─────────────────────────────────────────────────
router.put('/:id/enable',
  requireRole('institution_admin'),
  async (req, res, next) => {
    try {
      await enableUser(req.tenantSchema, {
        targetUserId: req.params.id,
        enabledBy:    req.user.id,
      });

      res.json({ ok: true, message: 'User reactivated' });
    } catch (err) { next(err); }
  }
);

// ── GET /api/users/:id/audit ──────────────────────────────────────────────────
router.get('/:id/audit',
  requireRole('institution_admin'),
  async (req, res, next) => {
    try {
      const trail = await getAuditTrail(req.tenantSchema, {
        entityType: 'user',
        entityId:   req.params.id,
        limit:      100,
      });

      res.json({ ok: true, audit: trail });
    } catch (err) { next(err); }
  }
);

export default router;
