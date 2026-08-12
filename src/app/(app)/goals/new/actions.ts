"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { parseClockDuration } from "@/lib/format";

const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export type GoalFormState = { error?: string };

export async function createGoal(
  _prevState: GoalFormState,
  formData: FormData,
): Promise<GoalFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const distanceKmRaw = formData.get("distanceKm");
  const timeRaw = formData.get("time");
  const targetDateRaw = formData.get("targetDate");
  const trainingDays = formData
    .getAll("trainingDays")
    .filter((d): d is string => typeof d === "string")
    .filter((d) => WEEKDAYS.includes(d));

  let targetDistanceMeters: number | null = null;
  if (typeof distanceKmRaw === "string" && distanceKmRaw.trim()) {
    const km = Number(distanceKmRaw);
    if (!Number.isFinite(km) || km <= 0) {
      return { error: "Distance must be a positive number" };
    }
    targetDistanceMeters = km * 1000;
  }

  let targetTimeSeconds: number | null = null;
  if (typeof timeRaw === "string" && timeRaw.trim()) {
    const seconds = parseClockDuration(timeRaw.trim());
    if (seconds === null || seconds <= 0) {
      return {
        error: `"${timeRaw.trim()}" isn't a valid time — use mm:ss (e.g. 45:00) or h:mm:ss (e.g. 1:30:00)`,
      };
    }
    targetTimeSeconds = seconds;
  }

  if (targetDistanceMeters === null && targetTimeSeconds === null) {
    return { error: "Enter at least a distance or a time" };
  }

  await prisma.goal.create({
    data: {
      userId: user.id,
      targetDistanceMeters,
      targetTimeSeconds,
      targetDate:
        typeof targetDateRaw === "string" && targetDateRaw
          ? new Date(targetDateRaw)
          : null,
      trainingDays,
    },
  });

  redirect("/dashboard");
}
