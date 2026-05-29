-- Initial schema (PostgreSQL). Generated to match prisma/schema.prisma so that
-- `prisma migrate deploy` can create all tables on a fresh production database.

-- CreateTable
CREATE TABLE "Restaurant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "minRestHours" DOUBLE PRECISION NOT NULL DEFAULT 11,
    "closingsCount" INTEGER NOT NULL DEFAULT 2,
    "fairnessWindowDays" INTEGER NOT NULL DEFAULT 28,
    "maxConsecutiveDays" INTEGER NOT NULL DEFAULT 6,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Restaurant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Manager" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Manager_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'both',
    "maxShifts" INTEGER,
    "minShifts" INTEGER,
    "onlyMornings" BOOLEAN NOT NULL DEFAULT false,
    "onlyEvenings" BOOLEAN NOT NULL DEFAULT false,
    "noClosings" BOOLEAN NOT NULL DEFAULT false,
    "weekendOk" BOOLEAN NOT NULL DEFAULT true,
    "submissionToken" TEXT NOT NULL,
    "notes" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftTemplate" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "shiftType" TEXT NOT NULL,
    "headcount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ShiftTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Week" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "Week_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleBlock" (
    "id" TEXT NOT NULL,
    "weekId" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "shiftType" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduleBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleNote" (
    "id" TEXT NOT NULL,
    "weekId" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeekOverride" (
    "id" TEXT NOT NULL,
    "weekId" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "shiftType" TEXT NOT NULL,
    "headcount" INTEGER NOT NULL,

    CONSTRAINT "WeekOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RawSubmission" (
    "id" TEXT NOT NULL,
    "weekId" TEXT NOT NULL,
    "employeeId" TEXT,
    "content" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "requestedShifts" INTEGER,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "parsedAt" TIMESTAMP(3),

    CONSTRAINT "RawSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParsedAvailability" (
    "id" TEXT NOT NULL,
    "weekId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "shiftType" TEXT NOT NULL,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "confirmed" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ParsedAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleAssignment" (
    "id" TEXT NOT NULL,
    "weekId" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "shiftType" TEXT NOT NULL,
    "slotIndex" INTEGER NOT NULL,
    "employeeId" TEXT,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "generatedScore" DOUBLE PRECISION,
    "generatedBreakdown" TEXT,
    "generatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "weekId" TEXT,
    "managerId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Manager_email_key" ON "Manager"("email");

-- CreateIndex
CREATE INDEX "Manager_restaurantId_active_idx" ON "Manager"("restaurantId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_submissionToken_key" ON "Employee"("submissionToken");

-- CreateIndex
CREATE INDEX "Employee_restaurantId_archived_idx" ON "Employee"("restaurantId", "archived");

-- CreateIndex
CREATE UNIQUE INDEX "ShiftTemplate_restaurantId_day_shiftType_key" ON "ShiftTemplate"("restaurantId", "day", "shiftType");

-- CreateIndex
CREATE UNIQUE INDEX "Week_restaurantId_weekStart_key" ON "Week"("restaurantId", "weekStart");

-- CreateIndex
CREATE INDEX "ScheduleBlock_weekId_idx" ON "ScheduleBlock"("weekId");

-- CreateIndex
CREATE INDEX "ScheduleBlock_employeeId_idx" ON "ScheduleBlock"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleBlock_weekId_day_shiftType_employeeId_key" ON "ScheduleBlock"("weekId", "day", "shiftType", "employeeId");

-- CreateIndex
CREATE INDEX "ScheduleNote_weekId_idx" ON "ScheduleNote"("weekId");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleNote_weekId_day_kind_key" ON "ScheduleNote"("weekId", "day", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "WeekOverride_weekId_day_shiftType_key" ON "WeekOverride"("weekId", "day", "shiftType");

-- CreateIndex
CREATE INDEX "ParsedAvailability_weekId_day_shiftType_idx" ON "ParsedAvailability"("weekId", "day", "shiftType");

-- CreateIndex
CREATE INDEX "ParsedAvailability_weekId_confirmed_idx" ON "ParsedAvailability"("weekId", "confirmed");

-- CreateIndex
CREATE UNIQUE INDEX "ParsedAvailability_weekId_employeeId_day_shiftType_key" ON "ParsedAvailability"("weekId", "employeeId", "day", "shiftType");

-- CreateIndex
CREATE INDEX "ScheduleAssignment_weekId_employeeId_idx" ON "ScheduleAssignment"("weekId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleAssignment_weekId_day_shiftType_slotIndex_key" ON "ScheduleAssignment"("weekId", "day", "shiftType", "slotIndex");

-- AddForeignKey
ALTER TABLE "Manager" ADD CONSTRAINT "Manager_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftTemplate" ADD CONSTRAINT "ShiftTemplate_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Week" ADD CONSTRAINT "Week_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleBlock" ADD CONSTRAINT "ScheduleBlock_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "Week"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleBlock" ADD CONSTRAINT "ScheduleBlock_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleNote" ADD CONSTRAINT "ScheduleNote_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "Week"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeekOverride" ADD CONSTRAINT "WeekOverride_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "Week"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawSubmission" ADD CONSTRAINT "RawSubmission_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "Week"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawSubmission" ADD CONSTRAINT "RawSubmission_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParsedAvailability" ADD CONSTRAINT "ParsedAvailability_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "Week"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParsedAvailability" ADD CONSTRAINT "ParsedAvailability_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleAssignment" ADD CONSTRAINT "ScheduleAssignment_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "Week"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleAssignment" ADD CONSTRAINT "ScheduleAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "Week"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "Manager"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
