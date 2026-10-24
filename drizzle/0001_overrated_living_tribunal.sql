CREATE TABLE "reminder_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"renewal_date" timestamp NOT NULL,
	"days_before" integer NOT NULL,
	"status" text DEFAULT 'sending' NOT NULL,
	"claimed_at" timestamp DEFAULT now() NOT NULL,
	"sent_at" timestamp,
	CONSTRAINT "reminder_deliveries_subscription_id_renewal_date_days_before_unique" UNIQUE("subscription_id","renewal_date","days_before")
);
--> statement-breakpoint
ALTER TABLE "payment_transactions" DROP CONSTRAINT "payment_transactions_invoice_id_payment_invoices_id_fk";
--> statement-breakpoint
ALTER TABLE "payment_invoices" ALTER COLUMN "provider_invoice_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "expense_id" uuid;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_expense_id_unique" UNIQUE("expense_id");