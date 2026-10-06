/*
  Warnings:

  - You are about to drop the column `remarks` on the `StudentAttendance` table. All the data in the column will be lost.
  - You are about to drop the column `studentId` on the `StudentAttendance` table. All the data in the column will be lost.
  - Added the required column `enrollmentId` to the `StudentAttendance` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_StudentAttendance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "attendanceSessionId" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "absenceTypeId" TEXT,
    "markedById" TEXT NOT NULL,
    "markedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StudentAttendance_attendanceSessionId_fkey" FOREIGN KEY ("attendanceSessionId") REFERENCES "AttendanceSession" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StudentAttendance_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "StudentEnrollment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StudentAttendance_absenceTypeId_fkey" FOREIGN KEY ("absenceTypeId") REFERENCES "StudentAbsenceType" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "StudentAttendance_markedById_fkey" FOREIGN KEY ("markedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_StudentAttendance" ("absenceTypeId", "attendanceSessionId", "id", "markedAt", "markedById", "status") SELECT "absenceTypeId", "attendanceSessionId", "id", "markedAt", "markedById", "status" FROM "StudentAttendance";
DROP TABLE "StudentAttendance";
ALTER TABLE "new_StudentAttendance" RENAME TO "StudentAttendance";
CREATE INDEX "StudentAttendance_enrollmentId_idx" ON "StudentAttendance"("enrollmentId");
CREATE UNIQUE INDEX "StudentAttendance_attendanceSessionId_enrollmentId_key" ON "StudentAttendance"("attendanceSessionId", "enrollmentId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
