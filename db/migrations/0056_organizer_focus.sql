CREATE TABLE "organizer_focus" (
	"phone_e164" text PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organizer_focus" ADD CONSTRAINT "organizer_focus_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;