// Common shape every fitness data source (Strava now, Garmin later) must
// implement, so the rest of the app never branches on provider type.

export type NormalizedActivity = {
  providerActivityId: string;
  date: Date;
  distanceMeters: number;
  durationSeconds: number;
  avgPaceSecPerKm: number | null;
  avgHeartRate: number | null;
  elevationGainM: number | null;
  raw: unknown;
};

export interface FitnessProvider {
  /** URL to send the user to, to start the OAuth connect flow. */
  getAuthUrl(state: string): string;

  /** Exchange an OAuth callback code for stored tokens. */
  exchangeCodeForTokens(code: string): Promise<{
    accessToken: string;
    refreshToken: string | null;
    expiresAt: Date | null;
    providerAthleteId: string | null;
  }>;

  /** Exchange a stored refresh token for a new access token. */
  refreshAccessToken(refreshToken: string): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresAt: Date;
  }>;

  /** Fetch activities newer than `since` for an already-connected user. */
  listActivities(
    accessToken: string,
    since?: Date,
  ): Promise<NormalizedActivity[]>;
}
