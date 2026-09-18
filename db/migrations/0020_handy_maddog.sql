ALTER TABLE "events" ADD COLUMN "teaser_r2_key" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "teaser_content_type" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "teaser_bytes" integer;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "teaser_uploaded_at" timestamp with time zone;