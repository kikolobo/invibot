CREATE TABLE "ai_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid,
	"guest_id" uuid,
	"source" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"cache_write_tokens" integer DEFAULT 0 NOT NULL,
	"cost_micro_usd" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"user_id" text,
	"slots" integer NOT NULL,
	"unit_amount_minor" integer NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"stripe_session_id" text,
	"stripe_payment_intent_id" text,
	"method" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "billing_exempt" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "paid_slots" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "gifted_slots" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "guests" ADD COLUMN "billed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "site_settings" ADD COLUMN "price_per_guest_minor" integer DEFAULT 1000 NOT NULL;--> statement-breakpoint
ALTER TABLE "site_settings" ADD COLUMN "currency" text DEFAULT 'MXN' NOT NULL;--> statement-breakpoint
ALTER TABLE "site_settings" ADD COLUMN "minimum_slots" integer DEFAULT 20 NOT NULL;--> statement-breakpoint
ALTER TABLE "site_settings" ADD COLUMN "free_simulator_turns" integer DEFAULT 20 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_usage_event_idx" ON "ai_usage" USING btree ("event_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_usage_created_idx" ON "ai_usage" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_stripe_session_key" ON "payments" USING btree ("stripe_session_id");--> statement-breakpoint
CREATE INDEX "payments_event_idx" ON "payments" USING btree ("event_id","created_at");--> statement-breakpoint
CREATE INDEX "payments_status_idx" ON "payments" USING btree ("status","paid_at");--> statement-breakpoint
-- Guests who were already sent something hold their place: they were invited
-- before there was anything to pay for, and must keep hearing from us.
UPDATE "guests" g SET "billed_at" = s."first"
FROM (
  SELECT "guest_id", min("queued_at") AS "first" FROM "sends"
  WHERE "guest_id" IS NOT NULL AND "kind" <> 'auto_register'
  GROUP BY "guest_id"
) s
WHERE g."id" = s."guest_id";--> statement-breakpoint
-- And those places are on the house, so the events they belong to keep working.
UPDATE "events" e SET "gifted_slots" = c."n"
FROM (
  SELECT "event_id", count(*)::int AS "n" FROM "guests"
  WHERE "billed_at" IS NOT NULL GROUP BY "event_id"
) c
WHERE e."id" = c."event_id";
