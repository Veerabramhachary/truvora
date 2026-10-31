// Mark already-applied migrations in drizzle.__drizzle_migrations so that
// `npm run db:migrate` applies only the ones that are actually pending.
//
// Why this exists: a database reconciled with `db:push` (see
// `drizzle/README.md`) has an EMPTY journal — push writes no rows there. The
// next `db:migrate` then replays `0000_baseline` on top of live tables, dies
// on `relation "users" already exists`, and rolls the whole run back, so
// nothing is applied and nothing is damaged. This inserts one truthful row per
// migration the database already reflects (hash = sha256(file), created_at =
// the journal's `when`, exactly as drizzle-orm's `readMigrationFiles`
// computes them), leaving every newer migration pending.
//
// It only ever writes to drizzle.__drizzle_migrations: schema untouched.
//
// Usage:
//   npm run db:journal-backfill -- --up-to <tag> [--dry-run]
//   node scripts/backfill-migration-journal.mjs --up-to <tag> [--dry-run]
//
//   --up-to is REQUIRED: it names the LAST migration whose effects are already
//   in the database. Anything after it stays pending. Naming the newest entry
//   would mark an unapplied migration as done and `db:migrate` would silently
//   apply nothing — so the script refuses to do that.
import { neon } from "@neondatabase/serverless";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const dry = process.argv.includes("--dry-run");
const upToIdx = process.argv.indexOf("--up-to");
const upTo = upToIdx === -1 ? null : process.argv[upToIdx + 1];

let url = process.env.DATABASE_URL;
if (!url) {
  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = /^DATABASE_URL=(.*)$/.exec(line.trim());
    if (m) url = m[1].trim().replace(/^["']|["']$/g, "").trim();
  }
}
if (!url) {
  console.error("DATABASE_URL not set");
  process.exit(2);
}

const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
if (!upTo) {
  console.error("REFUSING: --up-to <tag> is required. Journal tags:");
  for (const e of journal.entries) console.error("  " + e.tag);
  process.exit(2);
}
const cutIdx = journal.entries.findIndex((e) => e.tag === upTo);
if (cutIdx === -1) {
  console.error(`REFUSING: --up-to '${upTo}' not found in journal. Tags:`);
  for (const e of journal.entries) console.error("  " + e.tag);
  process.exit(2);
}
if (cutIdx === journal.entries.length - 1) {
  console.error(
    "REFUSING: --up-to is the LAST journal entry; backfilling it would make `db:migrate` apply nothing.",
  );
  process.exit(2);
}
const entries = journal.entries.slice(0, cutIdx + 1).map((e) => ({
  tag: e.tag,
  when: e.when,
  hash: createHash("sha256").update(readFileSync(`drizzle/${e.tag}.sql`, "utf8")).digest("hex"),
}));
const pending = journal.entries.slice(cutIdx + 1).map((e) => e.tag);
if (entries.length === 0) {
  console.error("REFUSING: journal has no entries");
  process.exit(1);
}

const sql = neon(url);
const rowsOf = (r) => (Array.isArray(r) ? r : r.rows ?? []);

try {
  const existing = rowsOf(
    await sql.query("SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations"),
  )[0].n;

  if (existing === entries.length) {
    console.log(`already backfilled: ${existing} journal rows present, nothing to do`);
    process.exit(0);
  }
  if (existing !== 0) {
    console.error(
      `REFUSING: journal has ${existing} rows, expected 0 or ${entries.length} — inspect manually`,
    );
    process.exit(1);
  }

  const values = entries
    .map((e) => `('${e.hash}', ${e.when})`)
    .join(",\n       ");
  const insert = `INSERT INTO drizzle.__drizzle_migrations (hash, created_at)\n       VALUES ${values}`;

  console.log(`journal rows to insert: ${entries.length} (${entries[0].tag} .. ${entries[entries.length - 1].tag})`);
  console.log(`left PENDING for db:migrate: ${pending.join(", ")}`);
  for (const e of entries) console.log(`  ${e.tag}  when=${e.when}  sha256=${e.hash.slice(0, 16)}…`);

  if (dry) {
    console.log("\n[dry-run] SQL not executed:\n" + insert);
    process.exit(0);
  }

  await sql.query(insert);
  const after = rowsOf(
    await sql.query("SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations"),
  )[0].n;
  console.log(`\ninserted. journal now has ${after} rows (expected ${entries.length})`);
  if (after !== entries.length) process.exit(1);
} catch (err) {
  const msg = String(err?.message ?? err).replace(
    /postgres(?:ql)?:\/\/[^\s'"]+/gi,
    "postgresql://***",
  );
  console.error("FAILED:", msg);
  process.exit(1);
}
