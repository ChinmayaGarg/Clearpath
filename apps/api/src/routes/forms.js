/**
 * Dynamic form routes
 *
 * GET  /api/forms/:entityType/:context   Get form schema + fields for a context
 */
import { Router }      from 'express';
import { requireAuth } from '../middleware/auth.js';
import { tenantQuery } from '../db/tenantPool.js';

const router = Router();
router.use(requireAuth);

// ── GET /api/forms/:entityType/:context ───────────────────────────────────────
router.get('/:entityType/:context', async (req, res, next) => {
  try {
    const { entityType, context } = req.params;

    // Get schema
    const schemaResult = await tenantQuery(req.tenantSchema,
      `SELECT id, entity_type, context, label, is_active
       FROM form_schema
       WHERE entity_type = $1 AND context = $2 AND is_active = TRUE`,
      [entityType, context]
    );

    if (!schemaResult.rows.length) {
      return res.status(404).json({ ok: false, error: 'Form schema not found' });
    }

    const schema = schemaResult.rows[0];

    // Get fields with options
    const fieldsResult = await tenantQuery(req.tenantSchema,
      `SELECT
         f.id, f.key, f.label, f.field_type, f.is_required,
         f.display_order, f.default_value, f.placeholder, f.help_text,
         COALESCE(
           json_agg(
             json_build_object(
               'value', o.value,
               'label', o.label,
               'display_order', o.display_order
             ) ORDER BY o.display_order
           ) FILTER (WHERE o.id IS NOT NULL),
           '[]'
         ) AS options
       FROM form_field f
       LEFT JOIN form_field_option o ON o.field_id = f.id AND o.is_active = TRUE
       WHERE f.schema_id = $1 AND f.is_active = TRUE
       GROUP BY f.id
       ORDER BY f.display_order`,
      [schema.id]
    );

    res.json({
      ok:     true,
      schema,
      fields: fieldsResult.rows,
    });
  } catch (err) { next(err); }
});

// ── GET /api/forms/:entityType/:context/values/:entityId ─────────────────────
router.get('/:entityType/:context/values/:entityId', async (req, res, next) => {
  try {
    const result = await tenantQuery(req.tenantSchema,
      `SELECT ffv.field_id, ff.key, ffv.value
       FROM form_field_value ffv
       JOIN form_field ff ON ff.id = ffv.field_id
       WHERE ffv.entity_id = $1`,
      [req.params.entityId]
    );

    const values = Object.fromEntries(result.rows.map(r => [r.key, r.value]));
    res.json({ ok: true, values });
  } catch (err) { next(err); }
});

// ── POST /api/forms/:entityType/:context/values/:entityId ────────────────────
router.post('/:entityType/:context/values/:entityId', async (req, res, next) => {
  try {
    const { values } = req.body; // { fieldKey: value, ... }
    if (!values || typeof values !== 'object') {
      return res.status(400).json({ ok: false, error: 'values object required' });
    }

    for (const [key, value] of Object.entries(values)) {
      // Resolve field ID from key
      const fieldResult = await tenantQuery(req.tenantSchema,
        `SELECT ff.id FROM form_field ff
         JOIN form_schema fs ON fs.id = ff.schema_id
         WHERE ff.key = $1
           AND fs.entity_type = $2
           AND fs.context = $3`,
        [key, req.params.entityType, req.params.context]
      );
      if (!fieldResult.rows.length) continue;
      const fieldId = fieldResult.rows[0].id;

      await tenantQuery(req.tenantSchema,
        `INSERT INTO form_field_value (field_id, entity_id, value)
         VALUES ($1, $2, $3)
         ON CONFLICT (field_id, entity_id)
         DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [fieldId, req.params.entityId, String(value)]
      );
    }

    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
