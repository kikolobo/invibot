ALTER TABLE "events" ADD COLUMN "reminder_days_before" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "guests" ADD COLUMN "event_reminded_at" timestamp with time zone;