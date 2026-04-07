/**
 * CourseDossier service — business logic for professor preference management.
 *
 * The CourseDossier is Clearpath's institutional memory.
 * Every time a lead edits an exam or a professor email is replied to,
 * the dossier can be updated so the next lead starts with context.
 */
import {
  getDossier,
  getDossiersForProfessor,
  getDossiersByCourse,
  upsertDossier,
  learnFromExam,
  searchDossiers,
} from "../db/queries/dossier.js";
import { tenantQuery } from "../db/tenantPool.js";
import { logAction } from "../db/queries/audit.js";
import { logger } from "../utils/logger.js";

/**
 * Get the dossier for a course, optionally scoped to a professor.
 * Used when opening an exam to pre-fill delivery, materials etc.
 */
export async function getDossierForExam(schema, examId) {
  // Get the exam's professor and course code
  const examResult = await tenantQuery(
    schema,
    `SELECT course_code, professor_id FROM exam WHERE id = $1`,
    [examId],
  );
  const exam = examResult.rows[0];
  if (!exam) return null;

  // Try professor-specific dossier first
  if (exam.professor_id) {
    const dossier = await getDossier(schema, {
      professorId: exam.professor_id,
      courseCode: exam.course_code,
    });
    if (dossier) return { ...dossier, source: "professor_course" };
  }

  // Fall back to any dossier for this course code
  const courseDossiers = await getDossiersByCourse(schema, exam.course_code);
  if (courseDossiers.length) {
    return { ...courseDossiers[0], source: "course_only" };
  }

  return null;
}

/**
 * Get all dossiers for a professor — their full profile.
 */
export async function getProfessorDossiers(schema, professorId) {
  const dossiers = await getDossiersForProfessor(schema, professorId);

  // Also fetch professor identity info
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
    courseCode,
    preferredDelivery,
    typicalMaterials,
    passwordReminder,
    notes,
    savedBy,
  },
) {
  const result = await upsertDossier(schema, {
    professorId,
    courseCode,
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
    newValue: courseCode,
    changedBy: savedBy,
  });

  logger.info("Dossier saved", { professorId, courseCode, schema });
  return result;
}

export async function persistUploadDossier(schema, uploadId, savedBy = null) {
  const uploadResult = await tenantQuery(
    schema,
    `SELECT course_code, delivery, materials, password, professor_profile_id
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
    courseCode: upload.course_code,
    preferredDelivery,
    typicalMaterials: upload.materials ?? null,
    passwordReminder,
    notes: null,
    savedBy,
  });
}

/**
 * Pre-fill exam fields from the CourseDossier.
 * Returns suggested values — the lead can accept or override them.
 * Called when a lead opens an exam that has no delivery/materials yet.
 */
export async function prefillFromDossier(schema, examId) {
  const dossier = await getDossierForExam(schema, examId);
  if (!dossier) return null;

  // Only suggest fields that are empty on the exam
  const examResult = await tenantQuery(
    schema,
    `SELECT delivery, materials, password FROM exam WHERE id = $1`,
    [examId],
  );
  const exam = examResult.rows[0];
  if (!exam) return null;

  const suggestions = {};

  if (
    (!exam.delivery || exam.delivery === "pending") &&
    dossier.preferred_delivery
  ) {
    suggestions.delivery = dossier.preferred_delivery;
  }
  if (!exam.materials && dossier.typical_materials) {
    suggestions.materials = dossier.typical_materials;
  }

  return {
    suggestions,
    dossier,
    hasNotes: !!dossier.notes,
    passwordReminder: dossier.password_reminder,
  };
}

/**
 * Auto-learn from a completed exam.
 * Called when status reaches 'picked_up'.
 * Quietly updates the dossier with what worked — doesn't overwrite curated data.
 */
export async function autoLearnFromExam(schema, examId, userId) {
  try {
    const result = await learnFromExam(schema, examId, userId);
    if (result) {
      logger.info("Dossier auto-learned", {
        examId,
        courseCode: result.course_code,
        schema,
      });
    }
  } catch (err) {
    // Auto-learn is best-effort — never block the status change
    logger.warn("Dossier auto-learn failed", { examId, err: err.message });
  }
}

/**
 * Search dossiers by course code — for the autocomplete in exam edit forms.
 */
export async function searchCourseDossiers(schema, query) {
  if (!query || query.length < 2) return [];
  return searchDossiers(schema, query.toUpperCase());
}
