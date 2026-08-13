import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import {
  formatDistance,
  formatPace,
  formatClockDuration,
} from "@/lib/format";
import { SyncStravaButton } from "./sync-strava-button";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Layout already guarantees `user` is set; this satisfies TypeScript.
  if (!user) return null;

  const [goal, stravaConnection, calendarConnection, recentActivities, activePlan] =
    await Promise.all([
      prisma.goal.findFirst({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
      }),
      prisma.providerConnection.findUnique({
        where: { userId_provider: { userId: user.id, provider: "strava" } },
      }),
      prisma.providerConnection.findUnique({
        where: {
          userId_provider: { userId: user.id, provider: "google_calendar" },
        },
      }),
      prisma.activity.findMany({
        where: { userId: user.id },
        orderBy: { date: "desc" },
        take: 5,
      }),
      prisma.trainingPlan.findFirst({
        where: { userId: user.id, status: "active" },
        orderBy: { generatedAt: "desc" },
      }),
    ]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-2xl font-bold">Welcome back, {user.email}</h1>

      {goal ? (
        <div className="mt-6 rounded-lg border border-black/10 p-5">
          <p className="text-sm font-medium text-black/50">Goal</p>
          <p className="mt-1 text-xl font-semibold">
            {[
              goal.targetDistanceMeters && formatDistance(goal.targetDistanceMeters),
              goal.targetTimeSeconds && formatClockDuration(goal.targetTimeSeconds),
            ]
              .filter(Boolean)
              .join(" in ")}
          </p>
          {goal.targetDistanceMeters && goal.targetTimeSeconds && (
            <p className="mt-1 text-sm text-black/60">
              ≈{" "}
              {formatPace(
                goal.targetTimeSeconds / (goal.targetDistanceMeters / 1000),
              )}{" "}
              pace
            </p>
          )}
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
          <div className="mt-4 flex items-center gap-4">
            <Link
              href="/goals/new"
              className="text-sm underline underline-offset-2"
            >
              Update goal
            </Link>
            <Link
              href="/plan"
              className="text-sm underline underline-offset-2"
            >
              {activePlan ? "View training plan" : "Generate training plan"}
            </Link>
          </div>
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
        <p className="font-medium">Strava</p>

        {stravaConnection ? (
          <>
            <p className="mt-1 text-sm text-black/60">Connected.</p>
            <div className="mt-3">
              <SyncStravaButton />
            </div>

            {recentActivities.length > 0 ? (
              <ul className="mt-4 divide-y divide-black/5">
                {recentActivities.map((a) => (
                  <li key={a.id} className="flex justify-between py-2 text-sm">
                    <span>{new Date(a.date).toLocaleDateString()}</span>
                    <span>{formatDistance(a.distanceMeters)}</span>
                    <span className="text-black/60">
                      {formatPace(a.avgPaceSecPerKm)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-black/40">
                No activities synced yet — hit sync.
              </p>
            )}
          </>
        ) : (
          <>
            <p className="mt-1 text-sm text-black/60">
              Connect Strava so the coach can see your actual runs.
            </p>
            <a
              href="/api/strava/connect"
              className="mt-3 inline-block rounded-md bg-black px-4 py-2 text-sm font-medium text-white"
            >
              Connect Strava
            </a>
          </>
        )}
      </div>

      <div className="mt-6 rounded-lg border border-black/10 p-5">
        <p className="font-medium">Google Calendar</p>

        {calendarConnection ? (
          <p className="mt-1 text-sm text-black/60">
            Connected — workouts sync to your calendar automatically
            whenever a plan is generated.
          </p>
        ) : (
          <>
            <p className="mt-1 text-sm text-black/60">
              Connect so scheduled workouts show up in your real calendar.
            </p>
            <a
              href="/api/calendar/connect"
              className="mt-3 inline-block rounded-md bg-black px-4 py-2 text-sm font-medium text-white"
            >
              Connect Google Calendar
            </a>
          </>
        )}
      </div>

      <div className="mt-6 rounded-lg border border-black/10 p-5">
        <p className="font-medium">Talk to your coach</p>
        <p className="mt-1 text-sm text-black/60">
          Ask about your plan, or just go banter.
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
