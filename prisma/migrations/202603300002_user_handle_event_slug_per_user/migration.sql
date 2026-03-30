ALTER TABLE "users" ADD COLUMN "handle" TEXT;

UPDATE "users"
SET "handle" = lower(regexp_replace("name", '[^a-zA-Z0-9]+', '-', 'g')) || '-' ||
  substr(md5(random()::text), 1, 6)
WHERE "handle" IS NULL OR "handle" = '';

ALTER TABLE "users" ALTER COLUMN "handle" SET NOT NULL;
CREATE UNIQUE INDEX "users_handle_key" ON "users"("handle");

DROP INDEX IF EXISTS "event_types_slug_key";
CREATE UNIQUE INDEX "event_types_user_id_slug_key" ON "event_types"("user_id", "slug");
