-- Migration: Add term tracking to course_dossier
-- Allows professors to be connected to courses in different terms
-- e.g., Prof A teaches CSCI 101 in Fall 2025 and Winter 2026 (separate dossiers)

-- Add term column to course_dossier
ALTER TABLE IF EXISTS :schema_name.course_dossier
ADD COLUMN IF NOT EXISTS term TEXT NOT NULL DEFAULT 'current';

-- Drop old unique constraint
ALTER TABLE IF EXISTS :schema_name.course_dossier
DROP CONSTRAINT IF EXISTS uq_course_dossier;

-- Create new unique constraint that includes term
ALTER TABLE IF EXISTS :schema_name.course_dossier
ADD CONSTRAINT uq_course_dossier_term UNIQUE (professor_id, course_code, term);

-- Create index for efficient term queries
CREATE INDEX IF NOT EXISTS idx_course_dossier_term ON :schema_name.course_dossier (term);
CREATE INDEX IF NOT EXISTS idx_course_dossier_prof_term ON :schema_name.course_dossier (professor_id, term);

COMMENT ON COLUMN :schema_name.course_dossier.term IS
  'Academic term label, e.g., "Fall 2025", "Winter 2026", "Summer 2026".
   Allows same professor to teach same course in different terms (separate records).';
