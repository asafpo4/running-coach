import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { formatDistance, formatPace } from "@/lib/format";
import { GeneratePlanButton } from "./generate-plan-button";

const WORKOUT_TYPE_LABEL: Record<string, string> = {
  easy: "Easy run",
  tempo: "Tempo",
  interval: "Intervals",
  long: "Long run",
  rest: "Rest",
};

export default async function PlanPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const goal = await prisma.goal.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });

  if (!goal) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <h1 className="text-2xl font-bold">Training plan</h1>
        <p className="mt-2 text-black/60">
          You need a goal before the coach can build a plan.
        </p>
        <Link
          href="/goals/new"
          className="mt-4 inline-block rounded-md bg-black px-4 py-2 text-sm font-medium text-white"
        >
          Set a goal
        </Link>
      </div>
    );
  }

  const activePlan = await prisma.trainingPlan.findFirst({
    where: { userId: user.id, goalId: goal.id, status: "active" },
    orderBy: { generatedAt: "desc" },
    include: { workouts: { orderBy: { date: "asc" } } },
  });

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Training plan</h1>
        <GeneratePlanButton
          label={activePlan ? "Regenerate plan" : "Generate plan"}
        />
      </div>

      {!activePlan && (
        <p className="mt-4 text-sm text-black/60">
          No plan yet. Generating pulls in your synced Strava activities (if
          connected) so it's built around what you've actually been doing.
        </p>
      )}

      {activePlan && (
        <ul className="mt-6 divide-y divide-black/10 rounded-lg border border-black/10">
          {activePlan.workouts.map((w) => (
            <li key={w.id} className="flex items-center justify-between p-4">
              <div>
                <p className="font-medium">
                  {new Date(w.date).toLocaleDateString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                </p>
                <p className="text-sm text-black/60">
                  {WORKOUT_TYPE_LABEL[w.type] ?? w.type}
                </p>
              </div>
              <div className="text-right text-sm text-black/60">
                {w.targetDistanceMeters && (
                  <p>{formatDistance(w.targetDistanceMeters)}</p>
                )}
                {w.targetPaceSecPerKm && (
                  <p>{formatPace(w.targetPaceSecPerKm)}</p>
                )}
                {w.completedActivityId && (
                  <p className="text-green-600">Done ✓</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
