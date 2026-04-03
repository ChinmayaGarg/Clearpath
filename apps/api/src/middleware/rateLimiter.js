import rateLimit from 'express-rate-limit';

export const rateLimiter = rateLimit({
  windowMs:        15 * 60 * 1000, // 15 minutes
  max:             300,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { ok: false, error: 'Too many requests, please try again later' },
});

export const loginLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,
  max:             10,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { ok: false, error: 'Too many login attempts, please try again later' },
});
