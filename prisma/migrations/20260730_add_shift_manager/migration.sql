-- Add Shift Manager as an additional employee capability (not a role).
-- All changes are additive with defaults — no data loss, no existing rows change behavior.

-- Employee: shiftManager capability flag, defaults false for all existing employees
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "shiftManager" BOOLEAN NOT NULL DEFAULT false;

-- Restaurant: configurable Shift Manager shift hours (display) + default "Hours" note text
ALTER TABLE "Restaurant" ADD COLUMN IF NOT EXISTS "shiftManagerStart" TEXT NOT NULL DEFAULT '16:00';
ALTER TABLE "Restaurant" ADD COLUMN IF NOT EXISTS "shiftManagerEnd" TEXT NOT NULL DEFAULT '23:30';
ALTER TABLE "Restaurant" ADD COLUMN IF NOT EXISTS "defaultHoursText" TEXT NOT NULL DEFAULT 'סוגרים ב־23:30
(מטבח ב־22:30)';
