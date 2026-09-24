ALTER TYPE "public"."organizer_role" ADD VALUE 'admin';--> statement-breakpoint
ALTER TYPE "public"."organizer_role" ADD VALUE 'guest_manager';--> statement-breakpoint
ALTER TABLE "organizers" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "organizers" ADD CONSTRAINT "organizers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "organizers_event_user_key" ON "organizers" USING btree ("event_id","user_id") WHERE "organizers"."user_id" is not null;--> statement-breakpoint
CREATE INDEX "organizers_user_idx" ON "organizers" USING btree ("user_id");