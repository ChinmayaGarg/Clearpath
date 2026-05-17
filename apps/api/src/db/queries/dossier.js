/**
 * CourseDossier query functions — all tenant-scoped.
 * All dossier records are now linked to a course_offering (course + term pair).
 */
import { tenantQuery } from "../tenantPool.js";

const DOSSIER_SELECT = `
  cd.id, cd.professor_id, cd.course_offering_id,
  co.course_id, t.id AS term_id, t.label AS term,
  c.code AS course_code,
  cd.preferred_delivery, cd.typical_materials,
  cd.password_reminder, cd.notes,
  cd.created_at, cd.updated_at,
  u.first_name || ' ' || u.last_name AS last_updated_by_name
FROM course_dossier cd
JOIN course_offering co ON co.id = cd.course_offering_id
JOIN course c ON c.id = co.course_id
JOIN term t ON t.id = co.term_id
LEFT JOIN "user" u ON u.id = cd.last_updated_by`;

/**
 * Get the dossier for a specific professor + course_offering.
 */
export async function getDossier(schema, { professorId, courseOfferingId }) {
  const result = await tenantQuery(
    schema,
    `SELECT ${DOSSIER_SELECT}
     WHERE cd.professor_id = $1 AND cd.course_offering_id = $2`,
    [professorId, courseOfferingId],
  );
  return result.rows[0] ?? null;
}

/**
 * Get all dossiers for a professor — optionally filtered by term_id.
 */
export async function getDossiersForProfessor(schema, professorId, termId = null) {
  const result = await tenantQuery(
    schema,
    `SELECT ${DOSSIER_SELECT}
     WHERE cd.professor_id = $1
     ${termId ? 'AND co.term_id = $2' : ''}
     ORDER BY t.start_date DESC NULLS LAST, cd.updated_at DESC`,
    termId ? [professorId, termId] : [professorId],
  );
  return result.rows;
}

/**
 * Get all dossiers for a course (by courseId UUID) — optionally filtered by term_id.
 */
export async function getDossiersByCourse(schema, courseId, termId = null) {
  const result = await tenantQuery(
    schema,
    `SELECT
       cd.id, cd.course_offering_id,
       co.course_id, t.id AS term_id, t.label AS term,
       c.code AS course_code,
       cd.preferred_delivery, cd.typical_materials,
       cd.password_reminder, cd.notes,
       cd.updated_at,
       pp.id AS professor_id,
       u.first_name || ' ' || u.last_name AS professor_name,
       u.email AS professor_email,
       pp.department
     FROM course_dossier cd
     JOIN course_offering co ON co.id = cd.course_offering_id
     JOIN course c ON c.id = co.course_id
     JOIN term t ON t.id = co.term_id
     JOIN professor_profile pp ON pp.id = cd.professor_id
     JOIN "user" u ON u.id = pp.user_id
     WHERE co.course_id = $1
     ${termId ? 'AND co.term_id = $2' : ''}
     ORDER BY t.start_date DESC NULLS LAST, cd.updated_at DESC`,
    termId ? [courseId, termId] : [courseId],
  );
  return result.rows;
}

/**
 * Upsert a dossier entry.
 * Uses UNIQUE(professor_id, course_offering_id) constraint.
 */
export async function upsertDossier(
  schema,
  {
    professorId,
    courseOfferingId,
    preferredDelivery,
    typicalMaterials,
    passwordReminder,
    notes,
    updatedBy,
  },
) {
  const result = await tenantQuery(
    schema,
    `INSERT INTO course_dossier
       (professor_id, course_offering_id, preferred_delivery,
        typical_materials, password_reminder, notes, last_updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (professor_id, course_offering_id)
     DO UPDATE SET
       preferred_delivery = EXCLUDED.preferred_delivery,
       typical_materials  = EXCLUDED.typical_materials,
       password_reminder  = EXCLUDED.password_reminder,
       notes              = EXCLUDED.notes,
       last_updated_by    = EXCLUDED.last_updated_by,
       updated_at         = NOW()
     RETURNING id, created_at, updated_at`,
    [
      professorId,
      courseOfferingId,
      preferredDelivery ?? null,
      typicalMaterials ?? null,
      passwordReminder ?? false,
      notes ?? null,
      updatedBy,
    ],
  );
  return result.rows[0];
}

/**
 * Search dossiers by course code prefix — for autocomplete.
 */
export async function searchDossiers(schema, query, limit = 10) {
  const result = await tenantQuery(
    schema,
    `SELECT
       c.code AS course_code, co.course_id, t.label AS term,
       cd.preferred_delivery, cd.typical_materials, cd.password_reminder,
       u.first_name || ' ' || u.last_name AS professor_name,
       u.email AS professor_email
     FROM course_dossier cd
     JOIN course_offering co ON co.id = cd.course_offering_id
     JOIN course c ON c.id = co.course_id
     JOIN term t ON t.id = co.term_id
     JOIN professor_profile pp ON pp.id = cd.professor_id
     JOIN "user" u ON u.id = pp.user_id
     WHERE c.code ILIKE $1
     ORDER BY t.start_date DESC NULLS LAST, cd.updated_at DESC
     LIMIT $2`,
    [`${query}%`, limit],
  );
  return result.rows;
}
