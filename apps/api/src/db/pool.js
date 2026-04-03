/**
 * Control plane pool — connects to public schema only.
 * Used for: institution lookup, feature gate checks, platform admin operations.
 * Never used for tenant data queries.
 */
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

export default pool;
