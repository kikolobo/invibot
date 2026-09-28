CREATE TABLE "broadcast_recipients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"broadcast_id" uuid NOT NULL,
	"guest_id" uuid NOT NULL,
	"route" text NOT NULL,
	"status" text NOT NULL,
	"error" text,
	"send_id" uuid,
	"full_send_id" uuid,
	"opened_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "broadcasts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"audience" jsonb NOT NULL,
	"status" text NOT NULL,
	"scheduled_for" timestamp with time zone,
	"is_test" boolean DEFAULT false NOT NULL,
	"test_phone_e164" text,
	"excluded" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_user_id" text,
	"started_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"retired_at" timestamp with time zone,
	"retired_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "broadcast_recipients" ADD CONSTRAINT "broadcast_recipients_broadcast_id_broadcasts_id_fk" FOREIGN KEY ("broadcast_id") REFERENCES "public"."broadcasts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcast_recipients" ADD CONSTRAINT "broadcast_recipients_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcast_recipients" ADD CONSTRAINT "broadcast_recipients_send_id_sends_id_fk" FOREIGN KEY ("send_id") REFERENCES "public"."sends"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcast_recipients" ADD CONSTRAINT "broadcast_recipients_full_send_id_sends_id_fk" FOREIGN KEY ("full_send_id") REFERENCES "public"."sends"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcasts" ADD CONSTRAINT "broadcasts_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "broadcast_recipients_key" ON "broadcast_recipients" USING btree ("broadcast_id","guest_id");--> statement-breakpoint
CREATE INDEX "broadcast_recipients_guest_idx" ON "broadcast_recipients" USING btree ("guest_id");--> statement-breakpoint
CREATE INDEX "broadcasts_event_idx" ON "broadcasts" USING btree ("event_id","created_at");--> statement-breakpoint
CREATE INDEX "broadcasts_due_idx" ON "broadcasts" USING btree ("status","scheduled_for");