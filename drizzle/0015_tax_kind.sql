DO $$ BEGIN
 CREATE TYPE "public"."tax_kind" AS ENUM('deductible', 'tax_paid', 'taxable_income', 'tax_refund');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "tax_kind" "tax_kind";--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "tax_kind" "tax_kind";--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "tax_kind" "tax_kind";
