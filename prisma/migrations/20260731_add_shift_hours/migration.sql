-- Generalize shift hours: every shift type's start/end become per-restaurant
-- editable config (Shift Template page) instead of hardcoded in lib/shifts.ts.
-- Backfills every existing restaurant with the current hardcoded defaults so
-- nothing changes until a manager edits a row. SHIFT_MANAGER reuses whatever
-- was already saved in Restaurant.shiftManagerStart/shiftManagerEnd (preserves
-- any prior customization) before those columns are dropped.

CREATE TABLE IF NOT EXISTS "ShiftHours" (
  "id" TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "shiftType" TEXT NOT NULL,
  "start" TEXT NOT NULL,
  "end" TEXT NOT NULL,
  "endsNextDay" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "ShiftHours_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ShiftHours_restaurantId_shiftType_key"
  ON "ShiftHours"("restaurantId", "shiftType");

DO $$ BEGIN
  ALTER TABLE "ShiftHours" ADD CONSTRAINT "ShiftHours_restaurantId_fkey"
    FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

INSERT INTO "ShiftHours" ("id", "restaurantId", "shiftType", "start", "end", "endsNextDay")
SELECT
  md5(random()::text || clock_timestamp()::text || r.id || v."shiftType"),
  r.id,
  v."shiftType",
  CASE WHEN v."shiftType" = 'SHIFT_MANAGER' THEN r."shiftManagerStart" ELSE v."start" END,
  CASE WHEN v."shiftType" = 'SHIFT_MANAGER' THEN r."shiftManagerEnd" ELSE v."end" END,
  v."endsNextDay"
FROM "Restaurant" r
CROSS JOIN (VALUES
  ('MORNING_KITCHEN', '09:30', '16:00', false),
  ('MORNING_FLOOR', '09:30', '17:30', false),
  ('EVENING_KITCHEN', '16:00', '01:00', true),
  ('EVENING_FLOOR_17', '17:00', '23:00', false),
  ('CLOSING_A_19', '19:00', '01:00', true),
  ('CLOSING_B_20', '20:00', '01:00', true),
  ('SHIFT_MANAGER', '16:00', '23:30', false)
) AS v("shiftType", "start", "end", "endsNextDay")
ON CONFLICT ("restaurantId", "shiftType") DO NOTHING;

-- Drop now-redundant single-purpose columns (data preserved into ShiftHours above)
ALTER TABLE "Restaurant" DROP COLUMN IF EXISTS "shiftManagerStart";
ALTER TABLE "Restaurant" DROP COLUMN IF EXISTS "shiftManagerEnd";
