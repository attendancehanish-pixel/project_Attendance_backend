-- CreateTable
CREATE TABLE "PeriodOutline" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "academicYearId" TEXT NOT NULL,
    "periodIndex" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "breakAfterMinutes" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "PeriodOutline_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PeriodOutline_academicYearId_idx" ON "PeriodOutline"("academicYearId");

-- CreateIndex
CREATE UNIQUE INDEX "PeriodOutline_academicYearId_periodIndex_key" ON "PeriodOutline"("academicYearId", "periodIndex");
