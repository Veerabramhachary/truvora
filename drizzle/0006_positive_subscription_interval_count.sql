UPDATE "subscriptions" SET "interval_count" = 1 WHERE "interval_count" <= 0;

ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_interval_count_positive" CHECK ("subscriptions"."interval_count" > 0);