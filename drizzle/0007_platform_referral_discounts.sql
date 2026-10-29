CREATE TABLE "platform_discounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" text NOT NULL,
	"name" text NOT NULL,
	"discount_type" text NOT NULL,
	"discount_value" numeric(10, 2) NOT NULL,
	"currency" text,
	"duration" text DEFAULT 'once' NOT NULL,
	"duration_in_months" integer,
	"provider_coupon_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"starts_at" timestamp,
	"ends_at" timestamp,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "platform_discounts_platform_unique" UNIQUE("platform")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "referral_platform" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "platform_discount_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_platform_discount_id_platform_discounts_id_fk" FOREIGN KEY ("platform_discount_id") REFERENCES "public"."platform_discounts"("id") ON DELETE set null ON UPDATE no action;