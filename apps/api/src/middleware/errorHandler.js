/**
 * Global error handler — must be the last middleware in app.js.
 * Catches all errors thrown by route handlers and formats them consistently.
 */
export function errorHandler(err, req, res, next) {
  // Log with context
  console.error({
    error:  err.message,
    stack:  process.env.NODE_ENV === 'development' ? err.stack : undefined,
    path:   req.path,
    method: req.method,
    user:   req.user?.email,
    schema: req.tenantSchema,
  });

  // Validation errors (Zod)
  if (err.name === 'ZodError') {
    return res.status(400).json({
      ok:     false,
      error:  'Validation failed',
      issues: err.errors,
    });
  }

  // Postgres unique violation
  if (err.code === '23505') {
    return res.status(409).json({ ok: false, error: 'Record already exists' });
  }

  // Postgres FK violation
  if (err.code === '23503') {
    return res.status(409).json({ ok: false, error: 'Referenced record not found' });
  }

  const status = err.status || err.statusCode || 500;
  const message = process.env.NODE_ENV === 'production' && status === 500
    ? 'An error occurred'
    : err.message;

  res.status(status).json({ ok: false, error: message });
}
