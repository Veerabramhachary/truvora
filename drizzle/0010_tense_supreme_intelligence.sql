CREATE TYPE "public"."platform_discount_redemption_status" AS ENUM('reserved', 'redeemed', 'released');--> statement-breakpoint
CREATE TABLE "platform_discount_redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"checkout_session_id" text,
	"status" "platform_discount_redemption_status" DEFAULT 'reserved' NOT NULL,
	"reserved_at" timestamp DEFAULT now() NOT NULL,
	"redeemed_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "platform_discount_redemptions_checkout_session_id_unique" UNIQUE("checkout_session_id")
);
--> statement-breakpoint
ALTER TABLE "platform_discounts" ADD COLUMN "max_redemptions" integer DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_discount_redemptions" ADD CONSTRAINT "platform_discount_redemptions_campaign_id_platform_discounts_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."platform_discounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_discount_redemptions" ADD CONSTRAINT "platform_discount_redemptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "platform_discount_redemptions_campaign_user_unique" ON "platform_discount_redemptions" USING btree ("campaign_id","user_id");