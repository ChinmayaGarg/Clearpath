/**
 * Book (ExamDay) routes
 *
 * GET  /api/books              List all exam days (calendar summary)
 * GET  /api/books/:date        Get full daily book for a date
 * POST /api/books              Create a new book for a date
 * PUT  /api/books/:id          Update book notes / published state
 */
import { Router }      from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { createBookSchema } from '../utils/validation.js';
import {
  getAllBooks, getBook,
  createBook, updateBook,
} from '../services/bookService.js';
import { insertLeadAuditLog } from '../db/queries/leadAuditLog.js';

const router = Router();
router.use(requireAuth);

// ── GET /api/books ────────────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const books = await getAllBooks(req.tenantSchema);
    res.json({ ok: true, books });
  } catch (err) { next(err); }
});

// ── GET /api/books/:date ──────────────────────────────────────────────────────
router.get('/:date', async (req, res, next) => {
  try {
    const { date } = req.params;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ ok: false, error: 'Date must be YYYY-MM-DD' });
    }
    const book = await getBook(req.tenantSchema, date);
    if (!book) {
      return res.status(404).json({ ok: false, error: 'No book found for this date' });
    }
    res.json({ ok: true, book });
  } catch (err) { next(err); }
});

// ── POST /api/books ───────────────────────────────────────────────────────────
router.post('/',
  requireRole('lead', 'institution_admin'),
  async (req, res, next) => {
    try {
      const { date, notes } = createBookSchema.parse(req.body);
      const book = await createBook(req.tenantSchema, {
        date, notes, createdBy: req.user.id,
      });

      (async () => {
        try {
          await insertLeadAuditLog(req.tenantSchema, {
            performedBy: req.user.id,
            action: 'CREATE_BOOK',
            description: `Created exam day book for ${date}`,
            entityType: 'exam_day',
            entityId: book?.id,
          });
        } catch (err) { console.warn('audit log failed:', err); }
      })();

      res.status(201).json({ ok: true, book });
    } catch (err) { next(err); }
  }
);

// ── PUT /api/books/:id ────────────────────────────────────────────────────────
router.put('/:id',
  requireRole('lead', 'institution_admin'),
  async (req, res, next) => {
    try {
      const { notes, isPublished } = req.body;
      const book = await updateBook(req.tenantSchema, req.params.id, {
        notes, isPublished,
      });

      (async () => {
        try {
          await insertLeadAuditLog(req.tenantSchema, {
            performedBy: req.user.id,
            action: 'UPDATE_BOOK',
            description: `Updated exam day book for ${book?.date ?? req.params.id}`,
            entityType: 'exam_day',
            entityId: req.params.id,
          });
        } catch (err) { console.warn('audit log failed:', err); }
      })();

      res.json({ ok: true, book });
    } catch (err) { next(err); }
  }
);

export default router;
