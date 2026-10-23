CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'open', 'paid', 'unpaid', 'void');--> statement-breakpoint
CREATE TYPE "public"."transaction_status" AS ENUM('pending', 'succeeded', 'failed', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."payment_transaction_type" AS ENUM('payment', 'refund', 'adjustment', 'chargeback');--> statement-breakpoint
CREATE TYPE "public"."expense_type" AS ENUM('income', 'expense');--> statement-breakpoint
CREATE TYPE "public"."app_subscriptions_status" AS ENUM('active', 'canceled', 'incomplete', 'incomplete_expired', 'past_due', 'trialing', 'unpaid');--> statement-breakpoint
CREATE TYPE "public"."plan_interval" AS ENUM('month', 'year');--> statement-breakpoint
CREATE TYPE "public"."payment_provider" AS ENUM('stripe', 'paypal', 'braintree', 'none');--> statement-breakpoint
CREATE TYPE "public"."trasaction_action" AS ENUM('created', 'updated', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."transaction_type" AS ENUM('expense', 'income', 'subscription');--> statement-breakpoint
CREATE TABLE "payment_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid,
	"provider_invoice_id" text NOT NULL,
	"invoice_number" text NOT NULL,
	"amount_due" numeric(10, 2) NOT NULL,
	"amount_paid" numeric(10, 2) DEFAULT '0',
	"currency" text NOT NULL,
	"status" "invoice_status" DEFAULT 'draft',
	"due_date" timestamp,
	"paid_at" timestamp,
	"lines" text,
	"metadata" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "payment_invoices_provider_invoice_id_unique" UNIQUE("provider_invoice_id"),
	CONSTRAINT "payment_invoices_invoice_number_unique" UNIQUE("invoice_number")
);
--> statement-breakpoint
CREATE TABLE "payment_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscriptions_id" uuid,
	"invoice_id" uuid,
	"type" "payment_transaction_type" NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"currency" text NOT NULL,
	"status" "transaction_status" DEFAULT 'pending',
	"payment_method" text,
	"idemptency_key" text,
	"provider_transaction_id" text,
	"error_message" text,
	"metadata" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "payment_transactions_idemptency_key_unique" UNIQUE("idemptency_key")
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"note" text,
	"amount" numeric(10, 2) NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"date" timestamp NOT NULL,
	"type" "expense_type" NOT NULL,
	"category_id" uuid,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "feature_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"feature" text NOT NULL,
	"period" text NOT NULL,
	"count" integer DEFAULT 0,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "feature_usage_user_id_feature_period_unique" UNIQUE("user_id","feature","period")
);
--> statement-breakpoint
CREATE TABLE "app_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"plan_id" uuid,
	"plan_snapshot" jsonb,
	"status" "app_subscriptions_status" DEFAULT 'incomplete' NOT NULL,
	"current_period_start" timestamp NOT NULL,
	"current_period_end" timestamp NOT NULL,
	"cancel_at_period_end" boolean DEFAULT false,
	"canceled_at" timestamp,
	"trial_start" timestamp,
	"trial_end" timestamp,
	"payment_method_id" uuid,
	"provider" "payment_provider" NOT NULL,
	"provider_subscription_id" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "app_subscriptions_provider_subscription_id_unique" UNIQUE("provider_subscription_id")
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price" numeric(10, 2) NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"plan_interval" "plan_interval" NOT NULL,
	"interval_count" integer DEFAULT 1 NOT NULL,
	"trial_days" integer DEFAULT 0,
	"features" jsonb,
	"feature_limits" jsonb,
	"is_active" boolean DEFAULT true,
	"provider" "payment_provider" NOT NULL,
	"provider_plan_id" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"icon" text,
	"color" text,
	"user_id" text,
	"parent_name" text,
	CONSTRAINT "categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"category_id" uuid,
	"name" text NOT NULL,
	"note" text,
	"price" numeric(10, 2) NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"interval" text NOT NULL,
	"interval_count" integer DEFAULT 1 NOT NULL,
	"start_date" timestamp NOT NULL,
	"end_date" timestamp NOT NULL,
	"deactivated_at" timestamp,
	"next_date" timestamp NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"title" text DEFAULT 'untitled' NOT NULL,
	"category_id" uuid,
	"amount" numeric(10, 2) NOT NULL,
	"date" timestamp NOT NULL,
	"description" text,
	"type" "transaction_type" NOT NULL,
	"subscription_id" uuid,
	"action" "trasaction_action" NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"first_name" text,
	"image_url" text,
	"stripe_customer_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_stripe_customer_id_unique" UNIQUE("stripe_customer_id")
);
--> statement-breakpoint
ALTER TABLE "payment_invoices" ADD CONSTRAINT "payment_invoices_subscription_id_app_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."app_subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_subscriptions_id_app_subscriptions_id_fk" FOREIGN KEY ("subscriptions_id") REFERENCES "public"."app_subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_invoice_id_payment_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."payment_invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_usage" ADD CONSTRAINT "feature_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_subscriptions" ADD CONSTRAINT "app_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_subscriptions" ADD CONSTRAINT "app_subscriptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "category_parent_fk" FOREIGN KEY ("parent_name") REFERENCES "public"."categories"("name") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "category_user_idx" ON "categories" USING btree ("user_id");