CREATE TYPE "public"."ledger_type" AS ENUM('personal', 'business');--> statement-breakpoint
CREATE TABLE "ledgers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" text NOT NULL,
	"type" "ledger_type" NOT NULL,
	"name" text NOT NULL,
	"archived_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "ledger_id" uuid;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "ledger_id" uuid;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "ledger_id" uuid;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "ledger_id" uuid;--> statement-breakpoint
ALTER TABLE "ledgers" ADD CONSTRAINT "ledgers_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ledgers_owner_idx" ON "ledgers" USING btree ("owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ledgers_one_personal_per_owner" ON "ledgers" USING btree ("owner_user_id") WHERE "ledgers"."type" = 'personal';--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_ledger_id_ledgers_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."ledgers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_ledger_id_ledgers_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."ledgers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_ledger_id_ledgers_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."ledgers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_ledger_id_ledgers_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."ledgers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expenses_ledger_date_idx" ON "expenses" USING btree ("ledger_id","date");--> statement-breakpoint
CREATE INDEX "category_ledger_idx" ON "categories" USING btree ("ledger_id");--> statement-breakpoint
CREATE INDEX "subscriptions_ledger_idx" ON "subscriptions" USING btree ("ledger_id");--> statement-breakpoint
CREATE INDEX "transactions_ledger_date_idx" ON "transactions" USING btree ("ledger_id","date");