-- CreateEnum
CREATE TYPE "ProviderType" AS ENUM ('strava', 'garmin', 'google_calendar');

-- CreateEnum
CREATE TYPE "GoalType" AS ENUM ('distance', 'pace', 'time');

-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('active', 'completed', 'abandoned');

-- CreateEnum
CREATE TYPE "WorkoutType" AS ENUM ('easy', 'tempo', 'interval', 'long', 'rest');

-- CreateEnum
CREATE TYPE "ChatRole" AS ENUM ('user', 'coach');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goals" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "GoalType" NOT NULL,
    "target_value" TEXT NOT NULL,
    "target_date" TIMESTAMP(3),
    "training_days" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_connections" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider" "ProviderType" NOT NULL,
    "access_token" TEXT NOT NULL,
    "refresh_token" TEXT,
    "expires_at" TIMESTAMP(3),
    "provider_athlete_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activities" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider" "ProviderType" NOT NULL,
    "provider_activity_id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "distance_meters" DOUBLE PRECISION NOT NULL,
    "duration_seconds" INTEGER NOT NULL,
    "avg_pace_sec_per_km" DOUBLE PRECISION,
    "avg_heart_rate" INTEGER,
    "elevation_gain_m" DOUBLE PRECISION,
    "raw" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_plans" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "goal_id" TEXT NOT NULL,
    "status" "PlanStatus" NOT NULL DEFAULT 'active',
    "version" INTEGER NOT NULL DEFAULT 1,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "training_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planned_workouts" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "type" "WorkoutType" NOT NULL,
    "target_distance_meters" DOUBLE PRECISION,
    "target_pace_sec_per_km" DOUBLE PRECISION,
    "completed_activity_id" TEXT,
    "calendar_event_id" TEXT,

    CONSTRAINT "planned_workouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "ChatRole" NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "provider_connections_user_id_provider_key" ON "provider_connections"("user_id", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "activities_provider_provider_activity_id_key" ON "activities"("provider", "provider_activity_id");

-- CreateIndex
CREATE UNIQUE INDEX "planned_workouts_completed_activity_id_key" ON "planned_workouts"("completed_activity_id");

-- AddForeignKey
ALTER TABLE "goals" ADD CONSTRAINT "goals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_connections" ADD CONSTRAINT "provider_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_plans" ADD CONSTRAINT "training_plans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_plans" ADD CONSTRAINT "training_plans_goal_id_fkey" FOREIGN KEY ("goal_id") REFERENCES "goals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planned_workouts" ADD CONSTRAINT "planned_workouts_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "training_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planned_workouts" ADD CONSTRAINT "planned_workouts_completed_activity_id_fkey" FOREIGN KEY ("completed_activity_id") REFERENCES "activities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
