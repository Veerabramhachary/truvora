CREATE TYPE "public"."custom_category_type" AS ENUM('expense', 'subscription');--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "category_type" "custom_category_type";--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "display_name" text;--> statement-breakpoint
CREATE UNIQUE INDEX "categories_custom_owner_name_unique" ON "categories" USING btree ("user_id","category_type",lower("display_name")) WHERE "categories"."user_id" IS NOT NULL AND "categories"."category_type" IS NOT NULL AND "categories"."display_name" IS NOT NULL;