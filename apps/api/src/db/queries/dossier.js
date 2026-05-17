/**
 * CourseDossier query functions — all tenant-scoped.
 */
import { tenantQuery } from "../tenantPool.js";

/**
 * Get the dossier for a specific professor + course + term.
 * Returns null if no dossier exists yet.
 */
export async function getDossier(
  schema,
  { professorId, courseId, term = "current" },
) {
  const result = await tenantQuery(
    schema,
    `SELECT
       cd.id, cd.professor_id, cd.course_id, cd.term,
       c.code AS course_code,
       cd.preferred_delivery, cd.typical_materials,
       cd.password_reminder, cd.notes,
       cd.created_at, cd.updated_at,
       u.first_name || ' ' || u.last_name AS last_updated_by_name
     FROM course_dossier cd
     JOIN course c ON c.id = cd.course_id
     LEFT JOIN "user" u ON u.id = cd.last_updated_by
     WHERE cd.professor_id = $1
       AND cd.course_id = $2
       AND cd.term = $3`,
    [professorId, courseId, term],
  );
  return result.rows[0] ?? null;
}

/**
 * Get all dossiers for a professor — optionally filtered by term.
 */
export async function getDossiersForProfessor(
  schema,
  professorId,
  term = null,
) {
  const query = term
    ? `SELECT
         cd.id, cd.course_id, cd.term,
         c.code AS course_code,
         cd.preferred_delivery, cd.typical_materials,
         cd.password_reminder, cd.notes,
         cd.updated_at,
         u.first_name || ' ' || u.last_name AS last_updated_by_name
       FROM course_dossier cd
       JOIN course c ON c.id = cd.course_id
       LEFT JOIN "user" u ON u.id = cd.last_updated_by
       WHERE cd.professor_id = $1 AND cd.term = $2
       ORDER BY cd.term DESC, cd.updated_at DESC`
    : `SELECT
         cd.id, cd.course_id, cd.term,
         c.code AS course_code,
         cd.preferred_delivery, cd.typical_materials,
         cd.password_reminder, cd.notes,
         cd.updated_at,
         u.first_name || ' ' || u.last_name AS last_updated_by_name
       FROM course_dossier cd
       JOIN course c ON c.id = cd.course_id
       LEFT JOIN "user" u ON u.id = cd.last_updated_by
       WHERE cd.professor_id = $1
       ORDER BY cd.term DESC, cd.updated_at DESC`;

  const result = await tenantQuery(
    schema,
    query,
    term ? [professorId, term] : [professorId],
  );
  return result.rows;
}

/**
 * Get all dossiers for a course — by courseId UUID.
 */
export async function getDossiersByCourse(schema, courseId, term = null) {
  const query = term
    ? `SELECT
         cd.id, cd.course_id, cd.term,
         c.code AS course_code,
         cd.preferred_delivery, cd.typical_materials,
         cd.password_reminder, cd.notes,
         cd.updated_at,
         pp.id            AS professor_id,
         u.first_name || ' ' || u.last_name AS professor_name,
         u.email          AS professor_email,
         pp.department
       FROM course_dossier cd
       JOIN course          c  ON c.id  = cd.course_id
       JOIN professor_profile pp ON pp.id = cd.professor_id
       JOIN "user"            u  ON u.id  = pp.user_id
       WHERE cd.course_id = $1 AND cd.term = $2
       ORDER BY cd.updated_at DESC`
    : `SELECT
         cd.id, cd.course_id, cd.term,
         c.code AS course_code,
         cd.preferred_delivery, cd.typical_materials,
         cd.password_reminder, cd.notes,
         cd.updated_at,
         pp.id            AS professor_id,
         u.first_name || ' ' || u.last_name AS professor_name,
         u.email          AS professor_email,
         pp.department
       FROM course_dossier cd
       JOIN course          c  ON c.id  = cd.course_id
       JOIN professor_profile pp ON pp.id = cd.professor_id
       JOIN "user"            u  ON u.id  = pp.user_id
       WHERE cd.course_id = $1
       ORDER BY cd.updated_at DESC`;

  const result = await tenantQuery(
    schema,
    query,
    term ? [courseId, term] : [courseId],
  );
  return result.rows;
}

/**
 * Upsert a dossier entry.
 * Uses UNIQUE(professor_id, course_id, term) constraint.
 */
export async function upsertDossier(
  schema,
  {
    professorId,
    courseId,
    preferredDelivery,
    typicalMaterials,
    passwordReminder,
    notes,
    updatedBy,
    term = "current",
  },
) {
  const result = await tenantQuery(
    schema,
    `INSERT INTO course_dossier
       (professor_id, course_id, term, preferred_delivery,
        typical_materials, password_reminder, notes, last_updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (professor_id, course_id, term)
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
      courseId,
      term,
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
       c.code AS course_code, c.id AS course_id,
       cd.preferred_delivery, cd.typical_materials, cd.password_reminder,
       u.first_name || ' ' || u.last_name AS professor_name,
       u.email AS professor_email
     FROM course_dossier cd
     JOIN course          c  ON c.id  = cd.course_id
     JOIN professor_profile pp ON pp.id = cd.professor_id
     JOIN "user"            u  ON u.id  = pp.user_id
     WHERE c.code ILIKE $1
     ORDER BY cd.updated_at DESC
     LIMIT $2`,
    [`${query}%`, limit],
  );
  return result.rows;
}
