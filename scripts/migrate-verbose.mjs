// Same migrator drizzle-kit runs, but it PRINTS the database's error.
//
// Why: `drizzle-kit migrate` with the Neon driver can exit with code 1 and show
// nothing except the driver warning (see drizzle/README.md), so you cannot tell
// why a migration failed. This applies pending migrations from ./drizzle in the
// same single transaction and, on failure, prints the Postgres message, code,
// detail and hint. Connection strings are redacted.
//
//   npm run db:migrate:verbose
import nextEnv from "@next/env";
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { migrate } from "drizzle-orm/neon-serverless/migrator";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const redact = (value) =>
  String(value ?? "").replace(/postgres(?:ql)?:\/\/[^\s'"]+/gi, "postgresql://***");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL not set (looked in .env.local and .env)");
  process.exit(2);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  let before = 0;
  try {
    const [{ before: count }] = (await pool.query(
      "SELECT count(*)::int AS before FROM drizzle.__drizzle_migrations",
    )).rows;
    before = count;
  } catch (error) {
    if (error?.code !== "42P01" && error?.code !== "3F000") throw error;
  }
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  const [{ after }] = (await pool.query(
    "SELECT count(*)::int AS after FROM drizzle.__drizzle_migrations",
  )).rows;
  console.log(`migrations applied: journal rows ${before} -> ${after}`);
} catch (error) {
  console.error("MIGRATION FAILED (nothing was applied; it runs in one transaction)");
  console.error("  message:", redact(error?.message));
  for (const key of ["code", "detail", "hint", "schema", "table", "constraint", "where", "position"]) {
    if (error?.[key]) console.error(`  ${key}:`, redact(error[key]));
  }
  if (error?.cause) console.error("  cause:", redact(error.cause?.message ?? error.cause));
  process.exitCode = 1;
} finally {
  await pool.end();
}
