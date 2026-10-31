ALTER TABLE "expenses" ALTER COLUMN "ledger_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "ledger_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "ledger_id" SET NOT NULL;