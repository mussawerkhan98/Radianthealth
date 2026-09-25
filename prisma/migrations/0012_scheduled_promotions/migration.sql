-- Scheduled promotions.
ALTER TABLE "Campaign" ADD COLUMN "scheduledAt" DATETIME;
ALTER TABLE "Campaign" ADD COLUMN "sendError" TEXT NOT NULL DEFAULT '';
