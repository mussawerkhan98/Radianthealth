-- Public profiles (qualifications, certificates) for doctors and team members.
ALTER TABLE "Doctor" ADD COLUMN "about" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Doctor" ADD COLUMN "qualifications" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Doctor" ADD COLUMN "education" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Doctor" ADD COLUMN "expertise" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Doctor" ADD COLUMN "languages" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Doctor" ADD COLUMN "experienceYears" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "TeamMember" ADD COLUMN "about" TEXT NOT NULL DEFAULT '';
ALTER TABLE "TeamMember" ADD COLUMN "qualifications" TEXT NOT NULL DEFAULT '';
ALTER TABLE "TeamMember" ADD COLUMN "education" TEXT NOT NULL DEFAULT '';
ALTER TABLE "TeamMember" ADD COLUMN "expertise" TEXT NOT NULL DEFAULT '';
ALTER TABLE "TeamMember" ADD COLUMN "languages" TEXT NOT NULL DEFAULT '';
ALTER TABLE "TeamMember" ADD COLUMN "experienceYears" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "ProfileCertificate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerType" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "issuer" TEXT NOT NULL DEFAULT '',
    "year" TEXT NOT NULL DEFAULT '',
    "filename" TEXT NOT NULL DEFAULT '',
    "mimeType" TEXT NOT NULL DEFAULT '',
    "size" INTEGER NOT NULL DEFAULT 0,
    "data" BLOB,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ProfileCertificate_ownerType_ownerId_idx" ON "ProfileCertificate"("ownerType", "ownerId");
