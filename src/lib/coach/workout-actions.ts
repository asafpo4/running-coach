import { Type, type FunctionDeclaration } from "@google/genai";
import { prisma } from "@/lib/db";
import { toLocalDateKey } from "@/lib/format";
import { syncSingleWorkoutToCalendar } from "@/lib/providers/calendar-sync";
import type { WorkoutType } from "@/generated/prisma/enums";

const WORKOUT_TYPES: WorkoutType[] = [
  "easy",
  "tempo",
  "interval",
  "long",
  "rest",
];

export const WORKOUT_TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: "rescheduleWorkout",
    description:
      "Move a scheduled workout from its current date to a different date, keeping its type and target the same. Use when the user wants to do a planned workout on a different day than currently scheduled.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        date: {
          type: Type.STRING,
          description: "Current date of the workout to move, format YYYY-MM-DD",
        },
        newDate: {
          type: Type.STRING,
          description: "New date to move it to, format YYYY-MM-DD",
        },
      },
      required: ["date", "newDate"],
    },
  },
  {
    name: "swapWorkoutType",
    description:
      "Change the type of a scheduled workout (e.g. swap a tempo run for an easy run) without changing its date.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        date: {
          type: Type.STRING,
          description: "Date of the workout to change, format YYYY-MM-DD",
        },
        newType: {
          type: Type.STRING,
          enum: WORKOUT_TYPES,
          description: "The new workout type",
        },
      },
      required: ["date", "newType"],
    },
  },
  {
    name: "skipWorkout",
    description:
      "Mark a scheduled workout as skipped, turning it into a rest day, instead of doing it as planned.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        date: {
          type: Type.STRING,
          description: "Date of the workout to skip, format YYYY-MM-DD",
        },
      },
      required: ["date"],
    },
  },
];

type ActionResult = { success: boolean; message: string };

function parseDateArg(value: unknown): string | null {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value
    : null;
}

async function findActiveWorkoutByDate(userId: string, dateStr: string) {
  const plan = await prisma.trainingPlan.findFirst({
    where: { userId, status: "active" },
    orderBy: { generatedAt: "desc" },
    include: { workouts: true },
  });
  if (!plan) return null;
  return plan.workouts.find((w) => toLocalDateKey(w.date) === dateStr) ?? null;
}

async function rescheduleWorkout(
  userId: string,
  args: Record<string, unknown>,
): Promise<ActionResult> {
  const date = parseDateArg(args.date);
  const newDate = parseDateArg(args.newDate);
  if (!date || !newDate) {
    return { success: false, message: "date and newDate must both be YYYY-MM-DD." };
  }

  const workout = await findActiveWorkoutByDate(userId, date);
  if (!workout) {
    return { success: false, message: `No scheduled workout found on ${date}.` };
  }

  await prisma.plannedWorkout.update({
    where: { id: workout.id },
    data: { date: new Date(`${newDate}T00:00:00`) },
  });
  await syncSingleWorkoutToCalendar(userId, workout.id);

  return {
    success: true,
    message: `Moved the ${workout.type} run from ${date} to ${newDate}.`,
  };
}

async function swapWorkoutType(
  userId: string,
  args: Record<string, unknown>,
): Promise<ActionResult> {
  const date = parseDateArg(args.date);
  const newType = typeof args.newType === "string" ? args.newType : "";
  if (!date) {
    return { success: false, message: "date must be YYYY-MM-DD." };
  }
  if (!WORKOUT_TYPES.includes(newType as WorkoutType)) {
    return {
      success: false,
      message: `newType must be one of: ${WORKOUT_TYPES.join(", ")}.`,
    };
  }

  const workout = await findActiveWorkoutByDate(userId, date);
  if (!workout) {
    return { success: false, message: `No scheduled workout found on ${date}.` };
  }

  const isRest = newType === "rest";
  await prisma.plannedWorkout.update({
    where: { id: workout.id },
    data: {
      type: newType as WorkoutType,
      targetDistanceMeters: isRest ? null : workout.targetDistanceMeters,
      targetPaceSecPerKm: isRest ? null : workout.targetPaceSecPerKm,
    },
  });
  await syncSingleWorkoutToCalendar(userId, workout.id);

  return {
    success: true,
    message: `Changed ${date} from ${workout.type} to ${newType}.`,
  };
}

async function skipWorkout(
  userId: string,
  args: Record<string, unknown>,
): Promise<ActionResult> {
  return swapWorkoutType(userId, { date: args.date, newType: "rest" });
}

export const WORKOUT_TOOL_HANDLERS: Record<
  string,
  (userId: string, args: Record<string, unknown>) => Promise<ActionResult>
> = {
  rescheduleWorkout,
  swapWorkoutType,
  skipWorkout,
};
