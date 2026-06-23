-- Add employee login fields (email + password) and make AuditLog.managerId nullable.
-- All changes are additive / relaxing — no data loss.

-- Employee: add optional email and passwordHash columns
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "passwordHash" TEXT;

-- Employee: unique constraint on (restaurantId, email) — only where email is not null
CREATE UNIQUE INDEX IF NOT EXISTS "Employee_restaurantId_email_key"
  ON "Employee"("restaurantId", "email");

-- AuditLog: relax managerId from NOT NULL to nullable (legacy rows may lack it)
ALTER TABLE "AuditLog" ALTER COLUMN "managerId" DROP NOT NULL;
