import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";

const GOAL_TYPE_LABEL: Record<string, string> = {
  distance: "Distance goal",
  pace: "Pace goal",
  time: "Time goal",
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Layout already guarantees `user` is set; this satisfies TypeScript.
  if (!user) return null;

  const goal = await prisma.goal.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-2xl font-bold">Welcome back, {user.email}</h1>

      {goal ? (
        <div className="mt-6 rounded-lg border border-black/10 p-5">
          <p className="text-sm font-medium text-black/50">
            {GOAL_TYPE_LABEL[goal.type] ?? "Goal"}
          </p>
          <p className="mt-1 text-xl font-semibold">{goal.targetValue}</p>
          {goal.targetDate && (
            <p className="mt-1 text-sm text-black/60">
              by {new Date(goal.targetDate).toLocaleDateString()}
            </p>
          )}
          {goal.trainingDays.length > 0 && (
            <p className="mt-3 text-sm text-black/60">
              Training days: {goal.trainingDays.join(", ")}
            </p>
          )}
          <Link
            href="/goals/new"
            className="mt-4 inline-block text-sm underline underline-offset-2"
          >
            Update goal
          </Link>
        </div>
      ) : (
        <div className="mt-6 rounded-lg border border-dashed border-black/20 p-5">
          <p className="text-black/60">No training goal set yet.</p>
          <Link
            href="/goals/new"
            className="mt-3 inline-block rounded-md bg-black px-4 py-2 text-sm font-medium text-white"
          >
            Set your first goal
          </Link>
        </div>
      )}

      <div className="mt-6 rounded-lg border border-black/10 p-5">
        <p className="font-medium">Talk to your coach</p>
        <p className="mt-1 text-sm text-black/60">
          Adaptive plan generation lands in Phase 2 — for now, go banter with
          the coach.
        </p>
        <Link
          href="/chat"
          className="mt-3 inline-block rounded-md border border-black/10 px-4 py-2 text-sm font-medium hover:bg-black/5"
        >
          Open chat
        </Link>
      </div>
    </div>
  );
}
