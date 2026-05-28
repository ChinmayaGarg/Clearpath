-- Drop the manually-applied 2-column unique constraint on student_accommodation.
-- This constraint (student_profile_id, accommodation_code_id) prevents a student
-- from holding the same accommodation code across multiple terms, and blocks
-- the ON CONFLICT upsert in the renewal approval flow.
-- The correct constraint is uq_student_accommodation_term (3 columns, includes term_id).
ALTER TABLE :schema_name.student_accommodation
  DROP CONSTRAINT IF EXISTS student_accommodation_granted_uq;
