/**
 * Tenant-scoped query helper.
 * Sets search_path to the tenant schema before every query,
 * ensuring complete isolation between institutions.
 *
 * Usage:
 *   import { tenantQuery } from '../db/tenantPool.js';
 *   const result = await tenantQuery(req.tenantSchema, 'SELECT * FROM exam WHERE id = $1', [id]);
 */
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
});

/**
 * Execute a query scoped to a specific tenant schema.
 * @param {string} schema   - tenant schema name e.g. 'dal'
 * @param {string} text     - SQL query
 * @param {any[]}  params   - query parameters
 */
export async function tenantQuery(schema, text, params = []) {
  const client = await pool.connect();
  try {
    // Validate schema name — prevent injection via schema parameter
    if (!/^[a-z][a-z0-9_]+$/.test(schema)) {
      throw new Error(`Invalid schema name: "${schema}"`);
    }
    await client.query(`SET search_path TO ${schema}, public`);
    const result = await client.query(text, params);
    return result;
  } finally {
    // Reset search_path before returning client to pool
    await client.query('SET search_path TO public');
    client.release();
  }
}

/**
 * Execute multiple queries in a single transaction, scoped to a tenant schema.
 * @param {string}   schema - tenant schema name
 * @param {Function} fn     - async function receiving the client
 */
export async function tenantTransaction(schema, fn) {
  const client = await pool.connect();
  try {
    if (!/^[a-z][a-z0-9_]+$/.test(schema)) {
      throw new Error(`Invalid schema name: "${schema}"`);
    }
    await client.query('BEGIN');
    await client.query(`SET search_path TO ${schema}, public`);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    await client.query('SET search_path TO public');
    client.release();
  }
}
