CREATE TYPE "public"."pass_status" AS ENUM('active', 'revoked');--> statement-breakpoint
CREATE TABLE "guest_passes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"guest_id" uuid NOT NULL,
	"code" text NOT NULL,
	"seat" integer DEFAULT 1 NOT NULL,
	"label" text NOT NULL,
	"status" "pass_status" DEFAULT 'active' NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "qr_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "guest_passes" ADD CONSTRAINT "guest_passes_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_passes" ADD CONSTRAINT "guest_passes_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "guest_passes_code_key" ON "guest_passes" USING btree ("code");--> statement-breakpoint
CREATE INDEX "guest_passes_guest_idx" ON "guest_passes" USING btree ("guest_id","status");--> statement-breakpoint
CREATE INDEX "guest_passes_event_idx" ON "guest_passes" USING btree ("event_id","status");