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

// ── Configuration ─────────────────────────────────────────────────────────────
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

// ── Environment Setup ─────────────────────────────────────────────────────────
function loadEnvironment() {
  if (!process.env.DATABASE_URL) {
    try {
      const envPath = join(
        dirname(fileURLToPath(import.meta.url)),
        "../../apps/api/.env",
      );
      const lines = readFileSync(envPath, "utf8").split("\n");
      for (const line of lines) {
        const [key, ...rest] = line.split("=");
        if (key && rest.length) {
          process.env[key.trim()] = rest.join("=").trim();
        }
      }
    } catch {
      throw new Error("DATABASE_URL not found in environment or apps/api/.env");
    }
  }
}

// ── Database Utilities ────────────────────────────────────────────────────────
class DatabaseSetup {
  constructor() {
    this.pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  }

  async connect() {
    return await this.pool.connect();
  }

  async disconnect() {
    await this.pool.end();
  }

  // Crypto helpers
  generateSalt() {
    return crypto.randomBytes(16).toString("hex");
  }

  hashPassword(password, salt) {
    return crypto
      .pbkdf2Sync(password, salt, 310_000, 32, "sha256")
      .toString("hex");
  }

  generateId() {
    return crypto.randomUUID();
  }

  // Database operations
  async createPlatformAdmin(client) {
    console.log("Creating platform admin…");
    const salt = this.generateSalt();
    const passwordHash = this.hashPassword(CONFIG.platformAdmin.password, salt);
    const id = this.generateId();

    await client.query(
      `INSERT INTO public.platform_admin
         (id, email, first_name, last_name, password_hash, salt)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (email) DO UPDATE SET
         password_hash = EXCLUDED.password_hash,
         salt = EXCLUDED.salt`,
      [
        id,
        CONFIG.platformAdmin.email,
        CONFIG.platformAdmin.firstName,
        CONFIG.platformAdmin.lastName,
        passwordHash,
        salt,
      ],
    );

    const result = await client.query(
      `SELECT id FROM public.platform_admin WHERE email = $1`,
      [CONFIG.platformAdmin.email],
    );
    return result.rows[0].id;
  }

  async getPlanId(client) {
    const result = await client.query(
      `SELECT id FROM public.plan WHERE name = $1`,
      [CONFIG.institution.plan],
    );
    if (!result.rows.length) {
      throw new Error(
        `Plan '${CONFIG.institution.plan}' not found. Did you run 001_control_plane.sql?`,
      );
    }
    return result.rows[0].id;
  }

  async provisionInstitution(client, planId) {
    console.log(`Provisioning institution '${CONFIG.institution.slug}'…`);

    const existing = await client.query(
      `SELECT id FROM public.institution WHERE slug = $1`,
      [CONFIG.institution.slug],
    );

    if (existing.rows.length) {
      console.log(
        `  Institution '${CONFIG.institution.slug}' already exists — skipping.`,
      );
      return existing.rows[0].id;
    }

    const result = await client.query(
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
    const institutionId = result.rows[0].id;

    // Tenant registry
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

    return institutionId;
  }

  async createTenantSchema(client, institutionId) {
    const schemaExists = await client.query(
      `SELECT schema_name FROM information_schema.schemata
       WHERE schema_name = $1`,
      [CONFIG.institution.slug],
    );

    if (schemaExists.rows.length) {
      console.log(
        `  Schema '${CONFIG.institution.slug}' already exists — skipping.`,
      );
      return;
    }

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

  async createInstitutionAdmin(client, platformAdminId, institutionId) {
    console.log(`Creating institution admin user '${CONFIG.admin.email}'…`);
    await client.query(`SET search_path TO ${CONFIG.institution.slug}, public`);

    const existing = await client.query(
      `SELECT id FROM "user" WHERE email = $1`,
      [CONFIG.admin.email],
    );

    let adminUserId;

    if (existing.rows.length) {
      adminUserId = existing.rows[0].id;
      console.log(`  User already exists — updating password.`);
      const salt = this.generateSalt();
      const passwordHash = this.hashPassword(CONFIG.admin.password, salt);
      await client.query(
        `UPDATE "user" SET password_hash = $1, salt = $2 WHERE id = $3`,
        [passwordHash, salt, adminUserId],
      );
    } else {
      const salt = this.generateSalt();
      const passwordHash = this.hashPassword(CONFIG.admin.password, salt);
      const result = await client.query(
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
      adminUserId = result.rows[0].id;

      // Grant role
      await client.query(
        `INSERT INTO user_role (user_id, role, granted_at)
         VALUES ($1, 'institution_admin', NOW())`,
        [adminUserId],
      );
    }

    // Audit log
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

    return adminUserId;
  }

  async run() {
    const client = await this.connect();

    try {
      await client.query("BEGIN");

      console.log("\n🚀 Clearpath — Dev Setup\n");

      // Steps
      const platformAdminId = await this.createPlatformAdmin(client);
      const planId = await this.getPlanId(client);
      const institutionId = await this.provisionInstitution(client, planId);
      await this.createTenantSchema(client, institutionId);
      await this.createInstitutionAdmin(client, platformAdminId, institutionId);

      await client.query("COMMIT");

      // Summary
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
      await this.disconnect();
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  loadEnvironment();
  const setup = new DatabaseSetup();
  await setup.run();
}

main();
