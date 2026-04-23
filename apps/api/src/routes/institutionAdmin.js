/**
 * Institution admin portal routes — requires auth + institution_admin role.
 *
 * GET    /api/institution/courses                — list all courses linked to professors
 *
 * GET    /api/institution/bookings           — all professor-approved booking requests
 * PATCH  /api/institution/bookings/:id/confirm
 * PATCH  /api/institution/bookings/:id/cancel
 *
 * GET    /api/institution/rooms
 * POST   /api/institution/rooms
 * PATCH  /api/institution/rooms/:id
 * DELETE /api/institution/rooms/:id
 *
 * POST   /api/institution/schedule
 * GET    /api/institution/schedule
 *
 * GET    /api/institution/exam-schedules      — list scheduled exams
 * POST   /api/institution/exam-schedules      — create scheduled exam with auto-approval
 * PATCH  /api/institution/exam-schedules/:id  — update scheduled exam
 * DELETE /api/institution/exam-schedules/:id  — delete scheduled exam
 */
import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/role.js";
import { tenantQuery } from "../db/tenantPool.js";
import { assignStudentsToRooms } from "../utils/scheduleAlgorithm.js";

const router = Router();
router.use(requireAuth);
router.use(requireRole("institution_admin"));

// ── GET /api/institution/bookings ─────────────────────────────────────────────
router.get("/bookings", async (req, res, next) => {
  try {
    const schema = req.tenantSchema;
    const { date } = req.query;

    const params = [];
    let whereClause = `WHERE ebr.status = 'professor_approved'`;
    if (date) {
      params.push(date);
      whereClause += ` AND ebr.exam_date = $${params.length}`;
    }

    const result = await tenantQuery(
      schema,
      `SELECT
         ebr.id, ebr.course_code, ebr.exam_date, ebr.exam_time, ebr.exam_type,
         ebr.special_materials_note, ebr.status, ebr.confirmed_at, ebr.created_at,
         ebr.base_duration_mins, ebr.extra_mins, ebr.stb_mins,
         ebr.computed_duration_mins, ebr.student_duration_mins,
         u.first_name, u.last_name, u.email,
         sp.student_number, sp.id AS student_profile_id
       FROM exam_booking_request ebr
       JOIN student_profile sp ON sp.id = ebr.student_profile_id
       JOIN "user" u ON u.id = sp.user_id
       ${whereClause}
       ORDER BY ebr.exam_date ASC, ebr.exam_time ASC NULLS LAST, ebr.created_at ASC`,
      params,
    );

    res.json({ ok: true, data: result.rows });
  } catch (err) {
    next(err);
  }
});

// ── PATCH /api/institution/bookings/:id/confirm ───────────────────────────────
router.patch("/bookings/:id/confirm", async (req, res, next) => {
  try {
    const schema = req.tenantSchema;
    const result = await tenantQuery(
      schema,
      `UPDATE exam_booking_request
       SET status = 'confirmed', confirmed_by = $2, confirmed_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND status = 'professor_approved'
       RETURNING id, course_code, exam_date, exam_time`,
      [req.params.id, req.user.id],
    );
    if (!result.rows.length) {
      return res
        .status(404)
        .json({ ok: false, error: "Request not found or already actioned" });
    }

    // Notify professor to upload exam file (fire-and-forget — don't block response)
    const { course_code, exam_date, exam_time } = result.rows[0];
    notifyProfessorUploadNeeded(
      schema,
      course_code,
      exam_date,
      exam_time,
    ).catch(() => {});

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ── PATCH /api/institution/bookings/:id/cancel ────────────────────────────────
router.patch("/bookings/:id/cancel", async (req, res, next) => {
  try {
    const result = await tenantQuery(
      req.tenantSchema,
      `UPDATE exam_booking_request
       SET status = 'cancelled', updated_at = NOW()
       WHERE id = $1 AND status = 'professor_approved'
       RETURNING id, course_code, exam_date, exam_time, professor_profile_id,
                 (SELECT first_name || ' ' || last_name FROM "user" u
                  JOIN student_profile sp ON sp.user_id = u.id
                  WHERE sp.id = exam_booking_request.student_profile_id) AS student_name`,
      [req.params.id],
    );
    if (!result.rows.length) {
      return res
        .status(404)
        .json({ ok: false, error: "Request not found or already actioned" });
    }

    // Notify professor (fire-and-forget)
    const {
      professor_profile_id,
      student_name,
      course_code,
      exam_date,
      exam_time,
    } = result.rows[0];
    if (professor_profile_id) {
      const dateStr = new Date(exam_date).toLocaleDateString("en-CA", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      const timeStr = exam_time ? ` at ${exam_time.slice(0, 5)}` : "";
      tenantQuery(
        req.tenantSchema,
        `INSERT INTO upload_notification (professor_profile_id, type, message)
         VALUES ($1, 'booking_cancelled', $2)`,
        [
          professor_profile_id,
          `${student_name ?? "A student"}'s booking for ${course_code} on ${dateStr}${timeStr} has been cancelled.`,
        ],
      ).catch(() => {});
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/institution/rooms ────────────────────────────────────────────────
router.get("/rooms", async (req, res, next) => {
  try {
    const result = await tenantQuery(
      req.tenantSchema,
      `SELECT id, name, capacity, notes
       FROM booking_room
       WHERE is_active = TRUE
       ORDER BY capacity ASC, name ASC`,
    );
    res.json({ ok: true, data: result.rows });
  } catch (err) {
    next(err);
  }
});

const RoomSchema = z.object({
  name: z.string().min(1).max(100),
  capacity: z.number().int().min(1).max(200),
  notes: z.string().max(500).optional(),
});

// ── POST /api/institution/rooms ───────────────────────────────────────────────
router.post("/rooms", async (req, res, next) => {
  try {
    const body = RoomSchema.parse(req.body);
    const result = await tenantQuery(
      req.tenantSchema,
      `INSERT INTO booking_room (name, capacity, notes)
       VALUES ($1, $2, $3)
       RETURNING id, name, capacity, notes`,
      [body.name, body.capacity, body.notes ?? null],
    );
    res.status(201).json({ ok: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// ── PATCH /api/institution/rooms/:id ─────────────────────────────────────────
router.patch("/rooms/:id", async (req, res, next) => {
  try {
    const body = RoomSchema.partial().parse(req.body);
    const sets = [];
    const vals = [];
    if (body.name !== undefined) {
      vals.push(body.name);
      sets.push(`name = $${vals.length}`);
    }
    if (body.capacity !== undefined) {
      vals.push(body.capacity);
      sets.push(`capacity = $${vals.length}`);
    }
    if (body.notes !== undefined) {
      vals.push(body.notes);
      sets.push(`notes = $${vals.length}`);
    }

    if (!sets.length) return res.json({ ok: true });

    vals.push(req.params.id);
    const result = await tenantQuery(
      req.tenantSchema,
      `UPDATE booking_room SET ${sets.join(", ")}
       WHERE id = $${vals.length} AND is_active = TRUE
       RETURNING id, name, capacity, notes`,
      vals,
    );
    if (!result.rows.length) {
      return res.status(404).json({ ok: false, error: "Room not found" });
    }
    res.json({ ok: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /api/institution/rooms/:id ─────────────────────────────────────────
router.delete("/rooms/:id", async (req, res, next) => {
  try {
    const result = await tenantQuery(
      req.tenantSchema,
      `UPDATE booking_room SET is_active = FALSE
       WHERE id = $1 AND is_active = TRUE
       RETURNING id`,
      [req.params.id],
    );
    if (!result.rows.length) {
      return res.status(404).json({ ok: false, error: "Room not found" });
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/institution/schedule ────────────────────────────────────────────
const ScheduleSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  roomIds: z.array(z.string().uuid()).min(1),
});

router.post("/schedule", async (req, res, next) => {
  try {
    const schema = req.tenantSchema;
    const body = ScheduleSchema.parse(req.body);

    // 1. Fetch all confirmed bookings for the date
    const bookingsResult = await tenantQuery(
      schema,
      `SELECT
         ebr.id, ebr.course_code, ebr.exam_time, ebr.computed_duration_mins,
         ebr.student_profile_id,
         u.first_name, u.last_name, sp.student_number
       FROM exam_booking_request ebr
       JOIN student_profile sp ON sp.id = ebr.student_profile_id
       JOIN "user" u ON u.id = sp.user_id
       WHERE ebr.exam_date = $1 AND ebr.status = 'confirmed'`,
      [body.date],
    );

    if (!bookingsResult.rows.length) {
      return res
        .status(400)
        .json({ ok: false, error: "No confirmed bookings for this date" });
    }

    // 2. Fetch accommodation flags for each student
    const studentIds = [
      ...new Set(bookingsResult.rows.map((r) => r.student_profile_id)),
    ];
    const accomResult = await tenantQuery(
      schema,
      `SELECT sa.student_profile_id,
              bool_or(ac.triggers_rwg_flag)  AS strictly_solo,
              bool_or(ac.prefers_solo_room)  AS prefers_solo
       FROM student_accommodation sa
       JOIN accommodation_code ac ON ac.id = sa.accommodation_code_id
       WHERE sa.student_profile_id = ANY($1)
         AND ac.is_active = TRUE
       GROUP BY sa.student_profile_id`,
      [studentIds],
    );

    const accomMap = {};
    for (const row of accomResult.rows) {
      accomMap[row.student_profile_id] = {
        strictlySolo: row.strictly_solo,
        prefersSolo: row.prefers_solo,
      };
    }

    // Build student objects for the algorithm
    const students = bookingsResult.rows.map((r) => {
      let startTimeMins = null;
      if (r.exam_time) {
        const [h, m] = r.exam_time.slice(0, 5).split(":").map(Number);
        startTimeMins = h * 60 + m;
      }
      const flags = accomMap[r.student_profile_id] ?? {
        strictlySolo: false,
        prefersSolo: false,
      };
      return {
        id: r.id,
        courseCode: r.course_code,
        startTimeMins,
        computedDurationMins: r.computed_duration_mins,
        strictlySolo: flags.strictlySolo ?? false,
        prefersSolo: flags.prefersSolo ?? false,
        firstName: r.first_name,
        lastName: r.last_name,
        studentNumber: r.student_number,
        examTime: r.exam_time ? r.exam_time.slice(0, 5) : null,
      };
    });

    // 3. Fetch selected rooms ordered by capacity ASC
    const roomsResult = await tenantQuery(
      schema,
      `SELECT id, name, capacity
       FROM booking_room
       WHERE id = ANY($1) AND is_active = TRUE
       ORDER BY capacity ASC, name ASC`,
      [body.roomIds],
    );

    if (!roomsResult.rows.length) {
      return res.status(400).json({ ok: false, error: "No valid rooms found" });
    }

    // 4. Run the scheduling algorithm
    const assignments = assignStudentsToRooms(students, roomsResult.rows);

    // 5. Delete existing schedule for this date (idempotent re-run)
    await tenantQuery(schema, `DELETE FROM booking_schedule WHERE date = $1`, [
      body.date,
    ]);

    // 6. Insert new schedule
    const schedResult = await tenantQuery(
      schema,
      `INSERT INTO booking_schedule (date, created_by) VALUES ($1, $2) RETURNING id`,
      [body.date, req.user.id],
    );
    const scheduleId = schedResult.rows[0].id;

    // Build room lookup
    const roomMap = {};
    for (const r of roomsResult.rows) roomMap[r.id] = r;

    // Build student lookup
    const studentMap = {};
    for (const s of students) studentMap[s.id] = s;

    const responseRooms = [];

    for (const { roomId, studentIds: assignedIds } of assignments) {
      if (!assignedIds.length) continue;
      const room = roomMap[roomId];

      const srResult = await tenantQuery(
        schema,
        `INSERT INTO booking_schedule_room (schedule_id, booking_room_id)
         VALUES ($1, $2) RETURNING id`,
        [scheduleId, roomId],
      );
      const schedRoomId = srResult.rows[0].id;

      for (const sid of assignedIds) {
        await tenantQuery(
          schema,
          `INSERT INTO booking_assignment (schedule_room_id, exam_booking_request_id)
           VALUES ($1, $2)
           ON CONFLICT (exam_booking_request_id) DO UPDATE
             SET schedule_room_id = EXCLUDED.schedule_room_id`,
          [schedRoomId, sid],
        );
      }

      const assignedStudents = assignedIds.map((sid) => {
        const s = studentMap[sid];
        const endTime =
          s.examTime && s.computedDurationMins
            ? (() => {
                const totalMins = s.startTimeMins + s.computedDurationMins;
                const h = Math.floor(totalMins / 60)
                  .toString()
                  .padStart(2, "0");
                const m = (totalMins % 60).toString().padStart(2, "0");
                return `${h}:${m}`;
              })()
            : null;
        return {
          id: s.id,
          firstName: s.firstName,
          lastName: s.lastName,
          studentNumber: s.studentNumber,
          courseCode: s.courseCode,
          examTime: s.examTime,
          endTime,
          computedDurationMins: s.computedDurationMins,
          strictlySolo: s.strictlySolo,
          prefersSolo: s.prefersSolo,
        };
      });

      responseRooms.push({
        roomId,
        roomName: room.name,
        capacity: room.capacity,
        students: assignedStudents,
      });
    }

    res
      .status(201)
      .json({
        ok: true,
        data: { scheduleId, date: body.date, rooms: responseRooms },
      });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/institution/schedule ─────────────────────────────────────────────
router.get("/schedule", async (req, res, next) => {
  try {
    const schema = req.tenantSchema;
    const { date } = req.query;

    if (!date)
      return res
        .status(400)
        .json({ ok: false, error: "date query param required" });

    // Get most recent schedule for this date
    const schedResult = await tenantQuery(
      schema,
      `SELECT id FROM booking_schedule WHERE date = $1 ORDER BY created_at DESC LIMIT 1`,
      [date],
    );

    if (!schedResult.rows.length) {
      return res.json({ ok: true, data: null });
    }

    const scheduleId = schedResult.rows[0].id;

    const result = await tenantQuery(
      schema,
      `SELECT
         bsr.id AS schedule_room_id,
         br.id AS room_id, br.name AS room_name, br.capacity,
         ebr.id AS booking_id, ebr.course_code, ebr.exam_time,
         ebr.computed_duration_mins, ebr.student_profile_id,
         u.first_name, u.last_name, sp.student_number,
         EXISTS (
           SELECT 1 FROM student_accommodation sa
           JOIN accommodation_code ac ON ac.id = sa.accommodation_code_id
           WHERE sa.student_profile_id = ebr.student_profile_id AND ac.triggers_rwg_flag = TRUE AND ac.is_active = TRUE
         ) AS strictly_solo,
         EXISTS (
           SELECT 1 FROM student_accommodation sa
           JOIN accommodation_code ac ON ac.id = sa.accommodation_code_id
           WHERE sa.student_profile_id = ebr.student_profile_id AND ac.prefers_solo_room = TRUE AND ac.is_active = TRUE
         ) AS prefers_solo
       FROM booking_schedule_room bsr
       JOIN booking_room br ON br.id = bsr.booking_room_id
       JOIN booking_assignment ba ON ba.schedule_room_id = bsr.id
       JOIN exam_booking_request ebr ON ebr.id = ba.exam_booking_request_id
       JOIN student_profile sp ON sp.id = ebr.student_profile_id
       JOIN "user" u ON u.id = sp.user_id
       WHERE bsr.schedule_id = $1
       ORDER BY br.capacity ASC, br.name ASC, ebr.exam_time ASC NULLS LAST`,
      [scheduleId],
    );

    // Group by room
    const roomMap = {};
    for (const row of result.rows) {
      if (!roomMap[row.room_id]) {
        roomMap[row.room_id] = {
          roomId: row.room_id,
          roomName: row.room_name,
          capacity: row.capacity,
          students: [],
        };
      }
      const startMins = row.exam_time
        ? (() => {
            const [h, m] = row.exam_time.slice(0, 5).split(":").map(Number);
            return h * 60 + m;
          })()
        : null;
      const endTime =
        startMins != null && row.computed_duration_mins
          ? (() => {
              const t = startMins + row.computed_duration_mins;
              return `${Math.floor(t / 60)
                .toString()
                .padStart(2, "0")}:${(t % 60).toString().padStart(2, "0")}`;
            })()
          : null;

      roomMap[row.room_id].students.push({
        id: row.booking_id,
        firstName: row.first_name,
        lastName: row.last_name,
        studentNumber: row.student_number,
        courseCode: row.course_code,
        examTime: row.exam_time ? row.exam_time.slice(0, 5) : null,
        endTime,
        computedDurationMins: row.computed_duration_mins,
        strictlySolo: row.strictly_solo,
        prefersSolo: row.prefers_solo,
      });
    }

    res.json({
      ok: true,
      data: { scheduleId, date, rooms: Object.values(roomMap) },
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/institution/courses ────────────────────────────────────────────
// Get all courses linked to professors for scheduling dropdown
router.get("/courses", async (req, res, next) => {
  try {
    const schema = req.tenantSchema;

    const result = await tenantQuery(
      schema,
      `SELECT DISTINCT
         cd.course_code,
         pp.id AS professor_id,
         u.first_name, u.last_name
       FROM course_dossier cd
       JOIN professor_profile pp ON pp.id = cd.professor_id
       JOIN "user" u ON u.id = pp.user_id
       ORDER BY cd.course_code ASC`,
      [],
    );

    res.json({ ok: true, data: result.rows });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/institution/exam-schedules ──────────────────────────────────────
router.get("/exam-schedules", async (req, res, next) => {
  try {
    const schema = req.tenantSchema;
    const { courseCode } = req.query;

    let whereClause = "";
    let params = [];

    if (courseCode) {
      whereClause = " WHERE UPPER(course_code) = UPPER($1)";
      params = [courseCode];
    }

    const result = await tenantQuery(
      schema,
      `SELECT
         es.id, es.course_code, es.exam_date, es.exam_time, es.exam_type,
         es.base_duration_mins, es.auto_approve_enabled, es.created_by, es.created_at, es.updated_at,
         u.first_name, u.last_name
       FROM exam_schedule es
       LEFT JOIN "user" u ON u.id = es.created_by
       ${whereClause}
       ORDER BY es.exam_date DESC, es.exam_time ASC NULLS LAST`,
      params,
    );

    res.json({ ok: true, data: result.rows });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/institution/exam-schedules ─────────────────────────────────────
router.post("/exam-schedules", async (req, res, next) => {
  try {
    const schema = req.tenantSchema;
    const { courseCode, examDate, examTime, examType, baseDurationMins } =
      req.body;

    // Validate
    if (!courseCode || !examDate) {
      return res
        .status(400)
        .json({ ok: false, error: "courseCode and examDate required" });
    }

    // Create exam schedule
    const schedResult = await tenantQuery(
      schema,
      `INSERT INTO exam_schedule
       (course_code, exam_date, exam_time, exam_type, base_duration_mins, auto_approve_enabled, created_by, updated_at)
       VALUES ($1, $2, $3, $4, $5, true, $6, NOW())
       ON CONFLICT (course_code, exam_date, exam_time) DO UPDATE
       SET base_duration_mins = $5, updated_at = NOW()
       RETURNING id, course_code, exam_date, exam_time, exam_type, base_duration_mins`,
      [
        courseCode,
        examDate,
        examTime || null,
        examType || "midterm",
        baseDurationMins || null,
        req.user.id,
      ],
    );

    const sched = schedResult.rows[0];

    // Auto-approve existing pending requests for this course+date+time
    const updateResult = await tenantQuery(
      schema,
      `UPDATE exam_booking_request
       SET status = 'professor_approved', updated_at = NOW()
       WHERE UPPER(course_code) = UPPER($1)
         AND exam_date = $2
         AND (exam_time = $3 OR $3 IS NULL)
         AND status = 'pending'
       RETURNING id`,
      [courseCode, examDate, examTime || null],
    );

    // Then confirm them all
    const confirmedResult = await tenantQuery(
      schema,
      `UPDATE exam_booking_request
       SET status = 'confirmed', confirmed_by = $1, confirmed_at = NOW(), updated_at = NOW()
       WHERE UPPER(course_code) = UPPER($2)
         AND exam_date = $3
         AND (exam_time = $4 OR $4 IS NULL)
         AND status = 'professor_approved'
       RETURNING id`,
      [req.user.id, courseCode, examDate, examTime || null],
    );

    res.status(201).json({
      ok: true,
      data: {
        schedule: sched,
        autoApprovedCount: updateResult.rows.length,
        confirmedCount: confirmedResult.rows.length,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── PATCH /api/institution/exam-schedules/:id ───────────────────────────────
router.patch("/exam-schedules/:id", async (req, res, next) => {
  try {
    const schema = req.tenantSchema;
    const { baseDurationMins, autoApproveEnabled } = req.body;

    const updates = [];
    const params = [req.params.id];

    if (baseDurationMins !== undefined) {
      updates.push(`base_duration_mins = $${params.length + 1}`);
      params.push(baseDurationMins);
    }

    if (autoApproveEnabled !== undefined) {
      updates.push(`auto_approve_enabled = $${params.length + 1}`);
      params.push(autoApproveEnabled);
    }

    if (!updates.length) {
      return res.status(400).json({ ok: false, error: "No fields to update" });
    }

    updates.push("updated_at = NOW()");

    const result = await tenantQuery(
      schema,
      `UPDATE exam_schedule
       SET ${updates.join(", ")}
       WHERE id = $1
       RETURNING id, course_code, exam_date, exam_time, base_duration_mins, auto_approve_enabled`,
      params,
    );

    if (!result.rows.length) {
      return res
        .status(404)
        .json({ ok: false, error: "Exam schedule not found" });
    }

    res.json({ ok: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /api/institution/exam-schedules/:id ───────────────────────────────
router.delete("/exam-schedules/:id", async (req, res, next) => {
  try {
    const schema = req.tenantSchema;

    const result = await tenantQuery(
      schema,
      `DELETE FROM exam_schedule WHERE id = $1 RETURNING id`,
      [req.params.id],
    );

    if (!result.rows.length) {
      return res
        .status(404)
        .json({ ok: false, error: "Exam schedule not found" });
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ── Professor notification helper ─────────────────────────────────────────────
async function notifyProfessorUploadNeeded(
  schema,
  courseCode,
  examDate,
  examTime,
) {
  // Look up professor for this course
  const profResult = await tenantQuery(
    schema,
    `SELECT cd.professor_id
     FROM course_dossier cd
     WHERE UPPER(cd.course_code) = UPPER($1)
     LIMIT 1`,
    [courseCode],
  );
  const professorProfileId = profResult.rows[0]?.professor_id;
  if (!professorProfileId) return;

  // Count total confirmed students for this course/date
  const countResult = await tenantQuery(
    schema,
    `SELECT COUNT(*) AS n FROM exam_booking_request
     WHERE UPPER(course_code) = UPPER($1) AND exam_date = $2 AND status = 'confirmed'`,
    [courseCode, examDate],
  );
  const studentCount = parseInt(countResult.rows[0]?.n ?? "0", 10);

  const timeStr = examTime ? examTime.slice(0, 5) : "";
  const dateStr = new Date(examDate).toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const message = `${studentCount} student${studentCount !== 1 ? "s" : ""} confirmed for ${courseCode} on ${dateStr}${timeStr ? ` at ${timeStr}` : ""}. Please upload your exam file and Word document (required for RWG students) via the Professor Portal.`;

  await tenantQuery(
    schema,
    `INSERT INTO upload_notification (professor_profile_id, type, message)
     VALUES ($1, 'booking_upload_needed', $2)`,
    [professorProfileId, message],
  );
}

export default router;
