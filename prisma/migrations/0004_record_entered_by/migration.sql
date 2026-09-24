-- Who entered a medical record when it wasn't the doctor (e.g. admin).
ALTER TABLE "MedicalRecord" ADD COLUMN "enteredById" TEXT NOT NULL DEFAULT '';
ALTER TABLE "MedicalRecord" ADD COLUMN "enteredByName" TEXT NOT NULL DEFAULT '';
