/**
 * Book service — business logic for exam days and exams.
 */
import {
  listExamDays, getExamDay, getExamsForDay,
  createExamDay, updateExamDay,
} from '../db/queries/books.js';
import {
  getExam, createExam, updateExam, deleteExam,
  updateExamStatus, upsertExamRoom, deleteExamRoom,
  getStatusHistory, getExamsNeedingAttention,
} from '../db/queries/exams.js';
import { logAction } from '../db/queries/audit.js';
import { logger }    from '../utils/logger.js';

// ── ExamDay (Book) ────────────────────────────────────────────────────────────

export async function getAllBooks(schema) {
  return listExamDays(schema);
}

/**
 * Get the full daily book — exam day + all exams with rooms.
 * This is the primary payload for the book view.
 */
export async function getBook(schema, date) {
  const examDay = await getExamDay(schema, date);
  if (!examDay) return null;

  const exams           = await getExamsForDay(schema, examDay.id);
  const needsAttention  = await getExamsNeedingAttention(schema, date);

  return {
    ...examDay,
    exams,
    needsAttention,
    stats: {
      total:     exams.length,
      pending:   exams.filter(e => e.status === 'pending').length,
      emailed:   exams.filter(e => e.status === 'emailed').length,
      received:  exams.filter(e => e.status === 'received').length,
      written:   exams.filter(e => e.status === 'written').length,
      pickedUp:  exams.filter(e => e.status === 'picked_up').length,
      cancelled: exams.filter(e => e.status === 'cancelled').length,
      rwgCount:  exams.filter(e => e.rwg_flag).length,
      students:  exams.reduce((sum, e) => sum + Number(e.total_students), 0),
    },
  };
}

/**
 * Create a new book for a date.
 * Idempotent — returns existing book if one exists for that date.
 */
export async function createBook(schema, { date, createdBy, notes }) {
  try {
    const book = await createExamDay(schema, { date, createdBy, notes });
    logger.info('Book created', { date, schema });
    return book;
  } catch (err) {
    // Unique constraint violation — book already exists
    if (err.code === '23505') {
      return getExamDay(schema, date);
    }
    throw err;
  }
}

export async function updateBook(schema, id, fields) {
  return updateExamDay(schema, id, fields);
}

// ── Exams ─────────────────────────────────────────────────────────────────────

export async function getOneExam(schema, examId) {
  const exam = await getExam(schema, examId);
  if (!exam) throw Object.assign(new Error('Exam not found'), { status: 404 });
  return exam;
}

/**
 * Create an exam on a book.
 * Validates the exam day exists before inserting.
 */
export async function addExam(schema, examDayId, examData, createdBy) {
  const examDay = await getExamDay(schema,
    // resolve date from examDayId
    (await (async () => {
      const { tenantQuery } = await import('../db/tenantPool.js');
      const r = await tenantQuery(schema,
        `SELECT date FROM exam_day WHERE id = $1`, [examDayId]
      );
      return r.rows[0]?.date;
    })())
  );

  const examId = await createExam(schema, { examDayId, ...examData });

  await logAction(schema, {
    entityType: 'exam',
    entityId:   examId,
    action:     'created',
    newValue:   examData.courseCode,
    changedBy:  createdBy,
  });

  logger.info('Exam created', { examId, courseCode: examData.courseCode, schema });
  return getExam(schema, examId);
}

/**
 * Edit exam fields.
 * Logs each changed field individually to the audit trail.
 */
export async function editExam(schema, examId, newFields, changedBy) {
  const before = await getExam(schema, examId);
  if (!before) throw Object.assign(new Error('Exam not found'), { status: 404 });

  const fieldMap = {
    courseCode:      'course_code',
    crossListedCode: 'cross_listed_code',
    durationMins:    'duration_mins',
    examType:        'exam_type',
    delivery:        'delivery',
    materials:       'materials',
    password:        'password',
    rwgFlag:         'rwg_flag',
    professorId:     'professor_id',
  };

  const dbFields = {};
  for (const [camelKey, dbKey] of Object.entries(fieldMap)) {
    if (newFields[camelKey] !== undefined) {
      dbFields[dbKey] = newFields[camelKey];
    }
  }

  const updated = await updateExam(schema, examId, dbFields);

  // Audit each field that changed
  for (const [camelKey, dbKey] of Object.entries(fieldMap)) {
    if (newFields[camelKey] === undefined) continue;
    const oldVal = String(before[dbKey] ?? '');
    const newVal = String(newFields[camelKey] ?? '');
    if (oldVal !== newVal) {
      await logAction(schema, {
        entityType: 'exam',
        entityId:   examId,
        action:     'updated',
        fieldName:  camelKey,
        oldValue:   oldVal,
        newValue:   newVal,
        changedBy,
      });
    }
  }

  return updated;
}

/**
 * Advance exam status.
 */
export async function changeExamStatus(schema, examId, { toStatus, changedBy, note }) {
  const result = await updateExamStatus(schema, examId, { toStatus, changedBy, note });

  await logAction(schema, {
    entityType: 'exam',
    entityId:   examId,
    action:     'status_changed',
    fieldName:  'status',
    oldValue:   result.fromStatus,
    newValue:   result.toStatus,
    changedBy,
  });

  logger.info('Exam status changed', { examId, ...result, schema });
  return result;
}

export async function removeExam(schema, examId, deletedBy) {
  await deleteExam(schema, examId);
  await logAction(schema, {
    entityType: 'exam',
    entityId:   examId,
    action:     'deleted',
    changedBy:  deletedBy,
  });
}

export async function saveExamRoom(schema, examId, roomData, changedBy) {
  const room = await upsertExamRoom(schema, examId, roomData);
  await logAction(schema, {
    entityType: 'exam_room',
    entityId:   room.id,
    action:     roomData.roomId ? 'updated' : 'created',
    changedBy,
  });
  return room;
}

export async function removeExamRoom(schema, examId, roomId, changedBy) {
  await deleteExamRoom(schema, examId, roomId);
  await logAction(schema, {
    entityType: 'exam_room',
    entityId:   roomId,
    action:     'deleted',
    changedBy,
  });
}

export async function getExamHistory(schema, examId) {
  return getStatusHistory(schema, examId);
}
