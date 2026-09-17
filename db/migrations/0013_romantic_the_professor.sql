ALTER TABLE "events" ADD COLUMN "maps_code" text;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_maps_code_unique" UNIQUE("maps_code");--> statement-breakpoint
-- Existing events get a code too: the short link has to work for every event,
-- not just the ones created after this deploy. Derived from the id so the
-- backfill is deterministic and re-runnable.
UPDATE "events" SET "maps_code" = substr(md5("id"::text), 1, 8) WHERE "maps_code" IS NULL;
