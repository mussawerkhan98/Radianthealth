-- Video appointments.
ALTER TABLE "Doctor" ADD COLUMN "offersVideo" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Appointment" ADD COLUMN "visitType" TEXT NOT NULL DEFAULT 'in_person';
ALTER TABLE "Appointment" ADD COLUMN "videoPatientKey" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Appointment" ADD COLUMN "videoDoctorKey" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Appointment" ADD COLUMN "videoRoom" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Appointment" ADD COLUMN "videoRoomUrl" TEXT NOT NULL DEFAULT '';
