/**
 * Form query helpers — low-level queries used by forms routes.
 */
import { tenantQuery } from '../tenantPool.js';

export async function getFormSchema(schema, entityType, context) {
  const result = await tenantQuery(schema,
    `SELECT id, entity_type, context, label
     FROM form_schema
     WHERE entity_type = $1 AND context = $2 AND is_active = TRUE`,
    [entityType, context]
  );
  return result.rows[0] ?? null;
}

export async function getFormFields(schema, schemaId) {
  const result = await tenantQuery(schema,
    `SELECT f.id, f.key, f.label, f.field_type, f.is_required,
            f.display_order, f.default_value, f.placeholder, f.help_text
     FROM form_field f
     WHERE f.schema_id = $1 AND f.is_active = TRUE
     ORDER BY f.display_order`,
    [schemaId]
  );
  return result.rows;
}
