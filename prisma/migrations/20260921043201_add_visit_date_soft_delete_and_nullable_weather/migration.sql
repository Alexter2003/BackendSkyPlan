/*
  Warnings:

  - You are about to drop the column `air` on the `Visit` table. All the data in the column will be lost.
  - Added the required column `date` to the `Visit` table without a default value. This is not possible if the table is not empty.
  - Made the column `userId` on table `Visit` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "Visit" DROP CONSTRAINT "Visit_userId_fkey";

-- AlterTable
ALTER TABLE "Activity" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Visit" DROP COLUMN "air",
ADD COLUMN     "date" DATE NOT NULL,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ALTER COLUMN "userId" SET NOT NULL,
ALTER COLUMN "temperature" DROP NOT NULL,
ALTER COLUMN "precipitation" DROP NOT NULL,
ALTER COLUMN "humidity" DROP NOT NULL,
ALTER COLUMN "atmosphericPressure" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Visit_userId_isActive_date_idx" ON "Visit"("userId", "isActive", "date");

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
