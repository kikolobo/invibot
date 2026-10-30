ALTER TABLE "users" ADD COLUMN "stripe_test_customer_id" text;--> statement-breakpoint
-- Every customer saved so far was made in the sandbox: live checkout had not
-- yet succeeded once (it failed on exactly this). They move to the sandbox's
-- column, and live makes its own on the next purchase.
UPDATE "users" SET "stripe_test_customer_id" = "stripe_customer_id", "stripe_customer_id" = NULL
WHERE "stripe_customer_id" IS NOT NULL;
