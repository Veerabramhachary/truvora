CREATE UNIQUE INDEX "transactions_subscription_date_unique" ON "transactions" USING btree ("subscription_id","date");
