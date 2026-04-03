// =============================================================================
// AC EXAM MANAGER — TENANT PROVISIONER
// Runs when a new institution is onboarded.
// Wraps everything in a transaction — either the full schema is created or nothing.
// =============================================================================

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const { Pool } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/**
 * Provision a new tenant schema.
 *
 * @param {object} options
 * @param {string} options.institutionName   - e.g. "Dalhousie University"
 * @param {string} options.slug              - e.g. "dal" — becomes the schema name
 * @param {string} options.emailDomain       - e.g. "dal.ca"
 * @param {string} options.planName          - "standard" | "professional" | "enterprise"
 * @param {string} options.timezone          - e.g. "America/Halifax"
 * @param {string} options.adminEmail        - first institution admin email
 * @param {string} options.adminFirstName
 * @param {string} options.adminLastName
 * @param {string} options.adminPasswordHash
 * @param {string} options.adminSalt
 * @param {string} options.platformAdminId   - UUID of platform admin running provisioning
 */
export async function provisionTenant(options) {
  const {
    institutionName,
    slug,
    emailDomain,
    planName,
    timezone = 'America/Halifax',
    adminEmail,
    adminFirstName,
    adminLastName,
    adminPasswordHash,
    adminSalt,
    platformAdminId,
  } = options;

  // Validate slug — must be safe for use as schema name
  if (!/^[a-z][a-z0-9_]+$/.test(slug)) {
    throw new Error(`Invalid slug: "${slug}". Must match ^[a-z][a-z0-9_]+$`);
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // ------------------------------------------------------------------
    // 1. Resolve plan_id
    // ------------------------------------------------------------------
    const planResult = await client.query(
      `SELECT id FROM public.plan WHERE name = $1 AND is_active = TRUE`,
      [planName]
    );
    if (!planResult.rows.length) {
      throw new Error(`Plan "${planName}" not found or inactive`);
    }
    const planId = planResult.rows[0].id;

    // ------------------------------------------------------------------
    // 2. Create Institution row in public schema
    // ------------------------------------------------------------------
    const institutionResult = await client.query(
      `INSERT INTO public.institution
           (name, slug, email_domain, plan_id, timezone)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [institutionName, slug, emailDomain, planId, timezone]
    );
    const institutionId = institutionResult.rows[0].id;

    // ------------------------------------------------------------------
    // 3. Register in TenantRegistry (status = provisioning)
    // ------------------------------------------------------------------
    await client.query(
      `INSERT INTO public.tenant_registry
           (institution_id, schema_name, db_status)
       VALUES ($1, $2, 'provisioning')`,
      [institutionId, slug]
    );

    // ------------------------------------------------------------------
    // 4. Create Subscription row (trialing)
    // ------------------------------------------------------------------
    await client.query(
      `INSERT INTO public.subscription (institution_id, status)
       VALUES ($1, 'trialing')`,
      [institutionId]
    );

    // ------------------------------------------------------------------
    // 5. Run tenant schema template
    //    Replace :schema_name placeholder with actual slug
    // ------------------------------------------------------------------
    const templatePath = join(__dirname, 'schema', '02_tenant_schema_template.sql');
    const templateSQL  = readFileSync(templatePath, 'utf8');
    const tenantSQL    = templateSQL.replaceAll(':schema_name', slug);
    await client.query(tenantSQL);

    // ------------------------------------------------------------------
    // 6. Create first institution admin user in the tenant schema
    // ------------------------------------------------------------------
    await client.query(`SET search_path TO ${slug}, public`);

    const userResult = await client.query(
      `INSERT INTO ${slug}.user
           (email, email_domain, first_name, last_name, password_hash, salt)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        adminEmail,
        emailDomain,
        adminFirstName,
        adminLastName,
        adminPasswordHash,
        adminSalt,
      ]
    );
    const adminUserId = userResult.rows[0].id;

    // Grant institution_admin role
    await client.query(
      `INSERT INTO ${slug}.user_role (user_id, role)
       VALUES ($1, 'institution_admin')`,
      [adminUserId]
    );

    // ------------------------------------------------------------------
    // 7. Mark tenant as active, record migration version 1
    // ------------------------------------------------------------------
    await client.query(
      `UPDATE public.tenant_registry
       SET db_status = 'active',
           migration_version = 1,
           provisioned_at = NOW(),
           last_migrated_at = NOW()
       WHERE schema_name = $1`,
      [slug]
    );

    // ------------------------------------------------------------------
    // 8. Audit log
    // ------------------------------------------------------------------
    await client.query(`SET search_path TO public`);
    await client.query(
      `INSERT INTO public.platform_audit_log
           (admin_id, action, target_institution_id, details)
       VALUES ($1, 'tenant_provisioned', $2, $3)`,
      [
        platformAdminId,
        institutionId,
        JSON.stringify({ slug, planName, adminEmail }),
      ]
    );

    await client.query('COMMIT');

    console.log(`✓ Tenant "${slug}" provisioned successfully`);
    console.log(`  Institution ID : ${institutionId}`);
    console.log(`  Schema         : ${slug}`);
    console.log(`  Plan           : ${planName}`);
    console.log(`  Admin          : ${adminEmail}`);

    return { institutionId, schemaName: slug };

  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`✗ Provisioning failed for "${slug}":`, err.message);
    throw err;
  } finally {
    client.release();
  }
}

// =============================================================================
// Migration runner — applies a standard migration to all active tenant schemas
// =============================================================================

/**
 * Run a standard migration SQL file against all active tenant schemas.
 * Migration SQL must use :schema_name as the placeholder.
 *
 * @param {string} migrationPath - path to the .sql migration file
 * @param {number} migrationVersion - the new version number after this migration
 */
export async function runStandardMigration(migrationPath, migrationVersion) {
  const migrationSQL = readFileSync(migrationPath, 'utf8');

  const tenantsResult = await pool.query(
    `SELECT schema_name FROM public.tenant_registry
     WHERE db_status = 'active'
     AND migration_version < $1
     ORDER BY schema_name`,
    [migrationVersion]
  );

  const tenants = tenantsResult.rows;
  console.log(`Running migration v${migrationVersion} against ${tenants.length} tenant(s)`);

  for (const tenant of tenants) {
    const { schema_name } = tenant;
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const sql = migrationSQL.replaceAll(':schema_name', schema_name);
      await client.query(sql);

      await client.query(
        `UPDATE public.tenant_registry
         SET migration_version = $1, last_migrated_at = NOW()
         WHERE schema_name = $2`,
        [migrationVersion, schema_name]
      );

      await client.query('COMMIT');
      console.log(`  ✓ ${schema_name} → v${migrationVersion}`);

    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`  ✗ ${schema_name} failed:`, err.message);
      // Continue with other tenants — don't abort the whole run
    } finally {
      client.release();
    }
  }

  console.log('Migration complete.');
}
