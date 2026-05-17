/**
 * CourseDossier service — business logic for professor preference management.
 *
 * The CourseDossier is Clearpath's institutional memory.
 * Every time a lead edits an exam or a professor email is replied to,
 * the dossier can be updated so the next lead starts with context.
 */
import {
  getDossiersForProfessor,
  getDossiersByCourse,
  upsertDossier,
  searchDossiers,
} from "../db/queries/dossier.js";
import { tenantQuery } from "../db/tenantPool.js";
import { logAction } from "../db/queries/audit.js";
import { logger } from "../utils/logger.js";

/**
 * Get all dossiers for a professor — their full profile.
 */
export async function getProfessorDossiers(schema, professorId) {
  const dossiers = await getDossiersForProfessor(schema, professorId);

  const profResult = await tenantQuery(
    schema,
    `SELECT
       u.first_name, u.last_name, u.email,
       pp.department, pp.phone, pp.office
     FROM professor_profile pp
     JOIN "user" u ON u.id = pp.user_id
     WHERE pp.id = $1`,
    [professorId],
  );

  return {
    professor: profResult.rows[0] ?? null,
    dossiers,
  };
}

/**
 * Save or update a dossier entry.
 * Called when a lead manually edits the dossier for a course.
 */
export async function saveDossier(
  schema,
  {
    professorId,
    courseId,
    preferredDelivery,
    typicalMaterials,
    passwordReminder,
    notes,
    savedBy,
  },
) {
  const result = await upsertDossier(schema, {
    professorId,
    courseId,
    preferredDelivery,
    typicalMaterials,
    passwordReminder,
    notes,
    updatedBy: savedBy,
  });

  await logAction(schema, {
    entityType: "course_dossier",
    entityId: result.id,
    action: "updated",
    newValue: courseId,
    changedBy: savedBy,
  });

  logger.info("Dossier saved", { professorId, courseId, schema });
  return result;
}

export async function persistUploadDossier(schema, uploadId, savedBy = null) {
  const uploadResult = await tenantQuery(
    schema,
    `SELECT course_id, delivery, materials, password, professor_profile_id
     FROM exam_upload
     WHERE id = $1`,
    [uploadId],
  );

  const upload = uploadResult.rows[0];
  if (!upload || !upload.professor_profile_id) return null;

  const preferredDelivery =
    upload.delivery && upload.delivery !== "pending" ? upload.delivery : null;
  const passwordReminder = Boolean(upload.password);

  if (!preferredDelivery && !upload.materials && !passwordReminder) return null;

  return saveDossier(schema, {
    professorId: upload.professor_profile_id,
    courseId: upload.course_id,
    preferredDelivery,
    typicalMaterials: upload.materials ?? null,
    passwordReminder,
    notes: null,
    savedBy,
  });
}

/**
 * Search dossiers by course code — for the autocomplete in exam edit forms.
 */
export async function searchCourseDossiers(schema, query) {
  if (!query || query.length < 2) return [];
  return searchDossiers(schema, query.toUpperCase());
}
