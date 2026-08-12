"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import type { GoalType } from "@/generated/prisma/enums";

const GOAL_TYPES: GoalType[] = ["distance", "pace", "time"];
const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export async function createGoal(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const type = formData.get("type");
  const targetValue = formData.get("targetValue");
  const targetDateRaw = formData.get("targetDate");
  const trainingDays = formData
    .getAll("trainingDays")
    .filter((d): d is string => typeof d === "string")
    .filter((d) => WEEKDAYS.includes(d));

  if (
    typeof type !== "string" ||
    !GOAL_TYPES.includes(type as GoalType) ||
    typeof targetValue !== "string" ||
    !targetValue.trim()
  ) {
    throw new Error("Invalid goal submission");
  }

  await prisma.goal.create({
    data: {
      userId: user.id,
      type: type as GoalType,
      targetValue: targetValue.trim(),
      targetDate:
        typeof targetDateRaw === "string" && targetDateRaw
          ? new Date(targetDateRaw)
          : null,
      trainingDays,
    },
  });

  redirect("/dashboard");
}
