CREATE TYPE "public"."payment_order_status" AS ENUM('created', 'attempted', 'paid', 'failed', 'canceled', 'expired');--> statement-breakpoint
ALTER TYPE "public"."payment_provider" ADD VALUE 'razorpay' BEFORE 'none';--> statement-breakpoint
CREATE TABLE "payment_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"plan_id" uuid NOT NULL,
	"provider" "payment_provider" NOT NULL,
	"provider_order_id" text NOT NULL,
	"provider_payment_id" text,
	"receipt" text NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"amount_paid" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"status" "payment_order_status" DEFAULT 'created' NOT NULL,
	"notes" jsonb,
	"failure_reason" text,
	"paid_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payment_orders_provider_order_id_unique" UNIQUE("provider_order_id"),
	CONSTRAINT "payment_orders_provider_payment_id_unique" UNIQUE("provider_payment_id"),
	CONSTRAINT "payment_orders_receipt_unique" UNIQUE("receipt")
);
--> statement-breakpoint
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;