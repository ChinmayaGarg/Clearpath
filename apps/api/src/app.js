import express        from 'express';
import cors           from 'cors';
import helmet         from 'helmet';
import cookieParser   from 'cookie-parser';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { rateLimiter }  from './middleware/rateLimiter.js';
import { errorHandler } from './middleware/errorHandler.js';

import authRoutes    from './routes/auth.js';
import bookRoutes    from './routes/books.js';
import examRoutes    from './routes/exams.js';
import userRoutes    from './routes/users.js';
import pdfRoutes     from './routes/pdf.js';
import dossierRoutes from './routes/dossier.js';
import formRoutes    from './routes/forms.js';
import adminRoutes      from './routes/admin.js';
import professorRoutes from './routes/professors.js';
import studentRoutes   from './routes/students.js';
import exportRoutes    from './routes/export.js';
import analyticsRoutes      from './routes/analytics.js';
import notificationRoutes from './routes/notifications.js';
import statusRoutes       from './routes/status.js';
import claimRoutes        from './routes/claim.js';
import portalRoutes       from './routes/professorPortal.js';
import healthRoutes  from './routes/health.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

// ── Security & parsing ────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
app.use(rateLimiter);

// ── Static file serving ───────────────────────────────────────────────────────
// Serve uploaded exam files
app.use('/uploads', express.static(join(__dirname, '../../uploads')));

// Force HTTPS in production
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production' &&
      req.header('x-forwarded-proto') !== 'https') {
    return res.redirect(`https://${req.header('host')}${req.url}`);
  }
  next();
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/health',  healthRoutes);
app.use('/api/auth',    authRoutes);
app.use('/api/books',   bookRoutes);
app.use('/api/exams',   examRoutes);
app.use('/api/users',   userRoutes);
app.use('/api/pdf',     pdfRoutes);
app.use('/api/dossier', dossierRoutes);
app.use('/api/forms',   formRoutes);
app.use('/api/admin',      adminRoutes);
app.use('/api/professors', professorRoutes);
app.use('/api/students',   studentRoutes);
app.use('/api/export',     exportRoutes);
app.use('/api/analytics',      analyticsRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/status',        statusRoutes);
app.use('/api/claim',         claimRoutes);
app.use('/api/portal',        portalRoutes);  // platform admin only

// ── Error handler (must be last) ──────────────────────────────────────────────
app.use(errorHandler);

export default app;
