ALTER TABLE "events" ADD COLUMN "card_r2_key" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "card_content_type" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "card_bytes" integer;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "card_uploaded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "card_media_id" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "card_media_refreshed_at" timestamp with time zone;