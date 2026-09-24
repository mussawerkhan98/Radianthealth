-- CreateTable
CREATE TABLE "RecordFile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "recordId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BLOB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RecordFile_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "MedicalRecord" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "RecordFile_recordId_idx" ON "RecordFile"("recordId");

-- CreateIndex
CREATE INDEX "RecordFile_patientId_idx" ON "RecordFile"("patientId");

