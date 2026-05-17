/**
 * CourseDossier service — business logic for professor preference management.
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
 * Save or update a dossier entry for a specific course offering.
 */
export async function saveDossier(
  schema,
  {
    professorId,
    courseOfferingId,
    preferredDelivery,
    typicalMaterials,
    passwordReminder,
    notes,
    savedBy,
  },
) {
  const result = await upsertDossier(schema, {
    professorId,
    courseOfferingId,
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
    newValue: courseOfferingId,
    changedBy: savedBy,
  });

  logger.info("Dossier saved", { professorId, courseOfferingId, schema });
  return result;
}

/**
 * Persist dossier preferences captured from a professor's exam upload.
 * Finds the professor's most recent active course_offering for this course
 * and updates its dossier with the delivery/materials preferences.
 */
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

  // Find the most recent course_offering this professor is linked to for this course
  const offeringResult = await tenantQuery(
    schema,
    `SELECT cd.course_offering_id
     FROM course_dossier cd
     JOIN course_offering co ON co.id = cd.course_offering_id
     JOIN term t ON t.id = co.term_id
     WHERE cd.professor_id = $1 AND co.course_id = $2
     ORDER BY t.start_date DESC NULLS LAST
     LIMIT 1`,
    [upload.professor_profile_id, upload.course_id],
  );

  if (!offeringResult.rows.length) return null;
  const { course_offering_id: courseOfferingId } = offeringResult.rows[0];

  return saveDossier(schema, {
    professorId: upload.professor_profile_id,
    courseOfferingId,
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
