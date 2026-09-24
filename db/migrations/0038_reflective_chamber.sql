CREATE TABLE "organizer_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"phone_e164" text NOT NULL,
	"role" "organizer_role" NOT NULL,
	"token" text NOT NULL,
	"invited_by_user_id" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organizer_invites" ADD CONSTRAINT "organizer_invites_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizer_invites" ADD CONSTRAINT "organizer_invites_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "organizer_invites_token_key" ON "organizer_invites" USING btree ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "organizer_invites_event_phone_key" ON "organizer_invites" USING btree ("event_id","phone_e164");--> statement-breakpoint
CREATE INDEX "organizer_invites_phone_idx" ON "organizer_invites" USING btree ("phone_e164");