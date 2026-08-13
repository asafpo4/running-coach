import { prisma } from "@/lib/db";
import {
  refreshAccessToken,
  createCalendarEvent,
  deleteCalendarEvent,
} from "./google-calendar-provider";
import { formatDistance, formatPace, toLocalDateKey } from "@/lib/format";

const TOKEN_REFRESH_SKEW_MS = 5 * 60 * 1000;

const WORKOUT_TYPE_LABEL: Record<string, string> = {
  easy: "Easy run",
  tempo: "Tempo run",
  interval: "Interval workout",
  long: "Long run",
  rest: "Rest day",
};

async function getValidAccessToken(userId: string): Promise<string | null> {
  const connection = await prisma.providerConnection.findUnique({
    where: { userId_provider: { userId, provider: "google_calendar" } },
  });
  if (!connection) return null;

  const isExpired =
    connection.expiresAt &&
    connection.expiresAt.getTime() - TOKEN_REFRESH_SKEW_MS < Date.now();

  if (isExpired) {
    const refreshed = await refreshAccessToken(connection.refreshToken!);
    await prisma.providerConnection.update({
      where: { id: connection.id },
      data: {
        accessToken: refreshed.accessToken,
        expiresAt: refreshed.expiresAt,
      },
    });
    return refreshed.accessToken;
  }

  return connection.accessToken;
}

/**
 * Deletes the still-upcoming calendar events tied to a plan that's about to
 * be superseded, so regenerating a plan doesn't leave stale/duplicate
 * events behind alongside the new ones for the same dates.
 */
export async function removeFutureCalendarEvents(
  userId: string,
  planId: string,
): Promise<void> {
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) return;

  const workouts = await prisma.plannedWorkout.findMany({
    where: { planId, calendarEventId: { not: null }, date: { gte: new Date() } },
  });

  for (const workout of workouts) {
    await deleteCalendarEvent(accessToken, workout.calendarEventId!);
  }
}

/**
 * No-op if the user hasn't connected Google Calendar — calendar sync is
 * opt-in, plan generation always works without it.
 */
export async function syncPlanToCalendar(
  userId: string,
  planId: string,
): Promise<void> {
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) return;

  const workouts = await prisma.plannedWorkout.findMany({ where: { planId } });

  for (const workout of workouts) {
    const label = WORKOUT_TYPE_LABEL[workout.type] ?? workout.type;
    const details = [
      workout.targetDistanceMeters && formatDistance(workout.targetDistanceMeters),
      workout.targetPaceSecPerKm && formatPace(workout.targetPaceSecPerKm),
    ]
      .filter(Boolean)
      .join(", ");

    const eventId = await createCalendarEvent(accessToken, {
      summary: `🏃 ${label}${details ? ` — ${details}` : ""}`,
      description: "Scheduled by your AI running coach.",
      date: toLocalDateKey(workout.date),
    });

    await prisma.plannedWorkout.update({
      where: { id: workout.id },
      data: { calendarEventId: eventId },
    });
  }
}
