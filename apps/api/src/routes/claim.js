/**
 * Account claiming routes — for professors imported from SARS
 * who need to set a real password and activate their account.
 *
 * POST /api/claim/check        Check if an email has a claimable account
 * POST /api/claim/send         Send a claim link to the professor's email
 * GET  /api/claim/:token       Validate a claim token
 * POST /api/claim/:token       Complete the claim — set password, activate
 */
import { Router }     from 'express';
import { z }          from 'zod';
import crypto         from 'crypto';
import { tenantQuery,
         tenantTransaction } from '../db/tenantPool.js';
import pool           from '../db/pool.js';
import { hashPassword,
         generateSalt } from '../utils/crypto.js';
import { logger }     from '../utils/logger.js';

const router = Router();

const CLAIM_TOKEN_TTL_HOURS = 24;

// ── POST /api/claim/check ─────────────────────────────────────────────────────
// Returns whether an email has a claimable account (placeholder professor)
router.post('/check', async (req, res, next) => {
  try {
    const { email } = z.object({
      email: z.string().email().toLowerCase().trim(),
    }).parse(req.body);

    // Find which institution this email belongs to
    const domain = email.split('@')[1];
    const instResult = await pool.query(
      `SELECT id, slug FROM public.institution
       WHERE email_domain = $1 AND is_active = TRUE`,
      [domain]
    );

    if (!instResult.rows.length) {
      // Don't reveal whether institution exists
      return res.json({ ok: true, claimable: false });
    }

    const schema = instResult.rows[0].slug;

    // Check for a placeholder professor account
    const userResult = await tenantQuery(schema,
      `SELECT u.id, u.is_active, u.password_hash
       FROM "user" u
       JOIN user_role ur ON ur.user_id = u.id
         AND ur.role = 'professor' AND ur.is_active = TRUE
       WHERE u.email = $1`,
      [email]
    );

    if (!userResult.rows.length) {
      return res.json({ ok: true, claimable: false });
    }

    const user = userResult.rows[0];

    // Claimable if password is the placeholder value or account is inactive
    const isPlaceholder = user.password_hash === 'not_set' ||
                          user.password_hash === 'placeholder_not_usable';
    const claimable = isPlaceholder || !user.is_active;

    res.json({ ok: true, claimable, alreadyActive: user.is_active && !isPlaceholder });
  } catch (err) { next(err); }
});

// ── POST /api/claim/send ──────────────────────────────────────────────────────
// Sends a claim link to the professor's email
router.post('/send', async (req, res, next) => {
  try {
    const { email } = z.object({
      email: z.string().email().toLowerCase().trim(),
    }).parse(req.body);

    const domain = email.split('@')[1];
    const instResult = await pool.query(
      `SELECT id, slug, name FROM public.institution
       WHERE email_domain = $1 AND is_active = TRUE`,
      [domain]
    );

    if (!instResult.rows.length) {
      // Always return ok to prevent email enumeration
      return res.json({ ok: true, message: 'If an account exists, a link has been sent' });
    }

    const { slug: schema, name: institutionName } = instResult.rows[0];

    const userResult = await tenantQuery(schema,
      `SELECT u.id FROM "user" u
       JOIN user_role ur ON ur.user_id = u.id
         AND ur.role = 'professor' AND ur.is_active = TRUE
       WHERE u.email = $1
         AND (u.password_hash = 'not_set'
              OR u.password_hash = 'placeholder_not_usable'
              OR u.is_active = FALSE)`,
      [email]
    );

    if (!userResult.rows.length) {
      return res.json({ ok: true, message: 'If an account exists, a link has been sent' });
    }

    const userId = userResult.rows[0].id;

    // Generate claim token — store in password_reset_token table
    const token     = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + CLAIM_TOKEN_TTL_HOURS * 60 * 60 * 1000);

    // Delete any existing tokens for this user first
    await tenantQuery(schema,
      `DELETE FROM password_reset_token WHERE user_id = $1`,
      [userId]
    );
    await tenantQuery(schema,
      `INSERT INTO password_reset_token (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [userId, token, expiresAt]
    );

    const claimUrl = `${process.env.APP_URL ?? 'http://localhost:5173'}/claim/${token}`;

    // In dev, log the URL. In production, send email via Resend.
    if (process.env.NODE_ENV !== 'production') {
      logger.info('CLAIM LINK (dev)', { email, claimUrl });
      console.log(`\n[CLAIM LINK] ${email}\n${claimUrl}\n`);
    } else {
      // TODO: send via @clearpath/email sendEmail()
      // sendEmail({ to: email, subject: 'Activate your Clearpath account', ... })
    }

    res.json({ ok: true, message: 'If an account exists, a link has been sent' });
  } catch (err) { next(err); }
});

// ── GET /api/claim/:token ─────────────────────────────────────────────────────
// Validate a claim token — called when the professor opens the link
router.get('/:token', async (req, res, next) => {
  try {
    const { token } = req.params;

    // Find token across all tenant schemas
    const institutions = await pool.query(
      `SELECT slug FROM public.institution WHERE is_active = TRUE`
    );

    for (const { slug: schema } of institutions.rows) {
      const result = await tenantQuery(schema,
        `SELECT prt.user_id, prt.expires_at, prt.used_at,
                u.email, u.first_name, u.last_name
         FROM password_reset_token prt
         JOIN "user" u ON u.id = prt.user_id
         WHERE prt.token_hash = $1`,
        [token]
      );

      if (!result.rows.length) continue;

      const row = result.rows[0];

      if (row.used_at) {
        return res.status(410).json({ ok: false, error: 'This link has already been used' });
      }
      if (new Date(row.expires_at) < new Date()) {
        return res.status(410).json({ ok: false, error: 'This link has expired — request a new one' });
      }

      return res.json({
        ok:    true,
        email: row.email,
        name:  `${row.first_name} ${row.last_name}`.trim(),
      });
    }

    res.status(404).json({ ok: false, error: 'Invalid claim link' });
  } catch (err) { next(err); }
});

// ── POST /api/claim/:token ────────────────────────────────────────────────────
// Complete the claim — set password and activate the account
router.post('/:token', async (req, res, next) => {
  try {
    const { password } = z.object({
      password: z.string().min(12, 'Password must be at least 12 characters'),
    }).parse(req.body);

    const { token } = req.params;

    // Find token across all tenant schemas
    const institutions = await pool.query(
      `SELECT slug FROM public.institution WHERE is_active = TRUE`
    );

    for (const { slug: schema } of institutions.rows) {
      const result = await tenantQuery(schema,
        `SELECT prt.user_id, prt.expires_at, prt.used_at
         FROM password_reset_token prt
         WHERE prt.token_hash = $1`,
        [token]
      );

      if (!result.rows.length) continue;

      const row = result.rows[0];

      if (row.used_at) {
        return res.status(410).json({ ok: false, error: 'This link has already been used' });
      }
      if (new Date(row.expires_at) < new Date()) {
        return res.status(410).json({ ok: false, error: 'This link has expired' });
      }

      // Set password and activate account in a transaction
      await tenantTransaction(schema, async (client) => {
        const salt         = generateSalt();
        const passwordHash = hashPassword(password, salt);

        await client.query(
          `UPDATE "user"
           SET password_hash = $1,
               salt          = $2,
               is_active     = TRUE,
               updated_at    = NOW()
           WHERE id = $3`,
          [passwordHash, salt, row.user_id]
        );

        // Mark token used
        await client.query(
          `UPDATE password_reset_token
           SET used_at = NOW()
           WHERE token_hash = $1`,
          [token]
        );
      });

      logger.info('Account claimed', { userId: row.user_id, schema });
      return res.json({ ok: true, message: 'Account activated — you can now sign in' });
    }

    res.status(404).json({ ok: false, error: 'Invalid claim link' });
  } catch (err) { next(err); }
});

export default router;