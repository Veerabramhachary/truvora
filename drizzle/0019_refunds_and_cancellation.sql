CREATE TYPE "public"."payment_refund_kind" AS ENUM('full_window', 'prorated', 'external');--> statement-breakpoint
CREATE TYPE "public"."payment_refund_requested_by" AS ENUM('user', 'ops', 'provider');--> statement-breakpoint
CREATE TYPE "public"."payment_refund_status" AS ENUM('requested', 'pending', 'processed', 'failed');--> statement-breakpoint
CREATE TABLE "payment_refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_order_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"app_subscription_id" uuid,
	"kind" "payment_refund_kind" NOT NULL,
	"status" "payment_refund_status" DEFAULT 'requested' NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"currency" text NOT NULL,
	"provider_refund_id" text,
	"speed_requested" text DEFAULT 'normal' NOT NULL,
	"calc" jsonb,
	"error_code" text,
	"requested_by" "payment_refund_requested_by" NOT NULL,
	"processed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payment_refunds_provider_refund_id_unique" UNIQUE("provider_refund_id"),
	CONSTRAINT "payment_refunds_amount_positive" CHECK ("payment_refunds"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "payment_orders" ADD COLUMN "amount_refunded" numeric(10, 2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_orders" ADD COLUMN "period_start" timestamp;--> statement-breakpoint
ALTER TABLE "payment_orders" ADD COLUMN "period_end" timestamp;--> statement-breakpoint
ALTER TABLE "app_subscriptions" ADD COLUMN "current_payment_order_id" uuid;--> statement-breakpoint
ALTER TABLE "app_subscriptions" ADD COLUMN "cancel_reason" text;--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_payment_order_id_payment_orders_id_fk" FOREIGN KEY ("payment_order_id") REFERENCES "public"."payment_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_app_subscription_id_app_subscriptions_id_fk" FOREIGN KEY ("app_subscription_id") REFERENCES "public"."app_subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_refunds_order_active_unique" ON "payment_refunds" USING btree ("payment_order_id") WHERE "payment_refunds"."status" IN ('requested', 'pending', 'processed') AND "payment_refunds"."kind" <> 'external';--> statement-breakpoint
ALTER TABLE "app_subscriptions" ADD CONSTRAINT "app_subscriptions_current_payment_order_id_payment_orders_id_fk" FOREIGN KEY ("current_payment_order_id") REFERENCES "public"."payment_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_amount_refunded_range" CHECK ("payment_orders"."amount_refunded" >= 0 AND "payment_orders"."amount_refunded" <= "payment_orders"."amount_paid");