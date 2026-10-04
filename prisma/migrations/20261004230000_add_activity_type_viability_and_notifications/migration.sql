-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('OUTDOOR', 'INDOOR');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('ACTIVITY_NOT_VIABLE', 'ACTIVITY_VIABLE_AGAIN');

-- AlterTable
ALTER TABLE "Visit" ADD COLUMN     "cloudCover" DOUBLE PRECISION,
ADD COLUMN     "weatherCode" INTEGER,
ADD COLUMN     "windSpeed" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Activity" DROP COLUMN "date",
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "isViable" BOOLEAN,
ADD COLUMN     "type" "ActivityType" NOT NULL DEFAULT 'OUTDOOR',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "viabilityCheckedAt" TIMESTAMP(3);

-- Los defaults solo existen para rellenar filas previas; Prisma no los declara.
ALTER TABLE "Activity" ALTER COLUMN "type" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "Notification" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "activityId" INTEGER NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "message" VARCHAR(500) NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_activityId_idx" ON "Notification"("activityId");

-- CreateIndex
CREATE INDEX "Activity_visitId_isActive_idx" ON "Activity"("visitId", "isActive");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

