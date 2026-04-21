-- Add the fallback_events audit table (onFallbackUsed hook target).
--
-- Applied manually via:
--   source <(grep -E '^DATABASE_URL=' .env | sed 's/^/export /')
--   psql "$DATABASE_URL" -f prisma/migrations/2026-04-21-add-fallback-events.sql
--
-- `prisma db push` was NOT used because the current schema.prisma diverges
-- from the live DB (the raw-SQL `session_key_assignments` key-pool table
-- isn't declared in Prisma, so `db push` would attempt to DROP it). This
-- file carries just the additive CREATE TABLE + indexes + foreign keys.

CREATE TABLE "fallback_events" (
    "id" SERIAL NOT NULL,
    "thread_id" TEXT NOT NULL,
    "participant_id" INTEGER NOT NULL,
    "stage_id" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "primary_provider" TEXT NOT NULL,
    "fallback_provider" TEXT NOT NULL,
    "primary_error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fallback_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "fallback_events_participant_id_thread_id_idx" ON "fallback_events"("participant_id", "thread_id");

CREATE INDEX "fallback_events_created_at_idx" ON "fallback_events"("created_at");

ALTER TABLE "fallback_events" ADD CONSTRAINT "fallback_events_participant_id_fkey"
    FOREIGN KEY ("participant_id") REFERENCES "participants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "fallback_events" ADD CONSTRAINT "fallback_events_stage_id_fkey"
    FOREIGN KEY ("stage_id") REFERENCES "stages"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
