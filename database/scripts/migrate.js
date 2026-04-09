#!/usr/bin/env node

/**
 * Migration runner — applies a specific migration to all active tenant schemas.
 * Usage:
 *   node migrate.js 5
 *   node migrate.js --all
 */

import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { runStandardMigration } from "./provisioner.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const targetVersion = parseInt(process.argv[2], 10);

if (!targetVersion || targetVersion < 1) {
  console.error("Usage: node migrate.js <version>");
  console.error("Example: node migrate.js 5");
  process.exit(1);
}

const migrationMap = {
  1: "001_control_plane.sql",
  2: "002_tenant_template.sql",
  3: "003_add_institution_config.sql",
  4: "004_professor_portal.sql",
  5: "005_add_term_to_course_dossier.sql",
  6: "006_add_file_upload_to_exam_upload.sql",
  7: "007_add_dropoff_tracking.sql",
  8: "008_add_estimated_copies.sql",
  9: "009_student_accommodations.sql",
};

const filename = migrationMap[targetVersion];
if (!filename) {
  console.error(`Migration v${targetVersion} not found`);
  process.exit(1);
}

const migrationPath = join(__dirname, "..", "migrations", "standard", filename);

console.log(`Running migration v${targetVersion}: ${filename}`);
console.log(`Path: ${migrationPath}\n`);

runStandardMigration(migrationPath, targetVersion)
  .then(() => {
    console.log(`\n✓ Migration v${targetVersion} completed`);
    process.exit(0);
  })
  .catch((err) => {
    console.error(`\n✗ Migration failed:`, err);
    process.exit(1);
  });
