-- Drop the partial unique index that enforces one granted accommodation per code across all terms.
-- This predates the per-term design and blocks a student from having the same code in multiple terms.
-- The correct uniqueness is enforced by uq_student_accommodation_term (student_profile_id, accommodation_code_id, term_id).
DROP INDEX IF EXISTS :schema_name.student_accommodation_granted_uq;
