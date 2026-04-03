/**
 * Audit log query functions.
 * All entries are append-only — no UPDATE or DELETE.
 */
import { tenantQuery } from '../tenantPool.js';

/**
 * Append a single audit log entry.
 */
export async function logAction(schema, {
  entityType, entityId, action,
  fieldName = null, oldValue = null, newValue = null,
  changedBy,
}) {
  await tenantQuery(schema,
    `INSERT INTO audit_log
       (entity_type, entity_id, action, field_name, old_value, new_value, changed_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [entityType, entityId, action, fieldName, oldValue, newValue, changedBy]
  );
}

/**
 * Fetch audit trail for a specific entity, newest first.
 */
export async function getAuditTrail(schema, { entityType, entityId, limit = 50 }) {
  const result = await tenantQuery(schema,
    `SELECT
       al.id, al.action, al.field_name, al.old_value, al.new_value,
       al.created_at,
       u.first_name || ' ' || u.last_name AS changed_by_name,
       u.email AS changed_by_email
     FROM audit_log al
     LEFT JOIN "user" u ON u.id = al.changed_by
     WHERE al.entity_type = $1 AND al.entity_id = $2
     ORDER BY al.created_at DESC
     LIMIT $3`,
    [entityType, entityId, limit]
  );
  return result.rows;
}
