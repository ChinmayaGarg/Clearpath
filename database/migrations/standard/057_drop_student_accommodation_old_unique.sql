-- Drop stale 2-column unique constraints on student_accommodation.
-- These only cover (student_profile_id, accommodation_code_id) without term_id,
-- which prevents a student from holding the same accommodation code across multiple terms,
-- and breaks the ON CONFLICT upsert in the renewal approval flow.
-- The correct constraint is uq_student_accommodation_term (student_profile_id, accommodation_code_id, term_id).
ALTER TABLE :schema_name.student_accommodation
  DROP CONSTRAINT IF EXISTS student_accommodation_granted_uq;

ALTER TABLE :schema_name.student_accommodation
  DROP CONSTRAINT IF EXISTS student_accommodation_student_profile_id_accommodation_code_id_key;
