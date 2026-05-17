/**
 * Institution admin portal routes — requires auth + institution_admin role.
 *
 * GET    /api/institution/course-list            — list master courses
 * POST   /api/institution/course-list            — create master course
 * PATCH  /api/institution/course-list/:id        — update master course
 * DELETE /api/institution/course-list/:id        — soft-delete master course
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
         ebr.id, ebr.course_id, c.code AS course_code,
         ebr.exam_date, ebr.exam_time, ebr.exam_type,
         ebr.special_materials_note, ebr.status, ebr.confirmed_at, ebr.created_at,
         ebr.base_duration_mins, ebr.extra_mins, ebr.stb_mins,
         ebr.computed_duration_mins, ebr.student_duration_mins,
         u.first_name, u.last_name, u.email,
         sp.student_number, sp.id AS student_profile_id
       FROM exam_booking_request ebr
       JOIN course c ON c.id = ebr.course_id
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
       RETURNING id, course_id, exam_date, exam_time`,
      [req.params.id, req.user.id],
    );
    if (!result.rows.length) {
      return res
        .status(404)
        .json({ ok: false, error: "Request not found or already actioned" });
    }

    // Notify professor to upload exam file (fire-and-forget — don't block response)
    const { course_id, exam_date, exam_time } = result.rows[0];
    notifyProfessorUploadNeeded(
      schema,
      course_id,
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
       RETURNING id, course_id, exam_date, exam_time, professor_profile_id,
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
      course_id,
      exam_date,
      exam_time,
    } = result.rows[0];
    const cancelCourseRow = course_id
      ? await tenantQuery(req.tenantSchema, `SELECT code FROM course WHERE id = $1`, [course_id])
      : null;
    const course_code = cancelCourseRow?.rows[0]?.code ?? course_id;
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
      `SELECT br.id, br.name, br.capacity, br.notes,
              COALESCE(
                array_agg(rf.code ORDER BY rf.code) FILTER (WHERE rf.code IS NOT NULL),
                '{}'
              ) AS features
       FROM booking_room br
       LEFT JOIN booking_room_feature brf ON brf.room_id = br.id
       LEFT JOIN room_feature rf ON rf.id = brf.feature_id AND rf.is_active = TRUE
       WHERE br.is_active = TRUE
       GROUP BY br.id, br.name, br.capacity, br.notes
       ORDER BY br.capacity ASC, br.name ASC`,
    );
    res.json({ ok: true, data: result.rows });
  } catch (err) {
    next(err);
  }
});

const RoomSchema = z.object({
  name:     z.string().min(1).max(100),
  capacity: z.number().int().min(1).max(200),
  notes:    z.string().max(500).optional(),
  features: z.array(z.string()).optional(),
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
    const room = result.rows[0];
    if (body.features?.length) {
      await tenantQuery(
        req.tenantSchema,
        `INSERT INTO booking_room_feature (room_id, feature_id)
         SELECT $1, rf.id FROM room_feature rf
         WHERE rf.code = ANY($2) AND rf.is_active = TRUE
         ON CONFLICT DO NOTHING`,
        [room.id, body.features],
      );
    }
    room.features = body.features ?? [];
    res.status(201).json({ ok: true, data: room });
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

    let room;
    if (sets.length) {
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
      room = result.rows[0];
    } else {
      const check = await tenantQuery(
        req.tenantSchema,
        `SELECT id, name, capacity, notes FROM booking_room WHERE id = $1 AND is_active = TRUE`,
        [req.params.id],
      );
      if (!check.rows.length) return res.status(404).json({ ok: false, error: "Room not found" });
      room = check.rows[0];
    }

    if (body.features !== undefined) {
      await tenantQuery(req.tenantSchema, `DELETE FROM booking_room_feature WHERE room_id = $1`, [room.id]);
      if (body.features.length) {
        await tenantQuery(
          req.tenantSchema,
          `INSERT INTO booking_room_feature (room_id, feature_id)
           SELECT $1, rf.id FROM room_feature rf
           WHERE rf.code = ANY($2) AND rf.is_active = TRUE
           ON CONFLICT DO NOTHING`,
          [room.id, body.features],
        );
      }
      room.features = body.features;
    }

    res.json({ ok: true, data: room });
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

// ── GET /api/institution/room-features ───────────────────────────────────────
router.get("/room-features", async (req, res, next) => {
  try {
    const all = req.query.all === "true";
    const result = await tenantQuery(
      req.tenantSchema,
      all
        ? `SELECT id, code, label, is_active FROM room_feature ORDER BY label`
        : `SELECT id, code, label FROM room_feature WHERE is_active = TRUE ORDER BY label`,
    );
    res.json({ ok: true, data: result.rows });
  } catch (err) {
    next(err);
  }
});

const RoomFeatureSchema = z.object({
  code:  z.string().min(1).max(50).transform(v => v.toLowerCase().replace(/\s+/g, '_')),
  label: z.string().min(1).max(100),
});

// ── POST /api/institution/room-features ───────────────────────────────────────
router.post("/room-features", async (req, res, next) => {
  try {
    const body = RoomFeatureSchema.parse(req.body);
    const result = await tenantQuery(
      req.tenantSchema,
      `INSERT INTO room_feature (code, label) VALUES ($1, $2)
       RETURNING id, code, label, is_active`,
      [body.code, body.label],
    );
    res.status(201).json({ ok: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// ── PATCH /api/institution/room-features/:id ──────────────────────────────────
router.patch("/room-features/:id", async (req, res, next) => {
  try {
    const body = RoomFeatureSchema.partial()
      .extend({ is_active: z.boolean().optional() })
      .parse(req.body);
    const sets = [];
    const vals = [];
    if (body.label     !== undefined) { vals.push(body.label);     sets.push(`label = $${vals.length}`); }
    if (body.is_active !== undefined) { vals.push(body.is_active); sets.push(`is_active = $${vals.length}`); }
    if (!sets.length) return res.json({ ok: true });
    vals.push(req.params.id);
    const result = await tenantQuery(
      req.tenantSchema,
      `UPDATE room_feature SET ${sets.join(", ")} WHERE id = $${vals.length}
       RETURNING id, code, label, is_active`,
      vals,
    );
    if (!result.rows.length) return res.status(404).json({ ok: false, error: "Feature not found" });
    res.json({ ok: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /api/institution/room-features/:id ─────────────────────────────────
router.delete("/room-features/:id", async (req, res, next) => {
  try {
    const inUse = await tenantQuery(
      req.tenantSchema,
      `SELECT 1 FROM booking_room_feature WHERE feature_id = $1 LIMIT 1`,
      [req.params.id],
    );
    if (inUse.rows.length) {
      return res.status(409).json({ ok: false, error: "Feature is assigned to rooms — hide it instead" });
    }
    const result = await tenantQuery(
      req.tenantSchema,
      `DELETE FROM room_feature WHERE id = $1 RETURNING id`,
      [req.params.id],
    );
    if (!result.rows.length) return res.status(404).json({ ok: false, error: "Feature not found" });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/institution/accommodation-feature-mappings ───────────────────────
router.get("/accommodation-feature-mappings", async (req, res, next) => {
  try {
    const result = await tenantQuery(
      req.tenantSchema,
      `SELECT ac.id, ac.code, ac.label,
              COALESCE(
                array_agg(rf.code ORDER BY rf.code) FILTER (WHERE rf.code IS NOT NULL),
                '{}'
              ) AS required_features
       FROM accommodation_code ac
       LEFT JOIN accommodation_required_feature arf ON arf.accommodation_code_id = ac.id
       LEFT JOIN room_feature rf ON rf.id = arf.feature_id AND rf.is_active = TRUE
       WHERE ac.is_active = TRUE
       GROUP BY ac.id, ac.code, ac.label
       ORDER BY ac.code`,
    );
    res.json({ ok: true, data: result.rows });
  } catch (err) {
    next(err);
  }
});

// ── PUT /api/institution/accommodation-feature-mappings/:id ──────────────────
router.put("/accommodation-feature-mappings/:id", async (req, res, next) => {
  try {
    const { featureCodes } = z.object({ featureCodes: z.array(z.string()) }).parse(req.body);
    await tenantQuery(
      req.tenantSchema,
      `DELETE FROM accommodation_required_feature WHERE accommodation_code_id = $1`,
      [req.params.id],
    );
    if (featureCodes.length) {
      await tenantQuery(
        req.tenantSchema,
        `INSERT INTO accommodation_required_feature (accommodation_code_id, feature_id)
         SELECT $1, rf.id FROM room_feature rf
         WHERE rf.code = ANY($2) AND rf.is_active = TRUE
         ON CONFLICT DO NOTHING`,
        [req.params.id, featureCodes],
      );
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/institution/accommodation-codes ──────────────────────────────────
router.get("/accommodation-codes", async (req, res, next) => {
  try {
    const result = await tenantQuery(
      req.tenantSchema,
      `SELECT id, code, label, triggers_rwg_flag, prefers_solo_room, is_active
       FROM accommodation_code
       ORDER BY code`,
    );
    res.json({ ok: true, data: result.rows });
  } catch (err) {
    next(err);
  }
});

const AccomCodeSchema = z.object({
  code:              z.string().min(1).max(50).transform(v => v.toUpperCase()),
  label:             z.string().min(1).max(100),
  triggers_rwg_flag: z.boolean().default(false),
  prefers_solo_room: z.boolean().default(false),
});

// ── POST /api/institution/accommodation-codes ─────────────────────────────────
router.post("/accommodation-codes", async (req, res, next) => {
  try {
    const body = AccomCodeSchema.parse(req.body);
    const result = await tenantQuery(
      req.tenantSchema,
      `INSERT INTO accommodation_code (code, label, triggers_rwg_flag, prefers_solo_room)
       VALUES ($1, $2, $3, $4)
       RETURNING id, code, label, triggers_rwg_flag, prefers_solo_room, is_active`,
      [body.code, body.label, body.triggers_rwg_flag, body.prefers_solo_room],
    );
    res.status(201).json({ ok: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// ── PATCH /api/institution/accommodation-codes/:id ────────────────────────────
router.patch("/accommodation-codes/:id", async (req, res, next) => {
  try {
    const body = AccomCodeSchema.partial()
      .extend({ is_active: z.boolean().optional() })
      .parse(req.body);
    const sets = [];
    const vals = [];
    if (body.label             !== undefined) { vals.push(body.label);             sets.push(`label = $${vals.length}`); }
    if (body.triggers_rwg_flag !== undefined) { vals.push(body.triggers_rwg_flag); sets.push(`triggers_rwg_flag = $${vals.length}`); }
    if (body.prefers_solo_room !== undefined) { vals.push(body.prefers_solo_room); sets.push(`prefers_solo_room = $${vals.length}`); }
    if (body.is_active         !== undefined) { vals.push(body.is_active);         sets.push(`is_active = $${vals.length}`); }
    if (!sets.length) return res.json({ ok: true });
    vals.push(req.params.id);
    const result = await tenantQuery(
      req.tenantSchema,
      `UPDATE accommodation_code SET ${sets.join(", ")}
       WHERE id = $${vals.length}
       RETURNING id, code, label, triggers_rwg_flag, prefers_solo_room, is_active`,
      vals,
    );
    if (!result.rows.length) return res.status(404).json({ ok: false, error: "Code not found" });
    res.json({ ok: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /api/institution/accommodation-codes/:id ───────────────────────────
router.delete("/accommodation-codes/:id", async (req, res, next) => {
  try {
    const inUse = await tenantQuery(
      req.tenantSchema,
      `SELECT 1 FROM student_accommodation WHERE accommodation_code_id = $1 LIMIT 1`,
      [req.params.id],
    );
    if (inUse.rows.length) {
      return res.status(409).json({ ok: false, error: "Code is in use — hide it instead" });
    }
    const result = await tenantQuery(
      req.tenantSchema,
      `DELETE FROM accommodation_code WHERE id = $1 RETURNING id`,
      [req.params.id],
    );
    if (!result.rows.length) return res.status(404).json({ ok: false, error: "Code not found" });
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
         ebr.id, c.code AS course_code, ebr.exam_time, ebr.computed_duration_mins,
         ebr.student_profile_id,
         u.first_name, u.last_name, sp.student_number
       FROM exam_booking_request ebr
       JOIN course c ON c.id = ebr.course_id
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

    // 2. Fetch accommodation flags + required features for each student
    const studentIds = [
      ...new Set(bookingsResult.rows.map((r) => r.student_profile_id)),
    ];
    const [accomResult, featuresResult] = await Promise.all([
      tenantQuery(
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
      ),
      tenantQuery(
        schema,
        `SELECT sa.student_profile_id,
                array_agg(DISTINCT rf.code) AS required_features
         FROM student_accommodation sa
         JOIN accommodation_code ac ON ac.id = sa.accommodation_code_id
         JOIN accommodation_required_feature arf ON arf.accommodation_code_id = ac.id
         JOIN room_feature rf ON rf.id = arf.feature_id
         WHERE sa.student_profile_id = ANY($1)
           AND ac.is_active = TRUE AND rf.is_active = TRUE
         GROUP BY sa.student_profile_id`,
        [studentIds],
      ),
    ]);

    const accomMap = {};
    for (const row of accomResult.rows) {
      accomMap[row.student_profile_id] = {
        strictlySolo: row.strictly_solo,
        prefersSolo: row.prefers_solo,
        requiredFeatures: [],
      };
    }
    for (const row of featuresResult.rows) {
      if (accomMap[row.student_profile_id]) {
        accomMap[row.student_profile_id].requiredFeatures = row.required_features ?? [];
      } else {
        accomMap[row.student_profile_id] = { strictlySolo: false, prefersSolo: false, requiredFeatures: row.required_features ?? [] };
      }
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
        requiredFeatures: [],
      };
      return {
        id: r.id,
        courseCode: r.course_code,
        startTimeMins,
        computedDurationMins: r.computed_duration_mins,
        strictlySolo: flags.strictlySolo ?? false,
        prefersSolo: flags.prefersSolo ?? false,
        requiredFeatures: flags.requiredFeatures ?? [],
        firstName: r.first_name,
        lastName: r.last_name,
        studentNumber: r.student_number,
        examTime: r.exam_time ? r.exam_time.slice(0, 5) : null,
      };
    });

    // 3. Fetch selected rooms with features ordered by capacity ASC
    const roomsResult = await tenantQuery(
      schema,
      `SELECT br.id, br.name, br.capacity,
              COALESCE(
                array_agg(rf.code) FILTER (WHERE rf.code IS NOT NULL),
                '{}'
              ) AS features
       FROM booking_room br
       LEFT JOIN booking_room_feature brf ON brf.room_id = br.id
       LEFT JOIN room_feature rf ON rf.id = brf.feature_id AND rf.is_active = TRUE
       WHERE br.id = ANY($1) AND br.is_active = TRUE
       GROUP BY br.id, br.name, br.capacity
       ORDER BY br.capacity ASC, br.name ASC`,
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
         ebr.id AS booking_id, c.code AS course_code, ebr.exam_time,
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
       JOIN course c ON c.id = ebr.course_id
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
         cd.course_id,
         c.code AS course_code,
         pp.id AS professor_id,
         u.first_name, u.last_name
       FROM course_dossier cd
       JOIN course c ON c.id = cd.course_id
       JOIN professor_profile pp ON pp.id = cd.professor_id
       JOIN "user" u ON u.id = pp.user_id
       ORDER BY c.code ASC`,
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
    const { courseId } = req.query;

    let whereClause = "";
    let params = [];

    if (courseId) {
      whereClause = " WHERE es.course_id = $1";
      params = [courseId];
    }

    const result = await tenantQuery(
      schema,
      `SELECT
         es.id, es.course_id, c.code AS course_code, es.exam_date, es.exam_time, es.exam_type,
         es.base_duration_mins, es.auto_approve_enabled, es.created_by, es.created_at, es.updated_at,
         u.first_name, u.last_name
       FROM exam_schedule es
       JOIN course c ON c.id = es.course_id
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
    const { courseId, examDate, examTime, examType, baseDurationMins } =
      req.body;

    // Validate
    if (!courseId || !examDate) {
      return res
        .status(400)
        .json({ ok: false, error: "courseId and examDate required" });
    }

    // Create exam schedule
    const schedResult = await tenantQuery(
      schema,
      `INSERT INTO exam_schedule
       (course_id, exam_date, exam_time, exam_type, base_duration_mins, auto_approve_enabled, created_by, updated_at)
       VALUES ($1, $2, $3, $4, $5, true, $6, NOW())
       ON CONFLICT (course_id, exam_date, exam_time) DO UPDATE
       SET base_duration_mins = $5, updated_at = NOW()
       RETURNING id, course_id, exam_date, exam_time, exam_type, base_duration_mins`,
      [
        courseId,
        examDate,
        examTime || null,
        examType || "midterm",
        baseDurationMins || null,
        req.user.id,
      ],
    );

    const sched = schedResult.rows[0];
    // Resolve course_code for response
    const courseRow = await tenantQuery(schema, `SELECT code FROM course WHERE id = $1`, [courseId]);
    sched.course_code = courseRow.rows[0]?.code ?? null;

    // Auto-approve existing pending requests for this course+date+time
    const updateResult = await tenantQuery(
      schema,
      `UPDATE exam_booking_request
       SET status = 'professor_approved', updated_at = NOW()
       WHERE course_id = $1
         AND exam_date = $2
         AND (exam_time = $3 OR $3 IS NULL)
         AND status = 'pending'
       RETURNING id`,
      [courseId, examDate, examTime || null],
    );

    // Then confirm them all
    const confirmedResult = await tenantQuery(
      schema,
      `UPDATE exam_booking_request
       SET status = 'confirmed', confirmed_by = $1, confirmed_at = NOW(), updated_at = NOW()
       WHERE course_id = $2
         AND exam_date = $3
         AND (exam_time = $4 OR $4 IS NULL)
         AND status = 'professor_approved'
       RETURNING id`,
      [req.user.id, courseId, examDate, examTime || null],
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
       RETURNING id, course_id, exam_date, exam_time, base_duration_mins, auto_approve_enabled`,
      params,
    );

    if (!result.rows.length) {
      return res
        .status(404)
        .json({ ok: false, error: "Exam schedule not found" });
    }

    const updated = result.rows[0];
    const cRow = await tenantQuery(schema, `SELECT code FROM course WHERE id = $1`, [updated.course_id]);
    updated.course_code = cRow.rows[0]?.code ?? null;
    res.json({ ok: true, data: updated });
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
  courseId,
  examDate,
  examTime,
) {
  // Look up professor for this course
  const profResult = await tenantQuery(
    schema,
    `SELECT cd.professor_id, c.code AS course_code
     FROM course_dossier cd
     JOIN course c ON c.id = cd.course_id
     WHERE cd.course_id = $1
     LIMIT 1`,
    [courseId],
  );
  const professorProfileId = profResult.rows[0]?.professor_id;
  const courseCode = profResult.rows[0]?.course_code ?? courseId;
  if (!professorProfileId) return;

  // Count total confirmed students for this course/date
  const countResult = await tenantQuery(
    schema,
    `SELECT COUNT(*) AS n FROM exam_booking_request
     WHERE course_id = $1 AND exam_date = $2 AND status = 'confirmed'`,
    [courseId, examDate],
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

// ── GET /api/institution/cancellation-requests ─────────────────────────────────
router.get("/cancellation-requests", async (req, res, next) => {
  try {
    const schema = req.tenantSchema;
    const { status } = req.query;

    const requestStatus = status || "pending";
    if (!["pending", "approved", "rejected"].includes(requestStatus)) {
      return res.status(400).json({ ok: false, error: "Invalid status" });
    }

    const result = await tenantQuery(
      schema,
      `SELECT
         cr.id, cr.exam_booking_request_id, cr.student_profile_id, cr.student_reason,
         cr.request_status, cr.admin_profile_id, cr.admin_reason, cr.reviewed_at,
         cr.created_at, cr.updated_at,
         c.code AS course_code, ebr.exam_date, ebr.exam_time, ebr.exam_type, ebr.status AS exam_status,
         sp.student_number, u.first_name, u.last_name, u.email,
         admin_u.first_name AS admin_first_name, admin_u.last_name AS admin_last_name
       FROM cancellation_request cr
       JOIN exam_booking_request ebr ON ebr.id = cr.exam_booking_request_id
       JOIN course c ON c.id = ebr.course_id
       JOIN student_profile sp ON sp.id = cr.student_profile_id
       JOIN "user" u ON u.id = sp.user_id
       LEFT JOIN "user" admin_u ON admin_u.id = cr.admin_profile_id
       WHERE cr.request_status = $1
       ORDER BY cr.created_at DESC`,
      [requestStatus],
    );

    res.json({ ok: true, data: result.rows });
  } catch (err) {
    next(err);
  }
});

// ── PATCH /api/institution/cancellation-requests/:id/approve ────────────────────
router.patch("/cancellation-requests/:id/approve", async (req, res, next) => {
  try {
    const schema = req.tenantSchema;
    const { id } = req.params;
    const { adminReason } = req.body;

    if (!adminReason) {
      return res.status(400).json({ ok: false, error: "Admin reason required" });
    }

    // Get cancellation request
    const crResult = await tenantQuery(
      schema,
      `SELECT cr.*, ebr.status AS exam_status, ebr.professor_profile_id, ebr.exam_date,
              c.code AS course_code, sp.user_id, u.email, u.first_name, u.last_name
       FROM cancellation_request cr
       JOIN exam_booking_request ebr ON ebr.id = cr.exam_booking_request_id
       JOIN course c ON c.id = ebr.course_id
       JOIN student_profile sp ON sp.id = cr.student_profile_id
       JOIN "user" u ON u.id = sp.user_id
       WHERE cr.id = $1 AND cr.request_status = 'pending'`,
      [id],
    );

    if (crResult.rows.length === 0) {
      return res.status(404).json({ ok: false, error: "Cancellation request not found or already reviewed" });
    }

    const cr = crResult.rows[0];
    const adminProfileId = req.user.id;

    // Update cancellation_request to approved
    await tenantQuery(
      schema,
      `UPDATE cancellation_request
       SET request_status = 'approved', admin_reason = $1, admin_profile_id = $2, reviewed_at = NOW(), updated_at = NOW()
       WHERE id = $3`,
      [adminReason, adminProfileId, id],
    );

    // Update exam_booking_request to cancelled
    await tenantQuery(
      schema,
      `UPDATE exam_booking_request SET status = 'cancelled', updated_at = NOW() WHERE id = $1`,
      [cr.exam_booking_request_id],
    );

    // Notify professor if booking was approved or confirmed
    if (cr.professor_profile_id && ["professor_approved", "confirmed"].includes(cr.exam_status)) {
      const dateStr = new Date(cr.exam_date).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
      await tenantQuery(
        schema,
        `INSERT INTO upload_notification (professor_profile_id, type, message)
         VALUES ($1, 'booking_cancelled', $2)`,
        [cr.professor_profile_id, `${cr.first_name} ${cr.last_name}'s booking for ${cr.course_code} on ${dateStr} has been cancelled by admin.`],
      );
    }

    res.json({ ok: true, data: { id } });
  } catch (err) {
    next(err);
  }
});

// ── PATCH /api/institution/cancellation-requests/:id/reject ─────────────────────
router.patch("/cancellation-requests/:id/reject", async (req, res, next) => {
  try {
    const schema = req.tenantSchema;
    const { id } = req.params;
    const { adminReason } = req.body;

    if (!adminReason) {
      return res.status(400).json({ ok: false, error: "Admin reason required" });
    }

    // Get cancellation request
    const crResult = await tenantQuery(
      schema,
      `SELECT cr.*, c.code AS course_code, ebr.exam_date, sp.user_id, u.email, u.first_name, u.last_name
       FROM cancellation_request cr
       JOIN exam_booking_request ebr ON ebr.id = cr.exam_booking_request_id
       JOIN course c ON c.id = ebr.course_id
       JOIN student_profile sp ON sp.id = cr.student_profile_id
       JOIN "user" u ON u.id = sp.user_id
       WHERE cr.id = $1 AND cr.request_status = 'pending'`,
      [id],
    );

    if (crResult.rows.length === 0) {
      return res.status(404).json({ ok: false, error: "Cancellation request not found or already reviewed" });
    }

    const adminProfileId = req.user.id;

    // Update cancellation_request to rejected
    await tenantQuery(
      schema,
      `UPDATE cancellation_request
       SET request_status = 'rejected', admin_reason = $1, admin_profile_id = $2, reviewed_at = NOW(), updated_at = NOW()
       WHERE id = $3`,
      [adminReason, adminProfileId, id],
    );

    res.json({ ok: true, data: { id } });
  } catch (err) {
    next(err);
  }
});

// ── Course master table CRUD ──────────────────────────────────────────────────

const courseSchema = z.object({
  code:       z.string().min(1).max(20).transform(s => s.trim().toUpperCase()),
  name:       z.string().max(100).optional().nullable(),
  department: z.string().max(100).optional().nullable(),
});

const courseUpdateSchema = z.object({
  name:       z.string().max(100).optional().nullable(),
  department: z.string().max(100).optional().nullable(),
  is_active:  z.boolean().optional(),
});

// GET /api/institution/course-list
router.get('/course-list', async (req, res, next) => {
  try {
    const includeInactive = req.query.all === 'true';
    const result = await tenantQuery(
      req.tenantSchema,
      `SELECT id, code, name, department, is_active, created_at
       FROM course
       ${includeInactive ? '' : "WHERE is_active = TRUE"}
       ORDER BY code ASC`,
      [],
    );
    res.json({ ok: true, courses: result.rows });
  } catch (err) { next(err); }
});

// POST /api/institution/course-list
router.post('/course-list', async (req, res, next) => {
  try {
    const data = courseSchema.parse(req.body);
    const result = await tenantQuery(
      req.tenantSchema,
      `INSERT INTO course (code, name, department, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING id, code, name, department, is_active, created_at`,
      [data.code, data.name ?? null, data.department ?? null, req.user.id],
    );
    res.status(201).json({ ok: true, course: result.rows[0] });
  } catch (err) { next(err); }
});

// PATCH /api/institution/course-list/:id
router.patch('/course-list/:id', async (req, res, next) => {
  try {
    const data = courseUpdateSchema.parse(req.body);
    const sets = [];
    const vals = [];
    if (data.name       !== undefined) { sets.push(`name = $${sets.length + 1}`);       vals.push(data.name); }
    if (data.department !== undefined) { sets.push(`department = $${sets.length + 1}`); vals.push(data.department); }
    if (data.is_active  !== undefined) { sets.push(`is_active = $${sets.length + 1}`);  vals.push(data.is_active); }
    if (!sets.length) return res.json({ ok: true });
    sets.push(`updated_at = NOW()`);
    vals.push(req.params.id);
    const result = await tenantQuery(
      req.tenantSchema,
      `UPDATE course SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING *`,
      vals,
    );
    if (!result.rows.length) return res.status(404).json({ ok: false, error: 'Course not found' });
    res.json({ ok: true, course: result.rows[0] });
  } catch (err) { next(err); }
});

// DELETE /api/institution/course-list/:id  (soft delete)
router.delete('/course-list/:id', async (req, res, next) => {
  try {
    const result = await tenantQuery(
      req.tenantSchema,
      `UPDATE course SET is_active = FALSE, updated_at = NOW() WHERE id = $1 RETURNING id`,
      [req.params.id],
    );
    if (!result.rows.length) return res.status(404).json({ ok: false, error: 'Course not found' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Term CRUD ─────────────────────────────────────────────────────────────────

const termSchema = z.object({
  label:      z.string().min(1).max(100).trim(),
  start_date: z.string().date().optional().nullable(),
  end_date:   z.string().date().optional().nullable(),
});

const termUpdateSchema = z.object({
  label:      z.string().min(1).max(100).trim().optional(),
  start_date: z.string().date().optional().nullable(),
  end_date:   z.string().date().optional().nullable(),
  is_active:  z.boolean().optional(),
});

// GET /api/institution/terms
router.get('/terms', async (req, res, next) => {
  try {
    const result = await tenantQuery(
      req.tenantSchema,
      `SELECT t.id, t.label, t.start_date, t.end_date, t.is_active, t.created_at,
              COUNT(co.id)::int AS offering_count
       FROM term t
       LEFT JOIN course_offering co ON co.term_id = t.id
       GROUP BY t.id
       ORDER BY t.start_date DESC NULLS LAST, t.label DESC`,
    );
    res.json({ ok: true, terms: result.rows });
  } catch (err) { next(err); }
});

// POST /api/institution/terms
router.post('/terms', async (req, res, next) => {
  try {
    const data = termSchema.parse(req.body);
    const result = await tenantQuery(
      req.tenantSchema,
      `INSERT INTO term (label, start_date, end_date, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING id, label, start_date, end_date, is_active, created_at`,
      [data.label, data.start_date ?? null, data.end_date ?? null, req.user.id],
    );
    res.status(201).json({ ok: true, term: result.rows[0] });
  } catch (err) { next(err); }
});

// PATCH /api/institution/terms/:id
router.patch('/terms/:id', async (req, res, next) => {
  try {
    const data = termUpdateSchema.parse(req.body);
    const sets = [];
    const vals = [];
    if (data.label      !== undefined) { sets.push(`label = $${sets.length + 1}`);      vals.push(data.label); }
    if (data.start_date !== undefined) { sets.push(`start_date = $${sets.length + 1}`); vals.push(data.start_date); }
    if (data.end_date   !== undefined) { sets.push(`end_date = $${sets.length + 1}`);   vals.push(data.end_date); }
    if (data.is_active  !== undefined) { sets.push(`is_active = $${sets.length + 1}`);  vals.push(data.is_active); }
    if (!sets.length) return res.json({ ok: true });
    vals.push(req.params.id);
    const result = await tenantQuery(
      req.tenantSchema,
      `UPDATE term SET ${sets.join(', ')} WHERE id = $${vals.length}
       RETURNING id, label, start_date, end_date, is_active, created_at`,
      vals,
    );
    if (!result.rows.length) return res.status(404).json({ ok: false, error: 'Term not found' });
    res.json({ ok: true, term: result.rows[0] });
  } catch (err) { next(err); }
});

// DELETE /api/institution/terms/:id
router.delete('/terms/:id', async (req, res, next) => {
  try {
    const ref = await tenantQuery(
      req.tenantSchema,
      `SELECT 1 FROM course_offering WHERE term_id = $1 LIMIT 1`,
      [req.params.id],
    );
    if (ref.rows.length) {
      return res.status(409).json({ ok: false, error: 'Cannot delete a term that has course offerings. Remove all offerings first.' });
    }
    const result = await tenantQuery(
      req.tenantSchema,
      `DELETE FROM term WHERE id = $1 RETURNING id`,
      [req.params.id],
    );
    if (!result.rows.length) return res.status(404).json({ ok: false, error: 'Term not found' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Course Offering CRUD ──────────────────────────────────────────────────────

// GET /api/institution/course-offerings?termId=<uuid>
router.get('/course-offerings', async (req, res, next) => {
  try {
    const { termId } = req.query;
    const result = await tenantQuery(
      req.tenantSchema,
      `SELECT co.id, co.course_id, c.code, c.name, co.term_id, t.label AS term_label, co.created_at
       FROM course_offering co
       JOIN course c ON c.id = co.course_id
       JOIN term t ON t.id = co.term_id
       ${termId ? 'WHERE co.term_id = $1' : ''}
       ORDER BY t.start_date DESC NULLS LAST, c.code ASC`,
      termId ? [termId] : [],
    );
    res.json({ ok: true, offerings: result.rows });
  } catch (err) { next(err); }
});

// POST /api/institution/course-offerings
router.post('/course-offerings', async (req, res, next) => {
  try {
    const { courseId, termId } = z.object({
      courseId: z.string().uuid(),
      termId:   z.string().uuid(),
    }).parse(req.body);
    const result = await tenantQuery(
      req.tenantSchema,
      `INSERT INTO course_offering (course_id, term_id)
       VALUES ($1, $2)
       RETURNING id, course_id, term_id, created_at`,
      [courseId, termId],
    );
    res.status(201).json({ ok: true, offering: result.rows[0] });
  } catch (err) { next(err); }
});

// DELETE /api/institution/course-offerings/:id
router.delete('/course-offerings/:id', async (req, res, next) => {
  try {
    const dosRef = await tenantQuery(
      req.tenantSchema,
      `SELECT 1 FROM course_dossier WHERE course_offering_id = $1 LIMIT 1`,
      [req.params.id],
    );
    if (dosRef.rows.length) {
      return res.status(409).json({ ok: false, error: 'Cannot remove offering: professors are linked to it. Unlink them first.' });
    }
    const scRef = await tenantQuery(
      req.tenantSchema,
      `SELECT 1 FROM student_course WHERE course_offering_id = $1 LIMIT 1`,
      [req.params.id],
    );
    if (scRef.rows.length) {
      return res.status(409).json({ ok: false, error: 'Cannot remove offering: students are enrolled in it. Remove enrollments first.' });
    }
    const result = await tenantQuery(
      req.tenantSchema,
      `DELETE FROM course_offering WHERE id = $1 RETURNING id`,
      [req.params.id],
    );
    if (!result.rows.length) return res.status(404).json({ ok: false, error: 'Course offering not found' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
