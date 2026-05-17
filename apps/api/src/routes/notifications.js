/**
 * Notification routes
 *
 * GET /api/notifications   Get active notifications for today
 */
import { Router }      from 'express';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// ── GET /api/notifications ────────────────────────────────────────────────────
// SARS-based exam-day notifications have been removed (exam_day table dropped).
// Returns empty array until Clearpath-native notifications are implemented.
router.get('/', (req, res) => {
  const date = req.query.date || new Date().toISOString().split('T')[0];
  res.json({ ok: true, notifications: [], date });
});

export default router;
