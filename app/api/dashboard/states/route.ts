import { db } from "@/db";
import { transactions } from "@/db/schema";
import { auth } from "@clerk/nextjs/server";
import { count } from "console";
import { eq, sum } from "drizzle-orm";
import { NextResponse } from "next/server";

export const GET = async () => {
    const userId = await auth();
    try {
        const [expenseRes, subRes, activeRes] = await Promise.all([
            db.select({ total: sum(transactions.amount)})
                .from(transactions)
                .where(eq(transactions.type, "expense")),

            db.select({ total: sum(transactions.amount)})
                .from(transactions)
                .where(eq(transactions.type, "subscription")),
            
            db.select({ count: count(transactions.id)})
                .from(transactions)
                .where(eq(transactions.status, "active"))
        ])

        const expenseTotal =Number(expenseRes[0]?.total ?? 0);
        const subscriptionTotal =Number(subRes[0]?.total ?? 0);
        const activeCount =Number(activeRes[0]?.count ?? 0);

        const totalSpend =expenseTotal + subscriptionTotal;

        return NextResponse.json({
            totalSpend,
            expenseTotal,
            subscriptionTotal,
            activeSubcriptions:activeCount,
        })
    } catch (error: unknown) {
        console.log("Aggregation Error:", error);
        return NextResponse.json({error: "Internal Server Error"}, { status: 500});
    }
};
