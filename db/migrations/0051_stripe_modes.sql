ALTER TABLE "payments" ADD COLUMN "livemode" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "site_settings" ADD COLUMN "stripe_test_webhook_id" text;--> statement-breakpoint
ALTER TABLE "site_settings" ADD COLUMN "stripe_test_webhook_secret" text;--> statement-breakpoint
ALTER TABLE "site_settings" ADD COLUMN "stripe_mode" text;