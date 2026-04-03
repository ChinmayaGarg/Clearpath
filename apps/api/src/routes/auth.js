/**
 * Auth routes
 *
 * POST   /api/auth/login            Login with email + password
 * POST   /api/auth/logout           Logout (delete session)
 * GET    /api/auth/me               Get current user + roles + features
 * PUT    /api/auth/password         Change password (authenticated)
 * POST   /api/auth/password/reset   Request password reset email
 * PUT    /api/auth/password/reset   Complete password reset with token
 */
import { Router }          from 'express';
import { requireAuth }     from '../middleware/auth.js';
import { loginLimiter }    from '../middleware/rateLimiter.js';
import {
  loginSchema,
  changePasswordSchema,
  requestPasswordResetSchema,
  resetPasswordSchema,
} from '../utils/validation.js';
import {
  resolveSchemaFromEmail,
  login,
  logout,
  changePassword,
  initiatePasswordReset,
  completePasswordReset,
  setSessionCookies,
  clearSessionCookies,
} from '../services/authService.js';
import pool from '../db/pool.js';

const router = Router();

// ── POST /api/auth/login ──────────────────────────────────────────────────────
router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    // Resolve tenant schema from email domain
    const schema = await resolveSchemaFromEmail(email);
    if (!schema) {
      // Don't reveal institution existence
      return res.status(401).json({ ok: false, error: 'Invalid credentials' });
    }

    const result = await login(schema, {
      email,
      password,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    // Fetch features for this institution
    const featuresResult = await pool.query(
      `SELECT f.key
       FROM public.institution i
       JOIN public.plan_feature pf ON pf.plan_id = i.plan_id
       JOIN public.feature f ON f.id = pf.feature_id
       WHERE i.email_domain = $1 AND f.is_active = TRUE
       UNION
       SELECT f.key
       FROM public.institution_feature_grant g
       JOIN public.feature f ON f.id = g.feature_id
       JOIN public.institution i ON i.id = g.institution_id
       WHERE i.email_domain = $1
         AND g.is_active = TRUE
         AND f.is_active = TRUE
         AND (g.expires_at IS NULL OR g.expires_at > NOW())`,
      [result.emailDomain]
    );
    const features = featuresResult.rows.map(r => r.key);

    setSessionCookies(res, {
      rawToken:    result.rawToken,
      emailDomain: result.emailDomain,
    });

    res.json({
      ok:       true,
      user:     result.user,
      roles:    result.roles,
      features,
    });
  } catch (err) {
    // Don't leak Zod errors on login — just return 401
    if (err.name === 'ZodError') {
      return res.status(401).json({ ok: false, error: 'Invalid credentials' });
    }
    next(err);
  }
});

// ── POST /api/auth/logout ─────────────────────────────────────────────────────
router.post('/logout', requireAuth, async (req, res, next) => {
  try {
    await logout(req.tenantSchema, req.cookies);
    clearSessionCookies(res);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    // Fetch features for this institution
    const featuresResult = await pool.query(
      `SELECT f.key
       FROM public.institution i
       JOIN public.plan_feature pf ON pf.plan_id = i.plan_id
       JOIN public.feature f ON f.id = pf.feature_id
       WHERE i.id = $1 AND f.is_active = TRUE
       UNION
       SELECT f.key
       FROM public.institution_feature_grant g
       JOIN public.feature f ON f.id = g.feature_id
       WHERE g.institution_id = $1
         AND g.is_active = TRUE
         AND f.is_active = TRUE
         AND (g.expires_at IS NULL OR g.expires_at > NOW())`,
      [req.institutionId]
    );
    const features = featuresResult.rows.map(r => r.key);

    res.json({
      ok:       true,
      user:     req.user,
      roles:    req.userRoles,
      features,
    });
  } catch (err) {
    next(err);
  }
});

// ── PUT /api/auth/password ────────────────────────────────────────────────────
router.put('/password', requireAuth, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);

    await changePassword(req.tenantSchema, req.user.id, {
      currentPassword,
      newPassword,
    });

    // Clear cookies — user must log in again with new password
    clearSessionCookies(res);

    res.json({ ok: true, message: 'Password changed. Please log in again.' });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/auth/password/reset ─────────────────────────────────────────────
router.post('/password/reset', loginLimiter, async (req, res, next) => {
  try {
    const { email } = requestPasswordResetSchema.parse(req.body);

    const schema = await resolveSchemaFromEmail(email);

    if (schema) {
      const result = await initiatePasswordReset(schema, email);

      if (result) {
        // TODO: send email via packages/email
        // await sendPasswordResetEmail(result.user.email, result.rawToken);
        // For now log the token in dev only
        if (process.env.NODE_ENV !== 'production') {
          console.log(`[DEV] Password reset token for ${email}: ${result.rawToken}`);
        }
      }
    }

    // Always return 200 — prevents email enumeration
    res.json({
      ok:      true,
      message: 'If that email exists, a reset link has been sent.',
    });
  } catch (err) {
    next(err);
  }
});

// ── PUT /api/auth/password/reset ─────────────────────────────────────────────
router.put('/password/reset', loginLimiter, async (req, res, next) => {
  try {
    const { token, newPassword } = resetPasswordSchema.parse(req.body);

    // Token is 64 hex chars (32 bytes) — no schema needed, we look it up
    // by hashing the token and checking all active schemas.
    // For simplicity: require the email in the body to resolve schema first.
    // Alternative: store token hashes in a platform-level table.
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ ok: false, error: 'Email required' });
    }

    const schema = await resolveSchemaFromEmail(email);
    if (!schema) {
      return res.status(400).json({ ok: false, error: 'Token invalid or expired' });
    }

    await completePasswordReset(schema, { token, newPassword });

    res.json({ ok: true, message: 'Password reset. Please log in.' });
  } catch (err) {
    next(err);
  }
});

export default router;
