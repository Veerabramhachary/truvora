-- Idempotent on purpose. The two hand-written migrations this replaces
-- (0018_platform_discount_redemptions, 0019_payment_order_discount) were
-- applied to existing databases outside the drizzle journal, so every
-- statement here must be a no-op when the object already exists.
DO $$ BEGIN
	CREATE TYPE "public"."platform_discount_redemption_status" AS ENUM('pending', 'completed', 'failed', 'refunded');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "platform_discount_redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform_discount_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"payment_order_id" uuid,
	"status" "platform_discount_redemption_status" DEFAULT 'pending' NOT NULL,
	"amount_off" numeric(10, 2),
	"currency" text,
	"redeemed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "payment_orders" ADD COLUMN IF NOT EXISTS "discount_id" uuid;--> statement-breakpoint
ALTER TABLE "payment_orders" ADD COLUMN IF NOT EXISTS "discount_amount" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "payment_orders" ADD COLUMN IF NOT EXISTS "discount_currency" text;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "platform_discount_redemptions" ADD CONSTRAINT "platform_discount_redemptions_platform_discount_id_platform_discounts_id_fk" FOREIGN KEY ("platform_discount_id") REFERENCES "public"."platform_discounts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "platform_discount_redemptions" ADD CONSTRAINT "platform_discount_redemptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "platform_discount_redemptions" ADD CONSTRAINT "platform_discount_redemptions_payment_order_id_payment_orders_id_fk" FOREIGN KEY ("payment_order_id") REFERENCES "public"."payment_orders"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
-- The hand-written version made this a UNIQUE constraint, which Postgres backs
-- with an index of the same name, so IF NOT EXISTS skips it on those databases.
CREATE UNIQUE INDEX IF NOT EXISTS "platform_discount_redemptions_user_id_unique" ON "platform_discount_redemptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "platform_discount_redemptions_campaign_idx" ON "platform_discount_redemptions" USING btree ("platform_discount_id");--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_discount_id_platform_discounts_id_fk" FOREIGN KEY ("discount_id") REFERENCES "public"."platform_discounts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
