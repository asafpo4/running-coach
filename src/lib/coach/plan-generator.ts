import { Type } from "@google/genai";
import { prisma } from "@/lib/db";
import { genai, withGeminiFallback } from "./gemini-client";
import { buildGoalSummary } from "./persona-prompt";
import {
  removeFutureCalendarEvents,
  syncPlanToCalendar,
  syncSingleWorkoutToCalendar,
} from "@/lib/providers/calendar-sync";
import {
  toLocalDateKey as toDateKey,
  formatDistance,
  formatPace,
} from "@/lib/format";
import type { WorkoutType } from "@/generated/prisma/enums";

const WEEKDAY_BY_INDEX = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const PLAN_HORIZON_DAYS = 7;
const WORKOUT_TYPES: WorkoutType[] = [
  "easy",
  "tempo",
  "interval",
  "long",
  "rest",
];

/**
 * LLMs are unreliable at date arithmetic, so the calendar dates for the
 * upcoming plan are computed here, not left to Gemini. The model only
 * decides what to do on each given date.
 */
function getUpcomingTrainingDates(trainingDays: string[]): Date[] {
  const dates: Date[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 1; i <= PLAN_HORIZON_DAYS; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    if (trainingDays.includes(WEEKDAY_BY_INDEX[d.getDay()])) {
      dates.push(d);
    }
  }
  return dates;
}

/**
 * Links past PlannedWorkouts to the Activity that fulfilled them (same user,
 * same calendar date), so adherence can be computed and shown to Gemini.
 * Safe to call repeatedly — only touches workouts that aren't linked yet.
 * Returns the number of workouts newly matched by this call, so callers
 * can tell whether there's fresh completion data worth reacting to.
 */
export async function matchCompletedWorkouts(userId: string): Promise<number> {
  // Scoped to the active plan only — retired plans don't need retroactive
  // completion tracking, and including them let two workouts from
  // different plan versions land on the same date and both try to claim
  // the same activity, which fails since completedActivityId is unique.
  const unmatched = await prisma.plannedWorkout.findMany({
    where: {
      completedActivityId: null,
      date: { lte: new Date() },
      plan: { userId, status: "active" },
    },
  });
  if (unmatched.length === 0) return 0;

  const activities = await prisma.activity.findMany({
    where: { userId },
    orderBy: { date: "desc" },
  });
  const activityByDateKey = new Map(
    activities.map((a) => [toDateKey(a.date), a]),
  );

  // Defense in depth: don't let two workouts in this same run claim the
  // same activity either.
  const alreadyClaimed = await prisma.plannedWorkout.findMany({
    where: { completedActivityId: { not: null }, plan: { userId } },
    select: { completedActivityId: true },
  });
  const claimedActivityIds = new Set(
    alreadyClaimed.map((w) => w.completedActivityId!),
  );

  let newlyMatched = 0;
  for (const workout of unmatched) {
    const match = activityByDateKey.get(toDateKey(workout.date));
    if (match && !claimedActivityIds.has(match.id)) {
      await prisma.plannedWorkout.update({
        where: { id: workout.id },
        data: { completedActivityId: match.id },
      });
      claimedActivityIds.add(match.id);
      newlyMatched++;
    }
  }
  return newlyMatched;
}

async function buildContext(userId: string, goalId: string) {
  const goal = await prisma.goal.findUniqueOrThrow({ where: { id: goalId } });

  const recentActivities = await prisma.activity.findMany({
    where: {
      userId,
      date: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
    },
    orderBy: { date: "desc" },
  });

  // Scoped by userId only, not goalId — a user should only ever have one
  // active plan at a time. Scoping by goalId let a plan for an old goal
  // survive un-retired whenever a new goal replaced it, since the lookup
  // for "what to retire" would never see it.
  const previousPlan = await prisma.trainingPlan.findFirst({
    where: { userId, status: "active" },
    orderBy: { generatedAt: "desc" },
    include: { workouts: true },
  });

  const activitySummary =
    recentActivities.length > 0
      ? recentActivities
          .map(
            (a) =>
              `${toDateKey(a.date)}: ${(a.distanceMeters / 1000).toFixed(1)}km` +
              (a.avgPaceSecPerKm
                ? ` @ ${Math.floor(a.avgPaceSecPerKm / 60)}:${Math.round(a.avgPaceSecPerKm % 60)
                    .toString()
                    .padStart(2, "0")}/km`
                : "") +
              (a.avgHeartRate ? `, avg HR ${a.avgHeartRate}` : ""),
          )
          .join("\n")
      : "No synced activities in the last 14 days.";

  let adherenceSummary = "This is the user's first plan.";
  if (previousPlan) {
    const past = previousPlan.workouts.filter((w) => w.date <= new Date());
    const done = past.filter((w) => w.completedActivityId).length;
    adherenceSummary =
      past.length > 0
        ? `Previous plan: ${done}/${past.length} scheduled workouts completed.`
        : "Previous plan just started, no adherence data yet.";
  }

  return { goal, activitySummary, adherenceSummary, previousPlan };
}

const PLAN_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    workouts: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          date: {
            type: Type.STRING,
            description: "YYYY-MM-DD, must exactly match one of the given dates",
          },
          workoutType: {
            type: Type.STRING,
            enum: WORKOUT_TYPES,
          },
          targetDistanceMeters: { type: Type.NUMBER },
          targetPaceSecPerKm: { type: Type.NUMBER },
        },
        required: ["date", "workoutType"],
      },
    },
  },
  required: ["workouts"],
};

type PlanResponse = {
  workouts: {
    date: string;
    workoutType: WorkoutType;
    targetDistanceMeters?: number;
    targetPaceSecPerKm?: number;
  }[];
};

export async function generatePlan(userId: string) {
  const goal = await prisma.goal.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  if (!goal) throw new Error("No goal set");

  await matchCompletedWorkouts(userId);
  const { activitySummary, adherenceSummary, previousPlan } =
    await buildContext(userId, goal.id);

  const targetDates = getUpcomingTrainingDates(goal.trainingDays);
  if (targetDates.length === 0) {
    throw new Error("Goal has no training days selected");
  }
  const dateKeys = targetDates.map(toDateKey);

  const prompt = `
Build a ${PLAN_HORIZON_DAYS}-day running plan for one runner.

Goal: ${buildGoalSummary(goal)}.

Recent activity (last 14 days):
${activitySummary}

Adherence: ${adherenceSummary}

Assign exactly one workout to each of these dates (do not add or skip dates):
${dateKeys.join(", ")}

Vary workout types sensibly (easy, tempo, interval, long, rest) given the
goal and recent training load — don't schedule back-to-back hard days, and
scale volume to what the recent activity actually shows the runner can
handle. Weigh heart rate relative to pace, not pace alone: a high HR at an
easy pace signals lower current fitness or fatigue and calls for a more
conservative plan, while a low HR at that same pace signals room to push
harder. Omit targetDistanceMeters/targetPaceSecPerKm for rest days.
`.trim();

  let response;
  try {
    response = await withGeminiFallback((model) =>
      genai.models.generateContent({
        model,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: PLAN_RESPONSE_SCHEMA,
        },
      }),
    );
  } catch {
    throw new Error(
      "Gemini's free tier is overloaded right now — wait a minute and try generating the plan again.",
    );
  }

  const parsed = JSON.parse(response.text ?? "{}") as Partial<PlanResponse>;
  const byDate = new Map((parsed.workouts ?? []).map((w) => [w.date, w]));

  const finalWorkouts = targetDates.map((date) => {
    const key = toDateKey(date);
    const fromModel = byDate.get(key);
    return {
      date,
      type: (fromModel?.workoutType ?? "easy") as WorkoutType,
      targetDistanceMeters: fromModel?.targetDistanceMeters ?? null,
      targetPaceSecPerKm: fromModel?.targetPaceSecPerKm ?? null,
    };
  });

  // Calendar events for the plan being replaced would otherwise sit
  // alongside the new plan's events on the same dates — clean those up
  // before creating the new ones. A network call, so it happens outside
  // the DB transaction below.
  if (previousPlan) {
    try {
      await removeFutureCalendarEvents(userId, previousPlan.id);
    } catch (err) {
      console.error("Calendar cleanup failed for plan", previousPlan.id, err);
    }
  }

  const newPlan = await prisma.$transaction(async (tx) => {
    if (previousPlan) {
      await tx.trainingPlan.update({
        where: { id: previousPlan.id },
        data: { status: "completed" },
      });
    }

    const plan = await tx.trainingPlan.create({
      data: {
        userId,
        goalId: goal.id,
        status: "active",
        version: (previousPlan?.version ?? 0) + 1,
      },
    });

    await tx.plannedWorkout.createMany({
      data: finalWorkouts.map((w) => ({
        planId: plan.id,
        date: w.date,
        type: w.type,
        targetDistanceMeters: w.targetDistanceMeters,
        targetPaceSecPerKm: w.targetPaceSecPerKm,
      })),
    });

    return tx.trainingPlan.findUniqueOrThrow({
      where: { id: plan.id },
      include: { workouts: { orderBy: { date: "asc" } } },
    });
  });

  // Opt-in and best-effort: syncPlanToCalendar no-ops if the user hasn't
  // connected Google Calendar. Plan generation has already succeeded by
  // this point regardless, so a Calendar API hiccup shouldn't surface as a
  // plan-generation failure.
  try {
    await syncPlanToCalendar(userId, newPlan.id);
  } catch (err) {
    console.error("Calendar sync failed for plan", newPlan.id, err);
  }

  return newPlan;
}

const ADJUSTMENT_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    adjustments: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          date: {
            type: Type.STRING,
            description: "YYYY-MM-DD, must exactly match one of the given upcoming dates",
          },
          targetDistanceMeters: { type: Type.NUMBER },
          targetPaceSecPerKm: { type: Type.NUMBER },
        },
        required: ["date"],
      },
      description:
        "Only include dates that genuinely need a tweak. Leave dates out entirely if the result doesn't change anything for them.",
    },
  },
  required: ["adjustments"],
};

type AdjustmentResponse = {
  adjustments: {
    date: string;
    targetDistanceMeters?: number;
    targetPaceSecPerKm?: number;
  }[];
};

/**
 * Light-touch reaction to a single newly-completed workout: only nudges the
 * *targets* (distance/pace) of the still-upcoming workouts in the active
 * plan, never their dates or types. This is deliberately much smaller than
 * generatePlan()'s full reshuffle — it runs automatically after every
 * Strava sync that picks up a new completion, so it needs to feel like a
 * minor correction, not the week being rebuilt out from under the user.
 * Best-effort: callers should treat failures as non-fatal.
 */
export async function adjustUpcomingWorkouts(userId: string): Promise<void> {
  const activePlan = await prisma.trainingPlan.findFirst({
    where: { userId, status: "active" },
    orderBy: { generatedAt: "desc" },
    include: { workouts: { orderBy: { date: "asc" } }, goal: true },
  });
  if (!activePlan) return;

  const upcoming = activePlan.workouts.filter(
    (w) => !w.completedActivityId && w.date > new Date() && w.type !== "rest",
  );
  if (upcoming.length === 0) return;

  const lastCompleted = activePlan.workouts
    .filter((w) => w.completedActivityId)
    .sort((a, b) => b.date.getTime() - a.date.getTime())[0];
  if (!lastCompleted) return;

  const activity = await prisma.activity.findUnique({
    where: { id: lastCompleted.completedActivityId! },
  });
  if (!activity) return;

  const targetDesc = [
    lastCompleted.targetDistanceMeters && formatDistance(lastCompleted.targetDistanceMeters),
    lastCompleted.targetPaceSecPerKm && formatPace(lastCompleted.targetPaceSecPerKm),
  ]
    .filter(Boolean)
    .join(" @ ");
  const actualDesc = [
    formatDistance(activity.distanceMeters),
    formatPace(activity.avgPaceSecPerKm),
    activity.avgHeartRate ? `avg HR ${activity.avgHeartRate}` : null,
  ]
    .filter(Boolean)
    .join(" @ ");

  const prompt = `
The runner just completed a scheduled ${lastCompleted.type} run (${toDateKey(lastCompleted.date)}).
Target: ${targetDesc || "no specific target"}.
Actual: ${actualDesc}.

Goal: ${buildGoalSummary(activePlan.goal)}.

Upcoming scheduled workouts (do not add, remove, or reassign dates/types —
only decide whether each one's target distance/pace should shift slightly
based on this single result):
${upcoming
  .map((w) => {
    const t = [
      w.targetDistanceMeters && formatDistance(w.targetDistanceMeters),
      w.targetPaceSecPerKm && formatPace(w.targetPaceSecPerKm),
    ]
      .filter(Boolean)
      .join(" @ ");
    return `${toDateKey(w.date)}: ${w.type}${t ? `, currently ${t}` : ""}`;
  })
  .join("\n")}

This is one data point, not a full replan — most upcoming workouts should
probably stay exactly as they are. Only adjust ones where this result is a
real signal (e.g. noticeably harder or easier than the target pace/HR
suggested), and keep changes modest.
`.trim();

  let response;
  try {
    response = await withGeminiFallback((model) =>
      genai.models.generateContent({
        model,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: ADJUSTMENT_RESPONSE_SCHEMA,
        },
      }),
    );
  } catch (err) {
    console.error("Post-workout adjustment failed for user", userId, err);
    return;
  }

  const parsed = JSON.parse(response.text ?? "{}") as Partial<AdjustmentResponse>;
  const upcomingByDate = new Map(upcoming.map((w) => [toDateKey(w.date), w]));

  for (const adj of parsed.adjustments ?? []) {
    const workout = upcomingByDate.get(adj.date);
    if (!workout) continue;

    await prisma.plannedWorkout.update({
      where: { id: workout.id },
      data: {
        targetDistanceMeters: adj.targetDistanceMeters ?? workout.targetDistanceMeters,
        targetPaceSecPerKm: adj.targetPaceSecPerKm ?? workout.targetPaceSecPerKm,
      },
    });

    try {
      await syncSingleWorkoutToCalendar(userId, workout.id);
    } catch (err) {
      console.error("Calendar sync failed for adjusted workout", workout.id, err);
    }
  }
}
