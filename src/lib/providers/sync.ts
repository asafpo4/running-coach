import { prisma } from "@/lib/db";
import { stravaProvider } from "./strava-provider";
import { matchCompletedWorkouts } from "@/lib/coach/plan-generator";

const TOKEN_REFRESH_SKEW_MS = 5 * 60 * 1000; // refresh 5 min before actual expiry

// Always re-fetch this whole window on every sync, rather than using "since
// the last synced activity's date" as a cursor. That cursor approach breaks
// as soon as you edit your most-recent activity: its date doesn't change,
// so Strava's `after` filter (exclusive) excludes it from every subsequent
// fetch and the edit is never picked up. Re-fetching a window is simpler,
// self-healing for edits, and cheap enough at this app's scale.
const SYNC_LOOKBACK_DAYS = 90;

export async function syncStravaActivities(
  userId: string,
): Promise<{ synced: number } | { notConnected: true }> {
  const connection = await prisma.providerConnection.findUnique({
    where: { userId_provider: { userId, provider: "strava" } },
  });

  if (!connection) return { notConnected: true };

  let accessToken = connection.accessToken;

  const isExpired =
    connection.expiresAt &&
    connection.expiresAt.getTime() - TOKEN_REFRESH_SKEW_MS < Date.now();

  if (isExpired && connection.refreshToken) {
    const refreshed = await stravaProvider.refreshAccessToken(
      connection.refreshToken,
    );
    accessToken = refreshed.accessToken;
    await prisma.providerConnection.update({
      where: { id: connection.id },
      data: {
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
        expiresAt: refreshed.expiresAt,
      },
    });
  }

  const lookback = new Date(
    Date.now() - SYNC_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
  );

  const activities = await stravaProvider.listActivities(accessToken, lookback);

  for (const activity of activities) {
    await prisma.activity.upsert({
      where: {
        provider_providerActivityId: {
          provider: "strava",
          providerActivityId: activity.providerActivityId,
        },
      },
      create: {
        userId,
        provider: "strava",
        providerActivityId: activity.providerActivityId,
        date: activity.date,
        distanceMeters: activity.distanceMeters,
        durationSeconds: activity.durationSeconds,
        avgPaceSecPerKm: activity.avgPaceSecPerKm,
        avgHeartRate: activity.avgHeartRate,
        elevationGainM: activity.elevationGainM,
        raw: activity.raw as object,
      },
      update: {
        distanceMeters: activity.distanceMeters,
        durationSeconds: activity.durationSeconds,
        avgPaceSecPerKm: activity.avgPaceSecPerKm,
        avgHeartRate: activity.avgHeartRate,
        elevationGainM: activity.elevationGainM,
        raw: activity.raw as object,
      },
    });
  }

  // Reconcile deletions: anything we'd previously synced inside this same
  // window that Strava no longer reports (deleted or edited-then-merged on
  // their side) should be removed here too, not left behind as a stale
  // ghost record. completedActivityId references SET NULL automatically.
  const currentIds = activities.map((a) => a.providerActivityId);
  await prisma.activity.deleteMany({
    where: {
      userId,
      provider: "strava",
      date: { gte: lookback },
      providerActivityId: { notIn: currentIds },
    },
  });

  await matchCompletedWorkouts(userId);

  return { synced: activities.length };
}
