/**
 * Clearpath — Local Development Setup Script
 *
 * Run once after the control plane migration to:
 *  1. Create a platform admin record
 *  2. Provision the first institution (dal)
 *  3. Create the first institution admin user
 *  4. Print login credentials
 *
 * Usage:
 *   node database/scripts/dev-setup.js
 *
 * Requires DATABASE_URL to be set in environment or apps/api/.env
 */

import "dotenv/config";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import pg from "pg";
import crypto from "crypto";

// ── Load .env from apps/api if DATABASE_URL not already set ──────────────────
if (!process.env.DATABASE_URL) {
  try {
    const envPath = join(
      dirname(fileURLToPath(import.meta.url)),
      "../../apps/api/.env",
    );
    const lines = readFileSync(envPath, "utf8").split("\n");
    for (const line of lines) {
      const [key, ...rest] = line.split("=");
      if (key && rest.length) process.env[key.trim()] = rest.join("=").trim();
    }
  } catch {
    // .env not found — rely on environment
  }
}

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ── Crypto helpers ────────────────────────────────────────────────────────────
function generateSalt() {
  return crypto.randomBytes(16).toString("hex");
}

function hashPassword(password, salt) {
  return crypto
    .pbkdf2Sync(password, salt, 310_000, 32, "sha256")
    .toString("hex");
}

function generateId() {
  return crypto.randomUUID();
}

// ── Config — change these for your local setup ────────────────────────────────
const CONFIG = {
  institution: {
    name: "Dalhousie University",
    slug: "dal",
    domain: "dal.ca",
    plan: "professional",
    timezone: "America/Halifax",
  },
  admin: {
    email: "admin@dal.ca",
    firstName: "Chinmaya",
    lastName: "Garg",
    password: "Clearpath2026!", // change after first login
  },
  platformAdmin: {
    email: "platform@clearpath.dev",
    firstName: "Platform",
    lastName: "Admin",
    password: "Platform2026!",
  },
};

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    console.log("\n🚀 Clearpath — Dev Setup\n");

    // ── 1. Platform admin ─────────────────────────────────────────────────────
    console.log("Creating platform admin…");
    const paSalt = generateSalt();
    const paHash = hashPassword(CONFIG.platformAdmin.password, paSalt);
    const paId = generateId();

    await client.query(
      `INSERT INTO public.platform_admin
         (id, email, first_name, last_name, password_hash, salt)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (email) DO UPDATE SET
         password_hash = EXCLUDED.password_hash,
         salt          = EXCLUDED.salt`,
      [
        paId,
        CONFIG.platformAdmin.email,
        CONFIG.platformAdmin.firstName,
        CONFIG.platformAdmin.lastName,
        paHash,
        paSalt,
      ],
    );

    // Get the actual ID (may have been existing)
    const paResult = await client.query(
      `SELECT id FROM public.platform_admin WHERE email = $1`,
      [CONFIG.platformAdmin.email],
    );
    const platformAdminId = paResult.rows[0].id;

    // ── 2. Resolve plan ───────────────────────────────────────────────────────
    const planResult = await client.query(
      `SELECT id FROM public.plan WHERE name = $1`,
      [CONFIG.institution.plan],
    );
    if (!planResult.rows.length) {
      throw new Error(
        `Plan '${CONFIG.institution.plan}' not found. Did you run 001_control_plane.sql?`,
      );
    }
    const planId = planResult.rows[0].id;

    // ── 3. Institution ────────────────────────────────────────────────────────
    console.log(`Provisioning institution '${CONFIG.institution.slug}'…`);

    const existingInst = await client.query(
      `SELECT id FROM public.institution WHERE slug = $1`,
      [CONFIG.institution.slug],
    );

    let institutionId;

    if (existingInst.rows.length) {
      institutionId = existingInst.rows[0].id;
      console.log(
        `  Institution '${CONFIG.institution.slug}' already exists — skipping.`,
      );
    } else {
      const instResult = await client.query(
        `INSERT INTO public.institution
           (name, slug, email_domain, plan_id, timezone)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [
          CONFIG.institution.name,
          CONFIG.institution.slug,
          CONFIG.institution.domain,
          planId,
          CONFIG.institution.timezone,
        ],
      );
      institutionId = instResult.rows[0].id;

      // TenantRegistry
      await client.query(
        `INSERT INTO public.tenant_registry (institution_id, schema_name, db_status)
         VALUES ($1, $2, 'provisioning')`,
        [institutionId, CONFIG.institution.slug],
      );

      // Subscription
      await client.query(
        `INSERT INTO public.subscription (institution_id, status)
         VALUES ($1, 'active')`,
        [institutionId],
      );
    }

    // ── 4. Tenant schema ──────────────────────────────────────────────────────
    const schemaExists = await client.query(
      `SELECT schema_name FROM information_schema.schemata
       WHERE schema_name = $1`,
      [CONFIG.institution.slug],
    );

    if (schemaExists.rows.length) {
      console.log(
        `  Schema '${CONFIG.institution.slug}' already exists — skipping.`,
      );
    } else {
      console.log(`  Creating tenant schema '${CONFIG.institution.slug}'…`);
      const templatePath = join(
        dirname(fileURLToPath(import.meta.url)),
        "../migrations/standard/002_tenant_template.sql",
      );
      const template = readFileSync(templatePath, "utf8");
      const tenantSQL = template.replaceAll(
        ":schema_name",
        CONFIG.institution.slug,
      );
      await client.query(tenantSQL);

      // Update registry
      await client.query(
        `UPDATE public.tenant_registry
         SET db_status = 'active',
             migration_version = 1,
             provisioned_at = NOW(),
             last_migrated_at = NOW()
         WHERE institution_id = $1`,
        [institutionId],
      );
    }

    // ── 5. Institution admin user ─────────────────────────────────────────────
    console.log(`Creating institution admin user '${CONFIG.admin.email}'…`);
    await client.query(`SET search_path TO ${CONFIG.institution.slug}, public`);

    const existingUser = await client.query(
      `SELECT id FROM "user" WHERE email = $1`,
      [CONFIG.admin.email],
    );

    let adminUserId;

    if (existingUser.rows.length) {
      adminUserId = existingUser.rows[0].id;
      console.log(`  User already exists — updating password.`);
      const newSalt = generateSalt();
      const newHash = hashPassword(CONFIG.admin.password, newSalt);
      await client.query(
        `UPDATE "user" SET password_hash = $1, salt = $2 WHERE id = $3`,
        [newHash, newSalt, adminUserId],
      );
    } else {
      const salt = generateSalt();
      const passwordHash = hashPassword(CONFIG.admin.password, salt);
      const userResult = await client.query(
        `INSERT INTO "user"
           (email, email_domain, first_name, last_name, password_hash, salt)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [
          CONFIG.admin.email,
          CONFIG.institution.domain,
          CONFIG.admin.firstName,
          CONFIG.admin.lastName,
          passwordHash,
          salt,
        ],
      );
      adminUserId = userResult.rows[0].id;

      // Grant institution_admin role
      await client.query(
        `INSERT INTO user_role (user_id, role, granted_at)
         VALUES ($1, 'institution_admin', NOW())`,
        [adminUserId],
      );
    }

    // ── 6. Platform audit log ─────────────────────────────────────────────────
    await client.query(`SET search_path TO public`);
    await client.query(
      `INSERT INTO public.platform_audit_log
         (admin_id, action, target_institution_id, details)
       VALUES ($1, 'dev_setup', $2, $3)`,
      [
        platformAdminId,
        institutionId,
        JSON.stringify({
          script: "dev-setup.js",
          timestamp: new Date().toISOString(),
        }),
      ],
    );

    await client.query("COMMIT");

    // ── Summary ───────────────────────────────────────────────────────────────
    console.log("\n✅ Setup complete!\n");
    console.log("─".repeat(50));
    console.log("Institution:     ", CONFIG.institution.name);
    console.log("Schema:          ", CONFIG.institution.slug);
    console.log("Plan:            ", CONFIG.institution.plan);
    console.log("─".repeat(50));
    console.log("Login email:     ", CONFIG.admin.email);
    console.log("Login password:  ", CONFIG.admin.password);
    console.log("─".repeat(50));
    console.log("Platform admin:  ", CONFIG.platformAdmin.email);
    console.log("Platform pass:   ", CONFIG.platformAdmin.password);
    console.log("─".repeat(50));
    console.log("\n⚠️  Change these passwords after first login!\n");
    console.log("Start the API:   npm run dev:api");
    console.log("Start the web:   npm run dev:web");
    console.log("API running at:  http://localhost:3001");
    console.log("Web running at:  http://localhost:5173\n");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("\n❌ Setup failed:\n", err.message);
    if (err.detail) console.error("Detail:", err.detail);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
