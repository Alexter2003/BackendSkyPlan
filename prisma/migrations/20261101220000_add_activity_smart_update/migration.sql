-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'ACTIVITY_AUTO_CANCELLED';

-- AlterTable
ALTER TABLE "Visit" ADD COLUMN     "hourlyForecast" JSONB;

-- AlterTable
ALTER TABLE "Activity" ADD COLUMN     "cancelReason" VARCHAR(500),
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "probability" INTEGER,
ADD COLUMN     "reactivatedAt" TIMESTAMP(3);
