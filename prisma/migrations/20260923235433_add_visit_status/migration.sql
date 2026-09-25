-- CreateEnum
CREATE TYPE "VisitStatus" AS ENUM ('PLANNED', 'COMPLETED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Visit" ADD COLUMN     "status" "VisitStatus" NOT NULL DEFAULT 'PLANNED';

-- CreateIndex
CREATE INDEX "Visit_status_date_idx" ON "Visit"("status", "date");
