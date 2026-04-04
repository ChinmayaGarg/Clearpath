/**
 * CourseDossier query functions — all tenant-scoped.
 */
import { tenantQuery, tenantTransaction } from '../tenantPool.js';

/**
 * Get the dossier for a specific professor + course combination.
 * Returns null if no dossier exists yet.
 */
export async function getDossier(schema, { professorId, courseCode }) {
  const result = await tenantQuery(schema,
    `SELECT
       cd.id, cd.professor_id, cd.course_code,
       cd.preferred_delivery, cd.typical_materials,
       cd.password_reminder, cd.notes,
       cd.created_at, cd.updated_at,
       u.first_name || ' ' || u.last_name AS last_updated_by_name
     FROM course_dossier cd
     LEFT JOIN "user" u ON u.id = cd.last_updated_by
     WHERE cd.professor_id = $1
       AND UPPER(cd.course_code) = UPPER($2)`,
    [professorId, courseCode]
  );
  return result.rows[0] ?? null;
}

/**
 * Get all dossiers for a professor — their full knowledge base.
 */
export async function getDossiersForProfessor(schema, professorId) {
  const result = await tenantQuery(schema,
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
  );
  return result.rows;
}

/**
 * Get all dossiers for a course code — useful when multiple professors
 * share a course, or for searching across the institution.
 */
export async function getDossiersByCourse(schema, courseCode) {
  const result = await tenantQuery(schema,
    `SELECT
       cd.id, cd.course_code, cd.preferred_delivery,
       cd.typical_materials, cd.password_reminder, cd.notes,
       cd.updated_at,
       pp.id            AS professor_id,
       u.first_name || ' ' || u.last_name AS professor_name,
       u.email          AS professor_email,
       pp.department
     FROM course_dossier cd
     JOIN professor_profile pp ON pp.id = cd.professor_id
     JOIN "user"            u  ON u.id  = pp.user_id
     WHERE UPPER(cd.course_code) = UPPER($1)
     ORDER BY cd.updated_at DESC`,
    [courseCode]
  );
  return result.rows;
}

/**
 * Upsert a dossier entry.
 * Creates on first save, updates on subsequent saves.
 * Uses UNIQUE(professor_id, course_code) constraint.
 */
export async function upsertDossier(schema, {
  professorId, courseCode, preferredDelivery,
  typicalMaterials, passwordReminder, notes, updatedBy,
}) {
  const result = await tenantQuery(schema,
    `INSERT INTO course_dossier
       (professor_id, course_code, preferred_delivery,
        typical_materials, password_reminder, notes, last_updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (professor_id, course_code)
     DO UPDATE SET
       preferred_delivery = EXCLUDED.preferred_delivery,
       typical_materials  = EXCLUDED.typical_materials,
       password_reminder  = EXCLUDED.password_reminder,
       notes              = EXCLUDED.notes,
       last_updated_by    = EXCLUDED.last_updated_by,
       updated_at         = NOW()
     RETURNING id, created_at, updated_at`,
    [
      professorId, courseCode.toUpperCase(),
      preferredDelivery ?? null, typicalMaterials ?? null,
      passwordReminder ?? false, notes ?? null, updatedBy,
    ]
  );
  return result.rows[0];
}

/**
 * Auto-learn from an exam that was successfully completed.
 * Called after an exam reaches 'picked_up' status to capture
 * what actually worked — delivery method, materials used.
 * Only updates fields that aren't already set to avoid overwriting
 * manually curated data.
 */
export async function learnFromExam(schema, examId, updatedBy) {
  return tenantTransaction(schema, async (client) => {
    // Get exam details
    const examResult = await client.query(
      `SELECT e.course_code, e.delivery, e.materials,
              e.professor_id, e.exam_type
       FROM exam e
       WHERE e.id = $1 AND e.professor_id IS NOT NULL`,
      [examId]
    );
    const exam = examResult.rows[0];
    if (!exam || !exam.professor_id) return null;

    // Check if dossier exists
    const existing = await client.query(
      `SELECT id, preferred_delivery, typical_materials
       FROM course_dossier
       WHERE professor_id = $1 AND UPPER(course_code) = UPPER($2)`,
      [exam.professor_id, exam.course_code]
    );

    if (existing.rows.length) {
      // Only fill empty fields — don't overwrite curated data
      const updates = [];
      const values  = [];
      let idx = 1;

      if (!existing.rows[0].preferred_delivery && exam.delivery && exam.delivery !== 'pending') {
        updates.push(`preferred_delivery = $${idx++}`);
        values.push(exam.delivery);
      }
      if (!existing.rows[0].typical_materials && exam.materials) {
        updates.push(`typical_materials = $${idx++}`);
        values.push(exam.materials);
      }

      if (updates.length) {
        updates.push(`last_updated_by = $${idx++}`, `updated_at = NOW()`);
        values.push(updatedBy, existing.rows[0].id);
        await client.query(
          `UPDATE course_dossier SET ${updates.join(', ')}
           WHERE id = $${idx}`,
          values
        );
      }
    } else {
      // Create a new dossier entry from this exam's data
      if (exam.delivery && exam.delivery !== 'pending') {
        await client.query(
          `INSERT INTO course_dossier
             (professor_id, course_code, preferred_delivery,
              typical_materials, last_updated_by)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (professor_id, course_code) DO NOTHING`,
          [
            exam.professor_id, exam.course_code.toUpperCase(),
            exam.delivery, exam.materials ?? null, updatedBy,
          ]
        );
      }
    }

    return exam;
  });
}

/**
 * Search dossiers by course code prefix — for autocomplete.
 */
export async function searchDossiers(schema, query, limit = 10) {
  const result = await tenantQuery(schema,
    `SELECT
       cd.course_code, cd.preferred_delivery,
       cd.typical_materials, cd.password_reminder,
       u.first_name || ' ' || u.last_name AS professor_name,
       u.email AS professor_email
     FROM course_dossier cd
     JOIN professor_profile pp ON pp.id = cd.professor_id
     JOIN "user"            u  ON u.id  = pp.user_id
     WHERE cd.course_code ILIKE $1
     ORDER BY cd.updated_at DESC
     LIMIT $2`,
    [`${query}%`, limit]
  );
  return result.rows;
}
