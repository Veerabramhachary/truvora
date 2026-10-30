CREATE TABLE "account_deletions" (
	"clerk_user_id" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"status_token_hash" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_retry_at" timestamp DEFAULT now() NOT NULL,
	"last_error" text,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"clerk_deleted_at" timestamp,
	"data_deleted_at" timestamp,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE INDEX "account_deletions_retry_idx" ON "account_deletions" USING btree ("status","next_retry_at");--> statement-breakpoint
CREATE UNIQUE INDEX "account_deletions_status_token_hash_unique" ON "account_deletions" USING btree ("status_token_hash");