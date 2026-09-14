CREATE TABLE "unmatched_inbound" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"whatsapp_account_id" uuid,
	"phone_number_id" text,
	"from_phone" text NOT NULL,
	"profile_name" text,
	"body" text,
	"provider_message_id" text,
	"raw" jsonb,
	"resolved_guest_id" uuid,
	"received_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "unmatched_inbound" ADD CONSTRAINT "unmatched_inbound_whatsapp_account_id_whatsapp_accounts_id_fk" FOREIGN KEY ("whatsapp_account_id") REFERENCES "public"."whatsapp_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "unmatched_inbound_provider_message_id_key" ON "unmatched_inbound" USING btree ("provider_message_id");--> statement-breakpoint
CREATE INDEX "unmatched_inbound_from_idx" ON "unmatched_inbound" USING btree ("from_phone");