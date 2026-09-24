-- Patients who booked without creating an account (no password yet).
ALTER TABLE "Patient" ADD COLUMN "isGuest" BOOLEAN NOT NULL DEFAULT false;
