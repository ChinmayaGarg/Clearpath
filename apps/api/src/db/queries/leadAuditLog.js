import { tenantQuery } from '../tenantPool.js';

export async function insertLeadAuditLog(schema, { performedBy, action, description, entityType, entityId }) {
  await tenantQuery(schema,
    `INSERT INTO lead_audit_log (performed_by, action, description, entity_type, entity_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [performedBy, action, description ?? null, entityType ?? null, entityId != null ? String(entityId) : null],
  );
}

export async function queryLeadAuditLog(schema, { performedBy, action, fromDate, toDate, limit = 50, offset = 0 }) {
  const conditions = [];
  const filterParams = [];

  if (performedBy) {
    filterParams.push(performedBy);
    conditions.push(`lal.performed_by = $${filterParams.length}::uuid`);
  }
  if (action) {
    filterParams.push(action);
    conditions.push(`lal.action = $${filterParams.length}`);
  }
  if (fromDate) {
    filterParams.push(fromDate);
    conditions.push(`lal.created_at >= $${filterParams.length}::date`);
  }
  if (toDate) {
    filterParams.push(toDate);
    conditions.push(`lal.created_at < ($${filterParams.length}::date + interval '1 day')`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limitIdx = filterParams.length + 1;
  const offsetIdx = filterParams.length + 2;
  const dataParams = [...filterParams, limit, offset];

  const [rowsResult, countResult] = await Promise.all([
    tenantQuery(schema,
      `SELECT
         lal.id, lal.action, lal.description, lal.entity_type, lal.entity_id,
         lal.created_at,
         u.first_name, u.last_name
       FROM lead_audit_log lal
       JOIN "user" u ON u.id = lal.performed_by
       ${where}
       ORDER BY lal.created_at DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      dataParams,
    ),
    tenantQuery(schema,
      `SELECT COUNT(*) AS total FROM lead_audit_log lal ${where}`,
      filterParams,
    ),
  ]);

  return { rows: rowsResult.rows, total: parseInt(countResult.rows[0]?.total ?? 0) };
}

export async function getLeads(schema) {
  const result = await tenantQuery(schema,
    `SELECT u.id, u.first_name, u.last_name
     FROM "user" u
     JOIN user_role ur ON ur.user_id = u.id
     WHERE ur.role = 'lead' AND ur.is_active = TRUE
     ORDER BY u.last_name ASC, u.first_name ASC`,
  );
  return result.rows;
}

export async function getStaff(schema) {
  const result = await tenantQuery(schema,
    `SELECT u.id, u.first_name, u.last_name, ur.role
     FROM "user" u
     JOIN user_role ur ON ur.user_id = u.id
     WHERE ur.role IN ('lead', 'institution_admin') AND ur.is_active = TRUE
     ORDER BY ur.role ASC, u.last_name ASC, u.first_name ASC`,
  );
  return result.rows;
}
