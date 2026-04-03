import crypto from 'crypto';

/**
 * Hash a token with SHA-256.
 * Used for: session tokens, password reset tokens.
 * Raw token lives only in the browser cookie — never stored.
 */
export function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

/**
 * Hash a password with PBKDF2.
 * 310,000 iterations — NIST recommended minimum as of 2023.
 * Slower by design — makes brute-force attacks expensive.
 */
export function hashPassword(password, salt) {
  return crypto
    .pbkdf2Sync(password, salt, 310_000, 32, 'sha256')
    .toString('hex');
}

/**
 * Generate a cryptographically secure random token.
 * @param {number} bytes - entropy in bytes (32 = 256 bits, good for sessions)
 */
export function generateToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Generate a random salt for password hashing.
 */
export function generateSalt() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Timing-safe string comparison.
 * Prevents timing attacks where an attacker measures response time
 * to learn which characters of a token are correct.
 */
export function safeCompare(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
