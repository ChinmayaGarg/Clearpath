/**
 * Role-based access control middleware.
 * Checks that the authenticated user has at least one of the required roles.
 *
 * Usage:
 *   router.delete('/users/:id', requireRole('institution_admin'), handler);
 *   router.post('/exams',       requireRole('lead', 'institution_admin'), handler);
 */
export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    const userRoles = req.userRoles ?? req.user?.roles ?? [];
    const hasRole   = allowedRoles.some(role => userRoles.includes(role));
    if (!hasRole) {
      return res.status(403).json({
        ok: false,
        error: `Requires one of: ${allowedRoles.join(', ')}`,
      });
    }
    next();
  };
}
