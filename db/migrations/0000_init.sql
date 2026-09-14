CREATE TYPE "public"."channel" AS ENUM('whatsapp', 'sms', 'email');--> statement-breakpoint
CREATE TYPE "public"."conversation_status" AS ENUM('active', 'paused', 'handed_off', 'closed');--> statement-breakpoint
CREATE TYPE "public"."design_format" AS ENUM('square', 'portrait', 'story', 'print');--> statement-breakpoint
CREATE TYPE "public"."escalation_status" AS ENUM('open', 'asked', 'answered', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."event_kind" AS ENUM('wedding', 'birthday', 'quinceanera', 'corporate', 'product_launch', 'anniversary', 'baby_shower', 'graduation', 'other');--> statement-breakpoint
CREATE TYPE "public"."event_status" AS ENUM('draft', 'ready', 'sending', 'live', 'closed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."fact_source" AS ENUM('intake', 'organizer', 'ai');--> statement-breakpoint
CREATE TYPE "public"."fact_visibility" AS ENUM('public', 'internal');--> statement-breakpoint
CREATE TYPE "public"."invite_status" AS ENUM('pending', 'queued', 'sent', 'delivered', 'read', 'failed');--> statement-breakpoint
CREATE TYPE "public"."message_direction" AS ENUM('inbound', 'outbound');--> statement-breakpoint
CREATE TYPE "public"."pricing_category" AS ENUM('marketing', 'utility', 'service', 'authentication');--> statement-breakpoint
CREATE TYPE "public"."rsvp_status" AS ENUM('no_response', 'confirmed', 'declined', 'maybe', 'waitlist');--> statement-breakpoint
CREATE TYPE "public"."send_kind" AS ENUM('save_the_date', 'invite', 'reminder', 'rsvp_confirmation', 'logistics', 'organizer_relay', 'custom');--> statement-breakpoint
CREATE TYPE "public"."send_status" AS ENUM('queued', 'sent', 'delivered', 'read', 'failed');--> statement-breakpoint
CREATE TYPE "public"."template_status" AS ENUM('pending', 'approved', 'rejected', 'paused', 'disabled');--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'owner' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"owner_user_id" text NOT NULL,
	"default_locale" text DEFAULT 'es-MX' NOT NULL,
	"default_timezone" text DEFAULT 'America/Mexico_City' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "design_renders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"design_id" uuid NOT NULL,
	"format" "design_format" NOT NULL,
	"guest_id" uuid,
	"r2_key" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"bytes" integer NOT NULL,
	"checksum" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "design_renders_unique" UNIQUE NULLS NOT DISTINCT("design_id","format","guest_id")
);
--> statement-breakpoint
CREATE TABLE "designs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid,
	"event_id" uuid,
	"is_system_template" boolean DEFAULT false NOT NULL,
	"template_key" text NOT NULL,
	"name" text NOT NULL,
	"tokens" jsonb NOT NULL,
	"copy" jsonb NOT NULL,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_facts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"key" text,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"question_normalized" text NOT NULL,
	"source" "fact_source" NOT NULL,
	"visibility" "fact_visibility" DEFAULT 'public' NOT NULL,
	"origin_escalation_id" uuid,
	"times_used" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"created_by_user_id" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"kind" "event_kind" NOT NULL,
	"status" "event_status" DEFAULT 'draft' NOT NULL,
	"host_names" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"timezone" text DEFAULT 'America/Mexico_City' NOT NULL,
	"locale" text DEFAULT 'es-MX' NOT NULL,
	"venue_name" text,
	"venue_address" text,
	"venue_city" text,
	"venue_state" text,
	"venue_country" text DEFAULT 'MX',
	"venue_lat" double precision,
	"venue_lng" double precision,
	"venue_place_id" text,
	"venue_maps_url" text,
	"rsvp_required" boolean DEFAULT true NOT NULL,
	"rsvp_deadline" timestamp with time zone,
	"allow_plus_ones" boolean DEFAULT false NOT NULL,
	"max_party_size" integer DEFAULT 1 NOT NULL,
	"capacity" integer,
	"details" jsonb NOT NULL,
	"cover_design_id" uuid,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"first_name" text,
	"phone_e164" text,
	"phone_variants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"email" text,
	"locale" text,
	"group_label" text,
	"invite_status" "invite_status" DEFAULT 'pending' NOT NULL,
	"rsvp_status" "rsvp_status" DEFAULT 'no_response' NOT NULL,
	"rsvp_responded_at" timestamp with time zone,
	"party_size_allowed" integer DEFAULT 1 NOT NULL,
	"party_size_confirmed" integer,
	"companions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"dietary" text,
	"accessibility" text,
	"notes" text,
	"access_token" text NOT NULL,
	"opted_out" boolean DEFAULT false NOT NULL,
	"opted_out_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppressions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone_e164" text,
	"email" text,
	"reason" text NOT NULL,
	"source_event_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"kind" "send_kind" NOT NULL,
	"scheduled_for" timestamp with time zone,
	"status" text DEFAULT 'draft' NOT NULL,
	"inngest_run_id" text,
	"total_count" integer DEFAULT 0 NOT NULL,
	"sent_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"approved_by_user_id" text,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"guest_id" uuid,
	"organizer_user_id" text,
	"channel" "channel" DEFAULT 'whatsapp' NOT NULL,
	"whatsapp_account_id" uuid,
	"peer_phone_e164" text,
	"window_expires_at" timestamp with time zone,
	"language" text,
	"state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "conversation_status" DEFAULT 'active' NOT NULL,
	"last_inbound_at" timestamp with time zone,
	"last_outbound_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "escalations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"conversation_id" uuid,
	"question_text" text NOT NULL,
	"question_normalized" text NOT NULL,
	"waiting_guest_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "escalation_status" DEFAULT 'open' NOT NULL,
	"asked_organizer_at" timestamp with time zone,
	"organizer_message_id" uuid,
	"answer_text" text,
	"answered_at" timestamp with time zone,
	"resulting_fact_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"whatsapp_account_id" uuid NOT NULL,
	"name" text NOT NULL,
	"language" text DEFAULT 'es_MX' NOT NULL,
	"category" "pricing_category" NOT NULL,
	"kind" "send_kind" NOT NULL,
	"status" "template_status" DEFAULT 'pending' NOT NULL,
	"meta_template_id" text,
	"components" jsonb NOT NULL,
	"rejection_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"direction" "message_direction" NOT NULL,
	"body" text,
	"media" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"provider_message_id" text,
	"raw" jsonb,
	"ai_generated" boolean DEFAULT false NOT NULL,
	"model" text,
	"tokens_in" integer,
	"tokens_out" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"guest_id" uuid,
	"campaign_id" uuid,
	"whatsapp_account_id" uuid,
	"channel" "channel" NOT NULL,
	"kind" "send_kind" NOT NULL,
	"template_name" text,
	"template_language" text,
	"variables" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"provider_message_id" text,
	"status" "send_status" DEFAULT 'queued' NOT NULL,
	"error_code" text,
	"error_title" text,
	"pricing_category" "pricing_category",
	"cost_minor" integer,
	"cost_currency" text,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"read_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "whatsapp_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid,
	"is_platform" boolean DEFAULT false NOT NULL,
	"waba_id" text NOT NULL,
	"phone_number_id" text NOT NULL,
	"display_phone" text NOT NULL,
	"access_token_encrypted" text NOT NULL,
	"quality_rating" text,
	"messaging_tier" text,
	"tier_daily_limit" integer DEFAULT 250 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_renders" ADD CONSTRAINT "design_renders_design_id_designs_id_fk" FOREIGN KEY ("design_id") REFERENCES "public"."designs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "designs" ADD CONSTRAINT "designs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "designs" ADD CONSTRAINT "designs_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_facts" ADD CONSTRAINT "event_facts_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guests" ADD CONSTRAINT "guests_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_whatsapp_account_id_whatsapp_accounts_id_fk" FOREIGN KEY ("whatsapp_account_id") REFERENCES "public"."whatsapp_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escalations" ADD CONSTRAINT "escalations_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escalations" ADD CONSTRAINT "escalations_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_whatsapp_account_id_whatsapp_accounts_id_fk" FOREIGN KEY ("whatsapp_account_id") REFERENCES "public"."whatsapp_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sends" ADD CONSTRAINT "sends_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sends" ADD CONSTRAINT "sends_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sends" ADD CONSTRAINT "sends_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sends" ADD CONSTRAINT "sends_whatsapp_account_id_whatsapp_accounts_id_fk" FOREIGN KEY ("whatsapp_account_id") REFERENCES "public"."whatsapp_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_accounts" ADD CONSTRAINT "whatsapp_accounts_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_org_user_key" ON "memberships" USING btree ("org_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "organizations_owner_idx" ON "organizations" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "designs_event_idx" ON "designs" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "designs_system_idx" ON "designs" USING btree ("is_system_template","template_key");--> statement-breakpoint
CREATE INDEX "event_facts_event_idx" ON "event_facts" USING btree ("event_id","is_active");--> statement-breakpoint
CREATE INDEX "event_facts_normalized_idx" ON "event_facts" USING btree ("event_id","question_normalized");--> statement-breakpoint
CREATE UNIQUE INDEX "events_slug_key" ON "events" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "events_org_idx" ON "events" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "events_starts_at_idx" ON "events" USING btree ("starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "guests_event_phone_key" ON "guests" USING btree ("event_id","phone_e164");--> statement-breakpoint
CREATE UNIQUE INDEX "guests_access_token_key" ON "guests" USING btree ("access_token");--> statement-breakpoint
CREATE INDEX "guests_event_idx" ON "guests" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "guests_rsvp_idx" ON "guests" USING btree ("event_id","rsvp_status");--> statement-breakpoint
CREATE UNIQUE INDEX "suppressions_phone_key" ON "suppressions" USING btree ("phone_e164");--> statement-breakpoint
CREATE UNIQUE INDEX "suppressions_email_key" ON "suppressions" USING btree ("email");--> statement-breakpoint
CREATE INDEX "campaigns_event_idx" ON "campaigns" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "conversations_event_idx" ON "conversations" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_guest_channel_key" ON "conversations" USING btree ("guest_id","channel");--> statement-breakpoint
CREATE INDEX "conversations_peer_idx" ON "conversations" USING btree ("peer_phone_e164");--> statement-breakpoint
CREATE INDEX "escalations_event_status_idx" ON "escalations" USING btree ("event_id","status");--> statement-breakpoint
CREATE INDEX "escalations_normalized_idx" ON "escalations" USING btree ("event_id","question_normalized");--> statement-breakpoint
CREATE UNIQUE INDEX "message_templates_account_name_lang_key" ON "message_templates" USING btree ("whatsapp_account_id","name","language");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_provider_message_id_key" ON "messages" USING btree ("provider_message_id");--> statement-breakpoint
CREATE INDEX "messages_conversation_idx" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sends_provider_message_id_key" ON "sends" USING btree ("provider_message_id");--> statement-breakpoint
CREATE INDEX "sends_event_idx" ON "sends" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "sends_guest_idx" ON "sends" USING btree ("guest_id");--> statement-breakpoint
CREATE INDEX "sends_status_idx" ON "sends" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_accounts_phone_number_key" ON "whatsapp_accounts" USING btree ("phone_number_id");--> statement-breakpoint
CREATE INDEX "whatsapp_accounts_org_idx" ON "whatsapp_accounts" USING btree ("org_id");