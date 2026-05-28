CREATE TABLE :schema_name.renewal_request_accommodation (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  renewal_request_id    UUID NOT NULL REFERENCES :schema_name.accommodation_renewal_request(id) ON DELETE CASCADE,
  accommodation_code_id UUID NOT NULL REFERENCES :schema_name.accommodation_code(id),
  UNIQUE (renewal_request_id, accommodation_code_id)
);
