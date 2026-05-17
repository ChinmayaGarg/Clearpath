-- Replace free-text course_code columns with a proper FK to the course master table.
-- Safe to run because data was cleared in Phase 1 (no rows to migrate).

-- ── exam_booking_request ────────────────────────────────────────────────────
ALTER TABLE :schema_name.exam_booking_request
  DROP COLUMN course_code,
  ADD COLUMN course_id UUID NOT NULL REFERENCES :schema_name.course(id);

DROP INDEX IF EXISTS :schema_name.idx_exam_booking_professor;
CREATE INDEX idx_exam_booking_professor ON :schema_name.exam_booking_request (professor_profile_id, status);
CREATE INDEX idx_exam_booking_request_course ON :schema_name.exam_booking_request (course_id, exam_date);

-- ── exam_upload ─────────────────────────────────────────────────────────────
ALTER TABLE :schema_name.exam_upload
  DROP COLUMN course_code,
  ADD COLUMN course_id UUID NOT NULL REFERENCES :schema_name.course(id);

DROP INDEX IF EXISTS :schema_name.idx_exam_upload_course;
CREATE INDEX idx_exam_upload_course ON :schema_name.exam_upload (course_id);

-- ── course_dossier ──────────────────────────────────────────────────────────
ALTER TABLE :schema_name.course_dossier
  DROP CONSTRAINT uq_course_dossier_term,
  DROP CONSTRAINT uq_dossier_prof_course_type;

DROP INDEX IF EXISTS :schema_name.idx_course_dossier_course;

ALTER TABLE :schema_name.course_dossier
  DROP COLUMN course_code,
  ADD COLUMN course_id UUID NOT NULL REFERENCES :schema_name.course(id);

CREATE INDEX idx_course_dossier_course ON :schema_name.course_dossier (course_id);
ALTER TABLE :schema_name.course_dossier
  ADD CONSTRAINT uq_course_dossier_term UNIQUE (professor_id, course_id, term),
  ADD CONSTRAINT uq_dossier_prof_course_type UNIQUE (professor_id, course_id, exam_type_label);

-- ── student_course ──────────────────────────────────────────────────────────
ALTER TABLE :schema_name.student_course
  DROP CONSTRAINT uq_student_course;

DROP INDEX IF EXISTS :schema_name.uq_student_course;

ALTER TABLE :schema_name.student_course
  DROP COLUMN course_code,
  ADD COLUMN course_id UUID NOT NULL REFERENCES :schema_name.course(id);

ALTER TABLE :schema_name.student_course
  ADD CONSTRAINT uq_student_course UNIQUE (student_profile_id, course_id);

-- ── exam_schedule ───────────────────────────────────────────────────────────
ALTER TABLE :schema_name.exam_schedule
  DROP CONSTRAINT exam_schedule_course_code_exam_date_exam_time_key;

DROP INDEX IF EXISTS :schema_name.idx_exam_schedule_course_date;

ALTER TABLE :schema_name.exam_schedule
  DROP COLUMN course_code,
  ADD COLUMN course_id UUID NOT NULL REFERENCES :schema_name.course(id);

CREATE INDEX idx_exam_schedule_course_date ON :schema_name.exam_schedule (course_id, exam_date);
ALTER TABLE :schema_name.exam_schedule
  ADD CONSTRAINT exam_schedule_course_id_exam_date_exam_time_key UNIQUE (course_id, exam_date, exam_time);
