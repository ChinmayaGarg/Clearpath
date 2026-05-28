CREATE TABLE :schema_name.accommodation_renewal_request (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_profile_id    UUID NOT NULL REFERENCES :schema_name.student_profile(id),
  requested_term_id     UUID NOT NULL REFERENCES :schema_name.term(id),
  notes                 TEXT,
  status                TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'approved', 'rejected')),
  counsellor_profile_id UUID REFERENCES :schema_name.counsellor_profile(id),
  counsellor_notes      TEXT,
  reviewed_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (student_profile_id, requested_term_id)
);
