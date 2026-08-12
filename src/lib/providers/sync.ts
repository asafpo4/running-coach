import { prisma } from "@/lib/db";
import { stravaProvider } from "./strava-provider";
import { matchCompletedWorkouts } from "@/lib/coach/plan-generator";

const TOKEN_REFRESH_SKEW_MS = 5 * 60 * 1000; // refresh 5 min before actual expiry

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

  const latestActivity = await prisma.activity.findFirst({
    where: { userId, provider: "strava" },
    orderBy: { date: "desc" },
  });

  const activities = await stravaProvider.listActivities(
    accessToken,
    latestActivity?.date ?? connection.createdAt,
  );

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

  await matchCompletedWorkouts(userId);

  return { synced: activities.length };
}
