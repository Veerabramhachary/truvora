ALTER TABLE "payment_orders" ADD COLUMN "discount_id" uuid;--> statement-breakpoint
ALTER TABLE "payment_orders" ADD COLUMN "discount_amount" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "payment_orders" ADD COLUMN "discount_currency" text;--> statement-breakpoint
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_discount_id_platform_discounts_id_fk" FOREIGN KEY ("discount_id") REFERENCES "public"."platform_discounts"("id") ON DELETE set null ON UPDATE no action;
