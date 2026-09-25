-- Marketing contacts (import/export) and groups for targeting.
ALTER TABLE "Patient" ADD COLUMN "country" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Patient" ADD COLUMN "region" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Campaign" ADD COLUMN "audience" TEXT NOT NULL DEFAULT '{}';

CREATE TABLE "MarketingContact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "country" TEXT NOT NULL DEFAULT '',
    "region" TEXT NOT NULL DEFAULT '',
    "groups" TEXT NOT NULL DEFAULT '',
    "optOut" BOOLEAN NOT NULL DEFAULT false,
    "unsubKey" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "MarketingContact_email_key" ON "MarketingContact"("email");
