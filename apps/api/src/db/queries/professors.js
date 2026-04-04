/**
 * Professor query functions — all tenant-scoped.
 */
import { tenantQuery, tenantTransaction } from '../tenantPool.js';

/**
 * List all professors with summary stats.
 */
export async function listProfessors(schema) {
  const result = await tenantQuery(schema,
    `SELECT
       pp.id,
       u.first_name, u.last_name, u.email,
       pp.department, pp.phone, pp.office,
       u.is_active,
       COUNT(DISTINCT cd.course_code)  AS dossier_count,
       COUNT(DISTINCT e.id)            AS exam_count,
       MAX(ed.date)                    AS last_exam_date
     FROM professor_profile pp
     JOIN "user" u ON u.id = pp.user_id
     LEFT JOIN course_dossier cd ON cd.professor_id = pp.id
     LEFT JOIN exam           e  ON e.professor_id  = pp.id
     LEFT JOIN exam_day       ed ON ed.id = e.exam_day_id
     WHERE u.is_active = TRUE
       OR u.email NOT LIKE '%@student.placeholder%'
     GROUP BY pp.id, u.first_name, u.last_name,
              u.email, pp.department, pp.phone, pp.office, u.is_active
     ORDER BY u.last_name, u.first_name`
  );
  return result.rows;
}

/**
 * Search professors by name, email, or department.
 */
export async function searchProfessors(schema, query) {
  const result = await tenantQuery(schema,
    `SELECT
       pp.id,
       u.first_name, u.last_name, u.email,
       pp.department, pp.phone
     FROM professor_profile pp
     JOIN "user" u ON u.id = pp.user_id
     WHERE u.is_active = TRUE
       AND (
         u.first_name ILIKE $1 OR
         u.last_name  ILIKE $1 OR
         u.email      ILIKE $1 OR
         pp.department ILIKE $1 OR
         (u.first_name || ' ' || u.last_name) ILIKE $1
       )
     ORDER BY u.last_name, u.first_name
     LIMIT 20`,
    [`%${query}%`]
  );
  return result.rows;
}

/**
 * Get a single professor with full detail —
 * profile, dossiers, and recent exam history.
 */
export async function getProfessor(schema, professorId) {
  const [profResult, dossiersResult, examsResult] = await Promise.all([
    tenantQuery(schema,
      `SELECT
         pp.id, pp.department, pp.phone, pp.office,
         u.first_name, u.last_name, u.email, u.is_active
       FROM professor_profile pp
       JOIN "user" u ON u.id = pp.user_id
       WHERE pp.id = $1`,
      [professorId]
    ),
    tenantQuery(schema,
      `SELECT
         cd.id, cd.course_code, cd.preferred_delivery,
         cd.typical_materials, cd.password_reminder, cd.notes,
         cd.updated_at,
         u.first_name || ' ' || u.last_name AS last_updated_by_name
       FROM course_dossier cd
       LEFT JOIN "user" u ON u.id = cd.last_updated_by
       WHERE cd.professor_id = $1
       ORDER BY cd.updated_at DESC`,
      [professorId]
    ),
    tenantQuery(schema,
      `SELECT
         e.id, e.course_code, e.status, e.delivery,
         e.materials, e.exam_type, ed.date
       FROM exam e
       JOIN exam_day ed ON ed.id = e.exam_day_id
       WHERE e.professor_id = $1
       ORDER BY ed.date DESC
       LIMIT 20`,
      [professorId]
    ),
  ]);

  if (!profResult.rows.length) return null;

  return {
    ...profResult.rows[0],
    dossiers: dossiersResult.rows,
    recentExams: examsResult.rows,
  };
}

/**
 * Create a new professor (user + profile).
 */
export async function createProfessor(schema, {
  email, emailDomain, firstName, lastName,
  department, phone, office, createdBy,
}) {
  return tenantTransaction(schema, async (client) => {
    // Create user record
    const userResult = await client.query(
      `INSERT INTO "user"
         (email, email_domain, first_name, last_name,
          password_hash, salt, is_active, invited_by)
       VALUES ($1, $2, $3, $4, 'not_set', 'not_set', TRUE, $5)
       ON CONFLICT (email) DO UPDATE
         SET first_name = EXCLUDED.first_name,
             last_name  = EXCLUDED.last_name
       RETURNING id`,
      [email, emailDomain, firstName, lastName, createdBy]
    );
    const userId = userResult.rows[0].id;

    // Grant professor role
    await client.query(
      `INSERT INTO user_role (user_id, role, granted_by)
       VALUES ($1, 'professor', $2)
       ON CONFLICT (user_id, role) DO NOTHING`,
      [userId, createdBy]
    );

    // Create professor profile
    const profileResult = await client.query(
      `INSERT INTO professor_profile (user_id, department, phone, office)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id) DO UPDATE
         SET department = EXCLUDED.department,
             phone      = EXCLUDED.phone,
             office     = EXCLUDED.office
       RETURNING id`,
      [userId, department ?? null, phone ?? null, office ?? null]
    );

    return profileResult.rows[0].id;
  });
}

/**
 * Update professor profile fields.
 */
export async function updateProfessor(schema, professorId, {
  firstName, lastName, department, phone, office,
}) {
  await tenantTransaction(schema, async (client) => {
    // Update user name
    if (firstName || lastName) {
      await client.query(
        `UPDATE "user" u
         SET first_name = COALESCE($1, first_name),
             last_name  = COALESCE($2, last_name),
             updated_at = NOW()
         FROM professor_profile pp
         WHERE pp.user_id = u.id AND pp.id = $3`,
        [firstName ?? null, lastName ?? null, professorId]
      );
    }
    // Update profile
    await client.query(
      `UPDATE professor_profile
       SET department = COALESCE($1, department),
           phone      = COALESCE($2, phone),
           office     = COALESCE($3, office),
           updated_at = NOW()
       WHERE id = $4`,
      [department ?? null, phone ?? null, office ?? null, professorId]
    );
  });
}

/**
 * Link a professor to an exam.
 */
export async function linkProfessorToExam(schema, examId, professorId) {
  await tenantQuery(schema,
    `UPDATE exam SET professor_id = $1, updated_at = NOW() WHERE id = $2`,
    [professorId, examId]
  );
}
