ALTER TABLE "site_settings" ADD COLUMN "anthropic_balance_cents" integer;--> statement-breakpoint
ALTER TABLE "site_settings" ADD COLUMN "anthropic_balance_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "site_settings" ADD COLUMN "anthropic_alert_cents" integer DEFAULT 2000 NOT NULL;--> statement-breakpoint
ALTER TABLE "site_settings" ADD COLUMN "anthropic_alerted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "site_settings" ADD COLUMN "whatsapp_budget_cents" integer;--> statement-breakpoint
ALTER TABLE "site_settings" ADD COLUMN "whatsapp_marketing_micro_usd" integer DEFAULT 30500 NOT NULL;--> statement-breakpoint
ALTER TABLE "site_settings" ADD COLUMN "whatsapp_utility_micro_usd" integer DEFAULT 8500 NOT NULL;--> statement-breakpoint
ALTER TABLE "site_settings" ADD COLUMN "whatsapp_alerted_month" text;--> statement-breakpoint
ALTER TABLE "site_settings" ADD COLUMN "whatsapp_payment_alerted_at" timestamp with time zone;