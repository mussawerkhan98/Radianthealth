-- Home visits: which doctors go to patients' homes, and the address for each home visit.
ALTER TABLE "Doctor" ADD COLUMN "offersHomeVisit" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Appointment" ADD COLUMN "visitAddress" TEXT NOT NULL DEFAULT '';
