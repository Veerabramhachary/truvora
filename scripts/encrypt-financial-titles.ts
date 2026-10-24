import { sql } from "drizzle-orm";
import { db } from "@/db";
import { encrypt, isEncryptedData } from "@/db/utils/encryption";

/** One-time, rerunnable deployment step for plaintext values written before
 * these columns were changed to encrypted custom types. */
async function encryptColumn(table: "expenses" | "transactions" | "subscriptions", column: "title" | "name") {
    const rows = await db.execute(sql.raw(`SELECT id, ${column} AS value FROM ${table} WHERE ${column} IS NOT NULL`));
    let changed = 0;
    for (const row of rows.rows) {
        const value = row.value;
        if (typeof value !== "string" || isEncryptedData(value)) continue;
        await db.execute(sql`UPDATE ${sql.identifier(table)} SET ${sql.identifier(column)} = ${encrypt(value)} WHERE id = ${row.id}`);
        changed++;
    }
    console.info(`Encrypted ${changed} legacy ${table}.${column} values`);
}

await encryptColumn("expenses", "title");
await encryptColumn("transactions", "title");
await encryptColumn("subscriptions", "name");
