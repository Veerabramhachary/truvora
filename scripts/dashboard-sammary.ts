import { db } from "@/db";
import { transactions } from "@/db/schema";
import { eq, sum } from "drizzle-orm";

export async function main() {
    const expenseTotal = await db.select({
        total: sum(transactions.amount),
    })
    .from(transactions)
    .where(eq(transactions.type, "expense"));

    const subscriptionTotal = await db.select({
        total: sum(transactions.amount),
    })
    .from(transactions)
    .where(eq(transactions.type, "subscription"))

    console.log("💸 Expenses:", expenseTotal[0].total);
    console.log("📺 Subscriptions:", subscriptionTotal[0].total);

    const total = Number(expenseTotal[0].total ?? 0) + Number(subscriptionTotal[0].total ?? 0);
    
    console.log("total-spend", total);
    
}

main().catch(console.error);
