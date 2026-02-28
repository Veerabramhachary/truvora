CREATE TYPE "public"."transaction_type" AS ENUM('expense', 'subscription');--> statement-breakpoint
CREATE TYPE "public"."transaction_status" AS ENUM('active', 'cancel', 'de-active');--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"icon" text,
	"color" text,
	"user_id" text
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"type" "transaction_type" NOT NULL,
	"title" text NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"status" "transaction_status",
	"created_at" timestamp DEFAULT now() NOT NULL,
	"category_id" uuid NOT NULL,
	CONSTRAINT "status_type_check" CHECK (CASE
                    WHEN "transactions"."type" = 'expense' THEN "transactions"."status" IS NULL
                    ELSE TRUE
                END)
);
--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "category_user_idx" ON "categories" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "trans_user_idx" ON "transactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "trans_created_idx" ON "transactions" USING btree ("created_at");