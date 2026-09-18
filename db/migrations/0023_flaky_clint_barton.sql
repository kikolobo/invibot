CREATE TYPE "public"."organizer_role" AS ENUM('organizer');--> statement-breakpoint
CREATE TABLE "organizers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"phone_e164" text NOT NULL,
	"phone_variants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"role" "organizer_role" DEFAULT 'organizer' NOT NULL,
	"is_responder" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "staff_code" text;--> statement-breakpoint
ALTER TABLE "organizers" ADD CONSTRAINT "organizers_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "organizers_event_phone_key" ON "organizers" USING btree ("event_id","phone_e164");--> statement-breakpoint
CREATE UNIQUE INDEX "organizers_responder_key" ON "organizers" USING btree ("event_id") WHERE "organizers"."is_responder";--> statement-breakpoint
CREATE INDEX "organizers_phone_idx" ON "organizers" USING btree ("phone_e164");--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_staff_code_unique" UNIQUE("staff_code");