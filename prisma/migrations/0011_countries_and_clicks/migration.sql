-- Doctor location + promotion click tracking.
ALTER TABLE "Doctor" ADD COLUMN "country" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Doctor" ADD COLUMN "city" TEXT NOT NULL DEFAULT '';

CREATE TABLE "CampaignRecipient" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "personKind" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "firstClickAt" DATETIME,
    "lastClickAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "CampaignRecipient_token_key" ON "CampaignRecipient"("token");
CREATE INDEX "CampaignRecipient_campaignId_idx" ON "CampaignRecipient"("campaignId");
