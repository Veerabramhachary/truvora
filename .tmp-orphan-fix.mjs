// TEMP ledger-rollout orphan fix (step 1 gate). Delete after the rollout.
// Modes:
//   node .tmp-orphan-fix.mjs backup          read-only: dump the 5 orphan rows to JSON
//   node .tmp-orphan-fix.mjs delete          guarded DELETE of exactly those IDs
import { neon } from "@neondatabase/serverless";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const mode = process.argv[2];
const BACKUP = "orphan-backup-transactions.json";

// The 5 rows identified by 00_orphan_check.sql + .tmp-orphan-detail.sql
const ORPHAN_IDS = [
  "400f85c0-919d-4235-9515-ad31927f1ce8",
  "375402b6-6b20-4e71-8c5c-d43b62c1d41c",
  "d5074186-af14-4d8c-af09-d7b88ec425f9",
  "cf7878a1-058d-4c8b-be67-06ad7aaa11c7",
  "491a335c-ef96-46ab-a89f-f94391808f90",
];

let url = process.env.DATABASE_URL;
if (!url) {
  try {
    for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
      const m = /^DATABASE_URL=(.*)$/.exec(line.trim());
      if (m) url = m[1].trim().replace(/^["']|["']$/g, "").trim();
    }
  } catch {
    /* no .env */
  }
}
if (!url) {
  console.error("DATABASE_URL not set");
  process.exit(2);
}

const sql = neon(url);
const run = async (text) => {
  const rows = await sql.query(text);
  return Array.isArray(rows) ? rows : rows.rows;
};
const ids = ORPHAN_IDS.map((i) => `'${i}'`).join(", ");

try {
  if (mode === "backup") {
    const rows = await run(
      `SELECT * FROM transactions WHERE id IN (${ids})`,
    );
    if (rows.length !== ORPHAN_IDS.length) {
      console.error(`REFUSING: expected ${ORPHAN_IDS.length} rows to back up, found ${rows.length}`);
      process.exit(1);
    }
    const stillOrphaned = await run(
      `SELECT count(*)::int AS n FROM transactions t
        WHERE t.id IN (${ids})
          AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = t.user_id)`,
    );
    if (stillOrphaned[0].n !== ORPHAN_IDS.length) {
      console.error(`REFUSING: only ${stillOrphaned[0].n}/${ORPHAN_IDS.length} are still ownerless`);
      process.exit(1);
    }
    const payload = {
      backedUpAt: new Date().toISOString(),
      source: "drizzle/ledger-rollout/00_orphan_check.sql (transactions orphans)",
      table: "transactions",
      rowCount: rows.length,
      rows,
    };
    writeFileSync(BACKUP, JSON.stringify(payload, null, 2));
    console.log(`backed up ${rows.length} rows -> ${BACKUP}`);
    console.table(rows.map((r) => ({ id: r.id, user_id: r.user_id, type: r.type, amount: r.amount, date: r.date })));
  } else if (mode === "delete") {
    if (!existsSync(BACKUP)) {
      console.error(`REFUSING: ${BACKUP} not found — run the backup mode first`);
      process.exit(1);
    }
    const deleted = await run(
      `DELETE FROM transactions
        WHERE id IN (${ids})
          AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = transactions.user_id)
        RETURNING id, user_id`,
    );
    console.log(`deleted ${deleted.length} of ${ORPHAN_IDS.length}`);
    console.table(deleted);
    if (deleted.length !== ORPHAN_IDS.length) {
      console.error("REFUSED/PARTIAL: count mismatch — inspect before re-running 00");
      process.exit(1);
    }
  } else {
    console.error("usage: node .tmp-orphan-fix.mjs backup|delete");
    process.exit(2);
  }
} catch (err) {
  const msg = String(err?.message ?? err).replace(
    /postgres(?:ql)?:\/\/[^\s'"]+/gi,
    "postgresql://***",
  );
  console.error("FAILED:", msg);
  process.exit(1);
}
