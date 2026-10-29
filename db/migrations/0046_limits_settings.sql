CREATE TABLE "site_settings" (
	"id" text PRIMARY KEY DEFAULT 'site' NOT NULL,
	"signup_mode" text DEFAULT 'passcode' NOT NULL,
	"signup_passcode" text,
	"maintenance" boolean DEFAULT false NOT NULL,
	"maintenance_message" text,
	"default_max_events" integer,
	"default_max_guests_per_event" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_user_id" text
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "max_events" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "max_guests_per_event" integer;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "max_guests" integer;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "suspended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "suspended_reason" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "suspended_by_user_id" text;