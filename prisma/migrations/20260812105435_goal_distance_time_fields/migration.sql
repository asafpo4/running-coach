-- AlterTable
ALTER TABLE "goals" DROP COLUMN "target_value",
DROP COLUMN "type",
ADD COLUMN     "target_distance_meters" DOUBLE PRECISION,
ADD COLUMN     "target_time_seconds" INTEGER;

-- DropEnum
DROP TYPE "GoalType";
