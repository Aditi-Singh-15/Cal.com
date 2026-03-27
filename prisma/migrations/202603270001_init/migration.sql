CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;
DO $$
BEGIN
  IF to_regtype('public."BookingStatus"') IS NULL THEN
    CREATE TYPE "BookingStatus" AS ENUM ('confirmed', 'cancelled');
  END IF;
END $$;

CREATE TABLE "users" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "timezone" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_email_key" ON "users" ("email");

CREATE TABLE "event_types" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "duration_minutes" INTEGER NOT NULL CHECK ("duration_minutes" > 0),
  "slug" TEXT NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "event_types_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "event_types_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "event_types_slug_key" ON "event_types" ("slug");
CREATE INDEX "event_types_user_id_idx" ON "event_types" ("user_id");

CREATE TABLE "availability_rules" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "day_of_week" INTEGER NOT NULL CHECK ("day_of_week" >= 0 AND "day_of_week" <= 6),
  "start_minute" INTEGER NOT NULL CHECK ("start_minute" >= 0 AND "start_minute" <= 1439),
  "end_minute" INTEGER NOT NULL CHECK ("end_minute" > "start_minute" AND "end_minute" <= 1440),
  "timezone" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "availability_rules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "availability_rules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "availability_rules_user_id_day_of_week_idx" ON "availability_rules" ("user_id", "day_of_week");

CREATE TABLE "bookings" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "event_type_id" UUID NOT NULL,
  "host_user_id" UUID NOT NULL,
  "booker_name" TEXT NOT NULL,
  "booker_email" TEXT NOT NULL,
  "start_at" TIMESTAMPTZ(6) NOT NULL,
  "end_at" TIMESTAMPTZ(6) NOT NULL,
  "status" "BookingStatus" NOT NULL DEFAULT 'confirmed'::"BookingStatus",
  "cancelled_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bookings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "bookings_event_type_id_fkey" FOREIGN KEY ("event_type_id") REFERENCES "event_types"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "bookings_host_user_id_fkey" FOREIGN KEY ("host_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "bookings_end_after_start_check" CHECK ("end_at" > "start_at")
);

CREATE INDEX "bookings_host_user_id_start_at_idx" ON "bookings" ("host_user_id", "start_at");
CREATE INDEX "bookings_event_type_id_idx" ON "bookings" ("event_type_id");
CREATE INDEX "bookings_status_start_at_idx" ON "bookings" ("status", "start_at");

ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_host_time_no_overlap_excl"
  EXCLUDE USING GIST (
    "host_user_id" WITH =,
    tstzrange("start_at", "end_at", '[)') WITH &&
  )
  WHERE ("status" = 'confirmed'::"BookingStatus");
