CREATE TABLE "availability_schedules" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "timezone" TEXT NOT NULL,
  "is_default" BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "availability_schedules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "availability_schedules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "availability_schedules_user_id_is_default_idx"
  ON "availability_schedules" ("user_id", "is_default");

CREATE UNIQUE INDEX "availability_schedules_one_default_per_user_key"
  ON "availability_schedules" ("user_id")
  WHERE "is_default" = TRUE;

ALTER TABLE "availability_rules" ADD COLUMN "schedule_id" UUID;

INSERT INTO "availability_schedules" ("user_id", "name", "timezone", "is_default")
SELECT
  "id",
  'Working hours',
  "timezone",
  TRUE
FROM "users"
WHERE NOT EXISTS (
  SELECT 1
  FROM "availability_schedules" s
  WHERE s."user_id" = "users"."id"
);

UPDATE "availability_rules" ar
SET "schedule_id" = s."id"
FROM "availability_schedules" s
WHERE ar."user_id" = s."user_id"
  AND s."is_default" = TRUE
  AND ar."schedule_id" IS NULL;

ALTER TABLE "availability_rules"
  ALTER COLUMN "schedule_id" SET NOT NULL;

ALTER TABLE "availability_rules"
  ADD CONSTRAINT "availability_rules_schedule_id_fkey"
  FOREIGN KEY ("schedule_id") REFERENCES "availability_schedules"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "availability_rules_schedule_id_day_of_week_idx"
  ON "availability_rules" ("schedule_id", "day_of_week");

ALTER TABLE "availability_rules"
  ADD CONSTRAINT "availability_rules_quarter_hour_check"
  CHECK ("start_minute" % 15 = 0 AND "end_minute" % 15 = 0);
