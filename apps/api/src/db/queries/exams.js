/**
 * Exam query functions — all tenant-scoped.
 */
import { tenantQuery, tenantTransaction } from '../tenantPool.js';

/**
 * Get a single exam by ID with rooms.
 */
export async function getExam(schema, examId) {
  const result = await tenantQuery(schema,
    `SELECT
       e.id, e.exam_day_id, e.course_code, e.cross_listed_code,
       e.duration_mins, e.exam_type, e.delivery,
       e.materials, e.password, e.status, e.rwg_flag,
       e.created_at, e.updated_at,
       pp.id                                  AS professor_id,
       pp.user_id                             AS professor_user_id,
       u.first_name || ' ' || u.last_name     AS professor_name,
       u.email                                AS professor_email,
       COALESCE(
         json_agg(
           json_build_object(
             'id',            er.id,
             'room_name',     er.room_name,
             'start_time',    er.start_time,
             'student_count', er.student_count
           ) ORDER BY er.start_time
         ) FILTER (WHERE er.id IS NOT NULL),
         '[]'
       ) AS rooms
     FROM exam e
     LEFT JOIN professor_profile pp ON pp.id = e.professor_id
     LEFT JOIN "user"            u  ON u.id  = pp.user_id
     LEFT JOIN exam_room         er ON er.exam_id = e.id
     LEFT JOIN exam_upload       eu ON eu.id = e.exam_upload_id
     WHERE e.id = $1
     GROUP BY e.id, pp.id, pp.user_id, u.first_name, u.last_name, u.email,
              eu.id, eu.course_code, eu.exam_type_label, eu.version_label,
              eu.delivery, eu.materials, eu.password, eu.rwg_flag,
              eu.is_makeup, eu.status, eu.submitted_at`,
    [examId]
  );
  return result.rows[0] ?? null;
}

/**
 * Create a new exam with its rooms in a single transaction.
 */
export async function createExam(schema, {
  examDayId, professorId, courseCode, crossListedCode,
  durationMins, examType, delivery, materials, password,
  rwgFlag, rooms,
}) {
  return tenantTransaction(schema, async (client) => {
    const examResult = await client.query(
      `INSERT INTO exam
         (exam_day_id, professor_id, course_code, cross_listed_code,
          duration_mins, exam_type, delivery, materials, password, rwg_flag)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING id`,
      [
        examDayId, professorId ?? null, courseCode, crossListedCode ?? null,
        durationMins ?? null, examType ?? 'paper', delivery ?? 'pending',
        materials ?? null, password ?? null, rwgFlag ?? false,
      ]
    );
    const examId = examResult.rows[0].id;

    // Insert rooms
    if (rooms?.length) {
      for (const room of rooms) {
        await client.query(
          `INSERT INTO exam_room (exam_id, room_name, start_time, student_count)
           VALUES ($1, $2, $3, $4)`,
          [examId, room.roomName, room.startTime, room.studentCount ?? 0]
        );
      }
    }

    // Record initial status event
    await client.query(
      `INSERT INTO status_event (exam_id, from_status, to_status, changed_by)
       VALUES ($1, NULL, 'pending', $2)`,
      [examId, null]
    );

    return examId;
  });
}

/**
 * Update exam fields — partial update, only non-null values applied.
 * Returns the updated exam.
 */
export async function updateExam(schema, examId, fields) {
  const allowed = [
    'course_code', 'cross_listed_code', 'duration_mins', 'exam_type',
    'delivery', 'materials', 'password', 'rwg_flag', 'professor_id',
  ];

  const setClauses = [];
  const values     = [];
  let   idx        = 1;

  for (const [key, value] of Object.entries(fields)) {
    if (!allowed.includes(key) || value === undefined) continue;
    setClauses.push(`${key} = $${idx}`);
    values.push(value);
    idx++;
  }

  if (setClauses.length === 0) return getExam(schema, examId);

  setClauses.push(`updated_at = NOW()`);
  values.push(examId);

  const result = await tenantQuery(schema,
    `UPDATE exam SET ${setClauses.join(', ')}
     WHERE id = $${idx}
     RETURNING id`,
    values
  );

  if (!result.rows.length) {
    throw Object.assign(new Error('Exam not found'), { status: 404 });
  }

  return getExam(schema, examId);
}

/**
 * Advance exam status through the pipeline.
 * Validates the transition is legal before applying.
 */
const VALID_TRANSITIONS = {
  pending:   ['emailed', 'cancelled'],
  emailed:   ['received', 'cancelled', 'pending'],
  received:  ['written', 'emailed'],
  written:   ['picked_up', 'received'],
  picked_up: [],
  cancelled: ['pending'],
  dropped:   ['pending'],
};

export async function updateExamStatus(schema, examId, { toStatus, changedBy, note }) {
  return tenantTransaction(schema, async (client) => {
    // Get current status
    const current = await client.query(
      `SELECT status FROM exam WHERE id = $1 FOR UPDATE`,
      [examId]
    );
    if (!current.rows.length) {
      throw Object.assign(new Error('Exam not found'), { status: 404 });
    }

    const fromStatus  = current.rows[0].status;
    const validNexts  = VALID_TRANSITIONS[fromStatus] ?? [];

    if (!validNexts.includes(toStatus)) {
      throw Object.assign(
        new Error(`Cannot transition from '${fromStatus}' to '${toStatus}'`),
        { status: 400 }
      );
    }

    // Guard: password required before moving past 'emailed'
    if (toStatus === 'received') {
      const examData = await client.query(
        `SELECT exam_type, password FROM exam WHERE id = $1`,
        [examId]
      );
      const exam = examData.rows[0];
      if (exam.exam_type === 'brightspace' && !exam.password) {
        throw Object.assign(
          new Error('Password required for Brightspace exams before marking received'),
          { status: 400 }
        );
      }
    }

    // Apply status change
    await client.query(
      `UPDATE exam SET status = $1, updated_at = NOW() WHERE id = $2`,
      [toStatus, examId]
    );

    // Append status event (immutable)
    await client.query(
      `INSERT INTO status_event (exam_id, from_status, to_status, changed_by, note)
       VALUES ($1, $2, $3, $4, $5)`,
      [examId, fromStatus, toStatus, changedBy, note ?? null]
    );

    return { examId, fromStatus, toStatus };
  });
}

/**
 * Delete an exam and its rooms.
 * Only allowed when status is 'pending' or 'cancelled'.
 */
export async function deleteExam(schema, examId) {
  const result = await tenantQuery(schema,
    `DELETE FROM exam
     WHERE id = $1
       AND status IN ('pending', 'cancelled')
     RETURNING id`,
    [examId]
  );
  if (!result.rows.length) {
    throw Object.assign(
      new Error('Exam cannot be deleted — only pending or cancelled exams can be removed'),
      { status: 400 }
    );
  }
}

/**
 * Upsert an exam room — add or update a room slot on an exam.
 */
export async function upsertExamRoom(schema, examId, { roomId, roomName, startTime, studentCount }) {
  if (roomId) {
    const result = await tenantQuery(schema,
      `UPDATE exam_room
       SET room_name     = $1,
           start_time    = $2,
           student_count = $3
       WHERE id = $4 AND exam_id = $5
       RETURNING id`,
      [roomName, startTime, studentCount, roomId, examId]
    );
    return result.rows[0];
  } else {
    const result = await tenantQuery(schema,
      `INSERT INTO exam_room (exam_id, room_name, start_time, student_count)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [examId, roomName, startTime, studentCount ?? 0]
    );
    return result.rows[0];
  }
}

/**
 * Delete a room from an exam.
 */
export async function deleteExamRoom(schema, examId, roomId) {
  await tenantQuery(schema,
    `DELETE FROM exam_room WHERE id = $1 AND exam_id = $2`,
    [roomId, examId]
  );
}

/**
 * Get the full status history for an exam.
 */
export async function getStatusHistory(schema, examId) {
  const result = await tenantQuery(schema,
    `SELECT
       se.id, se.from_status, se.to_status, se.note, se.created_at,
       u.first_name || ' ' || u.last_name AS changed_by_name
     FROM status_event se
     LEFT JOIN "user" u ON u.id = se.changed_by
     WHERE se.exam_id = $1
     ORDER BY se.created_at ASC`,
    [examId]
  );
  return result.rows;
}

/**
 * Get all exams flagged as pending or missing passwords
 * before their start time — the pre-exam warning list.
 */
export async function getExamsNeedingAttention(schema, date) {
  const result = await tenantQuery(schema,
    `SELECT
       e.id, e.course_code, e.status, e.exam_type,
       e.password, e.rwg_flag,
       MIN(er.start_time) AS earliest_start,
       COUNT(er.id)       AS room_count
     FROM exam e
     JOIN exam_day  ed ON ed.id = e.exam_day_id AND ed.date = $1
     JOIN exam_room er ON er.exam_id = e.id
     WHERE e.status NOT IN ('picked_up', 'cancelled', 'dropped')
       AND (
         e.status = 'pending'
         OR (e.exam_type = 'brightspace' AND (e.password IS NULL OR e.password = ''))
       )
     GROUP BY e.id
     ORDER BY earliest_start`,
    [date]
  );
  return result.rows;
}
