ALTER TABLE "platform_discount_redemptions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "platform_discount_redemptions" CASCADE;--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_stripe_customer_id_unique";--> statement-breakpoint
ALTER TABLE "app_subscriptions" ALTER COLUMN "provider" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "plans" ALTER COLUMN "provider" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."payment_provider";--> statement-breakpoint
CREATE TYPE "public"."payment_provider" AS ENUM('paypal', 'braintree', 'none');--> statement-breakpoint
ALTER TABLE "app_subscriptions" ALTER COLUMN "provider" SET DATA TYPE "public"."payment_provider" USING "provider"::"public"."payment_provider";--> statement-breakpoint
ALTER TABLE "plans" ALTER COLUMN "provider" SET DATA TYPE "public"."payment_provider" USING "provider"::"public"."payment_provider";--> statement-breakpoint
ALTER TABLE "platform_discounts" DROP COLUMN "provider_coupon_id";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "stripe_customer_id";--> statement-breakpoint
DROP TYPE "public"."platform_discount_redemption_status";