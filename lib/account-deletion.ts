import { clerkClient } from "@clerk/nextjs/server";
import { and, eq, inArray, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { accountDeletions } from "@/db/schema/account-deletions";
import { paymentInvoices } from "@/db/schema/appInvoices";
import { paymentTransactions } from "@/db/schema/appTransactions";
import { expenses } from "@/db/schema/expenses";
import { featureUsage } from "@/db/schema/feature-usage";
import { app_subscriptions } from "@/db/schema/plans";
import { reminderDeliveries } from "@/db/schema/reminder-deliveries";
import { categories, subscriptions, transactions } from "@/db/schema/schema";
import { users } from "@/db/schema/users";

const RETRY_BASE_MS = 60_000;
const RETRY_MAX_MS = 24 * 60 * 60_000;

export async function queueAccountDeletion(
    clerkUserId: string,
    statusTokenHash: string,
) {
    const now = new Date();
    await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${clerkUserId}))`);
        await tx
            .insert(accountDeletions)
            .values({
                clerkUserId,
                status: "pending",
                statusTokenHash,
                attemptCount: 0,
                nextRetryAt: now,
                lastError: null,
                requestedAt: now,
                clerkDeletedAt: null,
                dataDeletedAt: null,
                completedAt: null,
            })
            .onConflictDoUpdate({
                target: accountDeletions.clerkUserId,
                set: {
                    status: "pending",
                    statusTokenHash,
                    attemptCount: 0,
                    nextRetryAt: now,
                    lastError: null,
                    requestedAt: now,
                    clerkDeletedAt: null,
                    dataDeletedAt: null,
                    completedAt: null,
                },
            });
    });
}

async function cleanupUserData(clerkUserId: string) {
    const { billingIds, subscriptionIds, expenseIds } = await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${clerkUserId}))`);
        const billingSubscriptions = await tx
            .select({ id: app_subscriptions.id })
            .from(app_subscriptions)
            .where(eq(app_subscriptions.userId, clerkUserId));
        const billingIds = billingSubscriptions.map((row) => row.id);
        if (billingIds.length) {
            // Retain aggregate billing facts, but sever customer, provider, and
            // invoice references and remove invoice details.
            await tx
                .update(paymentTransactions)
                .set({
                    subscriptionsId: null,
                    invoiceId: null,
                    idempotencyKey: null,
                    providerTransactionId: null,
                    metadata: null,
                    errorMessage: null,
                })
                .where(inArray(paymentTransactions.subscriptionsId, billingIds));
            await tx
                .update(paymentInvoices)
                .set({
                    subscriptionId: null,
                    providerInvoiceId: null,
                    invoiceNumber: null,
                    lines: null,
                    metadata: null,
                })
                .where(inArray(paymentInvoices.subscriptionId, billingIds));
        }

        const userSubscriptions = await tx
            .select({ id: subscriptions.id })
            .from(subscriptions)
            .where(eq(subscriptions.userId, clerkUserId));
        const subscriptionIds = userSubscriptions.map((row) => row.id);
        const userExpenses = await tx
            .select({ id: expenses.id })
            .from(expenses)
            .where(eq(expenses.userId, clerkUserId));
        const expenseIds = userExpenses.map((row) => row.id);

        const transactionFilters = [eq(transactions.userId, clerkUserId)];
        if (expenseIds.length) {
            transactionFilters.push(inArray(transactions.expenseId, expenseIds));
        }
        if (subscriptionIds.length) {
            transactionFilters.push(inArray(transactions.subscriptionId, subscriptionIds));
        }
        await tx.delete(transactions).where(or(...transactionFilters));

        if (subscriptionIds.length) {
            await tx
                .delete(reminderDeliveries)
                .where(inArray(reminderDeliveries.subscriptionId, subscriptionIds));
        }
        await tx.delete(expenses).where(eq(expenses.userId, clerkUserId));
        await tx.delete(subscriptions).where(eq(subscriptions.userId, clerkUserId));
        await tx.delete(featureUsage).where(eq(featureUsage.userId, clerkUserId));
        await tx.delete(categories).where(eq(categories.userId, clerkUserId));
        await tx.delete(app_subscriptions).where(eq(app_subscriptions.userId, clerkUserId));
        await tx.delete(users).where(eq(users.id, clerkUserId));
        return { billingIds, subscriptionIds, expenseIds };
    });

    const remaining = await Promise.all([
        db.select({ id: users.id }).from(users).where(eq(users.id, clerkUserId)).limit(1),
        db.select({ id: expenses.id }).from(expenses).where(eq(expenses.userId, clerkUserId)).limit(1),
        db.select({ id: subscriptions.id }).from(subscriptions).where(eq(subscriptions.userId, clerkUserId)).limit(1),
        db.select({ id: featureUsage.id }).from(featureUsage).where(eq(featureUsage.userId, clerkUserId)).limit(1),
        db.select({ id: categories.id }).from(categories).where(eq(categories.userId, clerkUserId)).limit(1),
        db.select({ id: app_subscriptions.id }).from(app_subscriptions).where(eq(app_subscriptions.userId, clerkUserId)).limit(1),
        db.select({ id: transactions.id }).from(transactions).where(
            or(
                eq(transactions.userId, clerkUserId),
                ...(expenseIds.length ? [inArray(transactions.expenseId, expenseIds)] : []),
                ...(subscriptionIds.length ? [inArray(transactions.subscriptionId, subscriptionIds)] : []),
            ),
        ).limit(1),
        ...(subscriptionIds.length
            ? [db.select({ id: reminderDeliveries.id }).from(reminderDeliveries).where(inArray(reminderDeliveries.subscriptionId, subscriptionIds)).limit(1)]
            : []),
        ...(billingIds.length
            ? [
                db.select({ id: paymentTransactions.id }).from(paymentTransactions).where(inArray(paymentTransactions.subscriptionsId, billingIds)).limit(1),
                db.select({ id: paymentInvoices.id }).from(paymentInvoices).where(inArray(paymentInvoices.subscriptionId, billingIds)).limit(1),
            ]
            : []),
    ]);

    if (remaining.some((rows) => rows.length > 0)) {
        throw new Error("Account data cleanup verification failed");
    }
}

async function markClerkIdentityDeleted(clerkUserId: string) {
    const now = new Date();
    await db
        .insert(accountDeletions)
        .values({
            clerkUserId,
            status: "pending",
            clerkDeletedAt: now,
            nextRetryAt: now,
        })
        .onConflictDoUpdate({
            target: accountDeletions.clerkUserId,
            set: { clerkDeletedAt: now },
        });
}

function isClerkUserMissing(error: unknown): boolean {
    return typeof error === "object" && error !== null && "status" in error && error.status === 404;
}

async function scheduleRetry(clerkUserId: string, lastError: string) {
    const [deletion] = await db
        .select({ attemptCount: accountDeletions.attemptCount })
        .from(accountDeletions)
        .where(eq(accountDeletions.clerkUserId, clerkUserId))
        .limit(1);
    const delay = Math.min(
        RETRY_BASE_MS * 2 ** Math.min(deletion?.attemptCount ?? 0, 10),
        RETRY_MAX_MS,
    );
    await db
        .update(accountDeletions)
        .set({
            status: "pending",
            attemptCount: sql`${accountDeletions.attemptCount} + 1`,
            nextRetryAt: new Date(Date.now() + delay),
            lastError,
        })
        .where(
            and(
                eq(accountDeletions.clerkUserId, clerkUserId),
                eq(accountDeletions.status, "pending"),
            ),
        );
}

export async function processAccountDeletion(clerkUserId: string) {
    const [deletion] = await db
        .select()
        .from(accountDeletions)
        .where(eq(accountDeletions.clerkUserId, clerkUserId))
        .limit(1);
    if (!deletion || deletion.status === "completed") return "completed" as const;

    let failure: string | null = null;
    if (!deletion.clerkDeletedAt) {
        try {
            const client = await clerkClient();
            await client.users.deleteUser(clerkUserId);
            await markClerkIdentityDeleted(clerkUserId);
        } catch (error) {
            if (isClerkUserMissing(error)) {
                await markClerkIdentityDeleted(clerkUserId);
            } else {
                console.error("Clerk identity deletion attempt failed:", error);
                failure = "Clerk identity deletion failed";
            }
        }
    }

    if (!deletion.dataDeletedAt || !deletion.clerkDeletedAt) {
        try {
            await cleanupUserData(clerkUserId);
            await db
                .update(accountDeletions)
                .set({ dataDeletedAt: new Date() })
                .where(eq(accountDeletions.clerkUserId, clerkUserId));
        } catch (error) {
            console.error("Account data cleanup attempt failed:", error);
            failure = "Account data cleanup failed";
        }
    }

    const [current] = await db
        .select({
            clerkDeletedAt: accountDeletions.clerkDeletedAt,
            dataDeletedAt: accountDeletions.dataDeletedAt,
        })
        .from(accountDeletions)
        .where(eq(accountDeletions.clerkUserId, clerkUserId))
        .limit(1);

    if (current?.clerkDeletedAt && current.dataDeletedAt) {
        await db
            .update(accountDeletions)
            .set({
                status: "completed",
                completedAt: new Date(),
                nextRetryAt: new Date(),
                lastError: null,
            })
            .where(
                and(
                    eq(accountDeletions.clerkUserId, clerkUserId),
                    eq(accountDeletions.status, "pending"),
                ),
            );
        return "completed" as const;
    }

    await scheduleRetry(clerkUserId, failure ?? "Account deletion is incomplete");
    return "pending" as const;
}

export async function markWebhookDeletion(clerkUserId: string) {
    await markClerkIdentityDeleted(clerkUserId);
    await cleanupUserData(clerkUserId);
    await db
        .update(accountDeletions)
        .set({ dataDeletedAt: new Date() })
        .where(eq(accountDeletions.clerkUserId, clerkUserId));

    const now = new Date();
    await db
        .update(accountDeletions)
        .set({
            status: "completed",
            completedAt: now,
            nextRetryAt: now,
            lastError: null,
        })
        .where(
            and(
                eq(accountDeletions.clerkUserId, clerkUserId),
                eq(accountDeletions.status, "pending"),
            ),
        );
}

export async function findDueAccountDeletions(now = new Date(), limit = 50) {
    return db
        .select({ clerkUserId: accountDeletions.clerkUserId })
        .from(accountDeletions)
        .where(
            and(
                eq(accountDeletions.status, "pending"),
                lte(accountDeletions.nextRetryAt, now),
            ),
        )
        .limit(limit);
}
