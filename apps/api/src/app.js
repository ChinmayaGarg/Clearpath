import express        from 'express';
import cors           from 'cors';
import helmet         from 'helmet';
import cookieParser   from 'cookie-parser';
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
import healthRoutes  from './routes/health.js';

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
app.use('/api/students',   studentRoutes);  // platform admin only

// ── Error handler (must be last) ──────────────────────────────────────────────
app.use(errorHandler);

export default app;
