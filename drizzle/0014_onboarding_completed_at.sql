ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "onboarding_completed_at" timestamp;--> statement-breakpoint
-- Everyone who already has an account is treated as onboarded, so only
-- accounts created AFTER this migration are sent through the sign-up wizard.
UPDATE "users" SET "onboarding_completed_at" = now() WHERE "onboarding_completed_at" IS NULL;
