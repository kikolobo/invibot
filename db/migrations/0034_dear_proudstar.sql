ALTER TYPE "public"."guest_event_type" ADD VALUE 'contact_added' BEFORE 'reminded';--> statement-breakpoint
ALTER TYPE "public"."guest_source" ADD VALUE 'contact';--> statement-breakpoint
ALTER TABLE "organizers" ADD COLUMN "pending_action" text;--> statement-breakpoint
ALTER TABLE "organizers" ADD COLUMN "pending_action_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organizers" ADD COLUMN "pending_payload" jsonb;