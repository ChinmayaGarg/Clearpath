-- Migration 027: Change scantron_needed from BOOLEAN to TEXT
-- New values: 'not_needed', 'purple', 'green'
-- Existing true  → 'purple' (best guess for previously-needed scantrons)
-- Existing false → 'not_needed'

ALTER TABLE :schema_name.exam_upload
  ALTER COLUMN scantron_needed TYPE TEXT
  USING CASE
    WHEN scantron_needed = true  THEN 'purple'
    WHEN scantron_needed = false THEN 'not_needed'
    ELSE NULL
  END;
