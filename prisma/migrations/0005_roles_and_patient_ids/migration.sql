-- Patient ID = normalized phone number (filled in for existing patients by scripts/backfill-phone-keys.js).
ALTER TABLE "Patient" ADD COLUMN "phoneKey" TEXT;
CREATE UNIQUE INDEX "Patient_phoneKey_key" ON "Patient"("phoneKey");

-- Staff roles with admin-editable permissions.
CREATE TABLE "Role" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "permissions" TEXT NOT NULL DEFAULT '',
    "builtIn" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "Role" ("id", "name", "permissions", "builtIn") VALUES
  ('admin', 'Admin', '*', true),
  ('reception', 'Reception', 'appointments.view,appointments.book,appointments.cancel,patients.view,patients.edit,doctors.view', true),
  ('nurse', 'Nurse', 'appointments.view,patients.view,records.view,records.write,doctors.view', true),
  ('manager', 'Manager', 'appointments.view,appointments.book,appointments.cancel,patients.view,patients.edit,records.view,doctors.view,doctors.manage,directory.manage', true);

-- Old "staff" (front desk) accounts become Reception.
UPDATE "Staff" SET "role" = 'reception' WHERE "role" = 'staff';
