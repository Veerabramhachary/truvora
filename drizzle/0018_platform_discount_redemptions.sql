CREATE TYPE "public"."platform_discount_redemption_status" AS ENUM('pending', 'completed', 'failed', 'refunded');--> statement-breakpoint
CREATE TABLE "platform_discount_redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform_discount_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"payment_order_id" uuid,
	"status" "platform_discount_redemption_status" DEFAULT 'pending' NOT NULL,
	"amount_off" numeric(10, 2),
	"currency" text,
	"redeemed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "platform_discount_redemptions_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "platform_discount_redemptions_platform_discount_id_platform_discounts_id_fk" FOREIGN KEY ("platform_discount_id") REFERENCES "public"."platform_discounts"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "platform_discount_redemptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "platform_discount_redemptions_payment_order_id_payment_orders_id_fk" FOREIGN KEY ("payment_order_id") REFERENCES "public"."payment_orders"("id") ON DELETE set null ON UPDATE no action
);--> statement-breakpoint
CREATE INDEX "platform_discount_redemptions_campaign_idx" ON "public"."platform_discount_redemptions" USING btree ("platform_discount_id");
