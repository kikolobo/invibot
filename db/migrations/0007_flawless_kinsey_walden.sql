CREATE TYPE "public"."guest_event_type" AS ENUM('invited', 'delivered', 'read', 'confirmed', 'declined', 'opted_out', 'party_size_changed');--> statement-breakpoint
CREATE TABLE "guest_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"guest_id" uuid NOT NULL,
	"type" "guest_event_type" NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"source" text NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "guest_events" ADD CONSTRAINT "guest_events_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_events" ADD CONSTRAINT "guest_events_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "guest_events_guest_idx" ON "guest_events" USING btree ("guest_id","at");--> statement-breakpoint
CREATE INDEX "guest_events_event_type_idx" ON "guest_events" USING btree ("event_id","type");