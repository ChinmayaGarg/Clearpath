/**
 * PDF import route
 *
 * POST /api/pdf/import   Upload one or more SARS PDFs
 */
import { Router }      from 'express';
import multer          from 'multer';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { requireFeature } from '../middleware/feature.js';
import { importPDFs }  from '../services/pdfService.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024, files: 20 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      return cb(Object.assign(new Error('Only PDF files are allowed'), { status: 400 }));
    }
    cb(null, true);
  },
});

const router = Router();
router.use(requireAuth);

// ── POST /api/pdf/import ──────────────────────────────────────────────────────
router.post('/import',
  requireRole('lead', 'institution_admin'),
  requireFeature('pdf_import'),
  upload.array('pdfs', 20),
  async (req, res, next) => {
    try {
      if (!req.files?.length) {
        return res.status(400).json({ ok: false, error: 'No PDF files uploaded' });
      }

      const results = await importPDFs(
        req.tenantSchema,
        req.institutionId,
        req.files,
        req.user.id,
      );

      // Summary counts
      const totalAdded     = results.reduce((s, r) => s + (r.added    ?? 0), 0);
      const totalMerged    = results.reduce((s, r) => s + (r.merged   ?? 0), 0);
      const totalUnmatched = results.reduce((s, r) => s + (r.unmatched ?? 0), 0);
      const errors         = results.filter(r => r.error);

      res.json({
        ok:      errors.length === 0,
        results,
        summary: {
          files:     results.length,
          added:     totalAdded,
          merged:    totalMerged,
          unmatched: totalUnmatched,
          errors:    errors.length,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
