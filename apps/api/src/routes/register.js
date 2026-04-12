/**
 * Public student self-registration route — no auth required.
 *
 * POST /api/register
 *   Creates a student_registration_request and a placeholder user account,
 *   then returns a claim URL so the student can activate their account.
 */
import { Router }          from 'express';
import { z }               from 'zod';
import crypto              from 'crypto';
import pool                from '../db/pool.js';
import { tenantQuery,
         tenantTransaction } from '../db/tenantPool.js';
import {
  createRegistrationRequest,
  createProviderFormRequest,
  linkRegistrationToProfile,
} from '../db/queries/studentRegistration.js';
import { logger } from '../utils/logger.js';

const router = Router();

const CLAIM_TOKEN_TTL_HOURS = 48;

const BodySchema = z.object({
  firstName:              z.string().min(1).max(100),
  lastName:               z.string().min(1).max(100),
  email:                  z.string().email().toLowerCase().trim(),
  studentNumber:          z.string().max(30).optional(),
  phone:                  z.string().max(30).optional(),
  studentStatusFlags:     z.array(z.string()).default([]),
  disabilityCategories:   z.array(z.string()).default([]),
  onMedication:           z.boolean().default(false),
  medicationDetails:      z.string().max(2000).optional(),
  academicImpact:         z.string().max(5000).optional(),
  pastAccommodations:     z.array(z.string()).default([]),
  requestedAccommodations: z.array(z.string()).default([]),
  providerName:           z.string().max(200).optional(),
  providerPhone:          z.string().max(30).optional(),
});

// ── POST /api/register ────────────────────────────────────────────────────────
router.post('/', async (req, res, next) => {
  try {
    const body = BodySchema.parse(req.body);
    const { email } = body;

    // Resolve institution by email domain
    const domain = email.split('@')[1];
    const instResult = await pool.query(
      `SELECT id, slug FROM public.institution
       WHERE email_domain = $1 AND is_active = TRUE`,
      [domain],
    );

    if (!instResult.rows.length) {
      // Don't reveal institutional configuration
      return res.json({
        ok: true,
        message: 'Registration submitted. Check your email to activate your account.',
      });
    }

    const schema = instResult.rows[0].slug;

    // Check if user already exists
    const existingUser = await tenantQuery(
      schema,
      `SELECT u.id, sp.id AS student_profile_id
       FROM "user" u
       LEFT JOIN student_profile sp ON sp.user_id = u.id
       WHERE u.email = $1`,
      [email],
    );

    let userId;
    let studentProfileId;

    if (existingUser.rows.length) {
      userId = existingUser.rows[0].id;
      studentProfileId = existingUser.rows[0].student_profile_id;

      // If they don't have a student_profile yet, create one
      if (!studentProfileId) {
        const spResult = await tenantQuery(
          schema,
          `INSERT INTO student_profile (user_id, student_number, phone)
           VALUES ($1, $2, $3)
           RETURNING id`,
          [userId, body.studentNumber ?? null, body.phone ?? null],
        );
        studentProfileId = spResult.rows[0].id;
      }
    } else {
      // Create placeholder user + student_profile in a transaction
      const result = await tenantTransaction(schema, async (client) => {
        const userResult = await client.query(
          `INSERT INTO "user"
             (email, email_domain, first_name, last_name,
              password_hash, salt, is_active)
           VALUES ($1, $2, $3, $4, 'not_set', 'not_set', FALSE)
           RETURNING id`,
          [email, domain, body.firstName, body.lastName],
        );
        const newUserId = userResult.rows[0].id;

        // Assign student role
        await client.query(
          `INSERT INTO user_role (user_id, role, granted_at, is_active)
           VALUES ($1, 'student', NOW(), TRUE)`,
          [newUserId],
        );

        // Create student_profile
        const spResult = await client.query(
          `INSERT INTO student_profile (user_id, student_number, phone)
           VALUES ($1, $2, $3)
           RETURNING id`,
          [newUserId, body.studentNumber ?? null, body.phone ?? null],
        );

        return { userId: newUserId, studentProfileId: spResult.rows[0].id };
      });
      userId = result.userId;
      studentProfileId = result.studentProfileId;
    }

    // Create the registration request
    const requestId = await createRegistrationRequest(schema, {
      studentProfileId,
      email:                  body.email,
      firstName:              body.firstName,
      lastName:               body.lastName,
      studentNumber:          body.studentNumber,
      phone:                  body.phone,
      studentStatusFlags:     body.studentStatusFlags,
      disabilityCategories:   body.disabilityCategories,
      onMedication:           body.onMedication,
      medicationDetails:      body.medicationDetails,
      academicImpact:         body.academicImpact,
      pastAccommodations:     body.pastAccommodations,
      requestedAccommodations: body.requestedAccommodations,
      providerName:           body.providerName,
      providerPhone:          body.providerPhone,
    });

    // Ensure student_profile is linked
    if (studentProfileId) {
      await linkRegistrationToProfile(schema, requestId, studentProfileId);
    }

    // Create provider form record if provider details given
    if (body.providerName || body.providerPhone) {
      await createProviderFormRequest(schema, {
        studentRegistrationRequestId: requestId,
        providerName:  body.providerName,
        providerPhone: body.providerPhone,
      });
    }

    // Generate claim token
    const token     = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + CLAIM_TOKEN_TTL_HOURS * 60 * 60 * 1000);

    await tenantQuery(
      schema,
      `DELETE FROM password_reset_token WHERE user_id = $1`,
      [userId],
    );
    await tenantQuery(
      schema,
      `INSERT INTO password_reset_token (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [userId, token, expiresAt],
    );

    const claimUrl = `${process.env.APP_URL ?? 'http://localhost:5173'}/claim/${token}`;

    if (process.env.NODE_ENV !== 'production') {
      logger.info('STUDENT REGISTRATION (dev)', { email, claimUrl, requestId });
      console.log(`\n[REGISTRATION CLAIM LINK] ${email}\n${claimUrl}\n`);
    }
    // TODO: send email in production

    const response = {
      ok: true,
      message: 'Registration submitted. Check your email to activate your account.',
    };
    if (process.env.NODE_ENV !== 'production') {
      response._dev_claimUrl = claimUrl;
    }

    res.json(response);
  } catch (err) { next(err); }
});

export default router;
