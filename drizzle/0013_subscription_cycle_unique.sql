CREATE UNIQUE INDEX IF NOT EXISTS "transactions_subscription_date_unique" ON "transactions" USING btree ("subscription_id","date");
