// TEMP read-only runner (no psql on this machine). Delete after the check.
// Usage: node .tmp-run-sql.mjs <path-to-sql-file>   (DATABASE_URL from env/.env)
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error("usage: node .tmp-run-sql.mjs <sql-file>");
  process.exit(2);
}

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
try {
  const rows = await sql.query(readFileSync(file, "utf8"));
  console.table(Array.isArray(rows) ? rows : rows.rows);
} catch (err) {
  const msg = String(err?.message ?? err).replace(
    /postgres(?:ql)?:\/\/[^\s'"]+/gi,
    "postgresql://***",
  );
  console.error("QUERY FAILED:", msg);
  process.exit(1);
}
