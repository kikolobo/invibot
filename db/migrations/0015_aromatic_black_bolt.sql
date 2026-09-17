CREATE TYPE "public"."approval_status" AS ENUM('approved', 'pending', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."guest_source" AS ENUM('manual', 'self');--> statement-breakpoint
CREATE TYPE "public"."pending_question" AS ENUM('name', 'name_update');--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "auto_register_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "registration_code" text;--> statement-breakpoint
ALTER TABLE "guests" ADD COLUMN "approval_status" "approval_status" DEFAULT 'approved' NOT NULL;--> statement-breakpoint
ALTER TABLE "guests" ADD COLUMN "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "guests" ADD COLUMN "source" "guest_source" DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "guests" ADD COLUMN "pending_question" "pending_question";--> statement-breakpoint
ALTER TABLE "guests" ADD COLUMN "pending_question_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_registration_code_unique" UNIQUE("registration_code");