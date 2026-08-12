import type {
  FitnessProvider,
  NormalizedActivity,
} from "./fitness-provider";

// Strava's REST API is plain OAuth2 + JSON — no SDK needed.
// Docs: https://developers.strava.com/docs/reference/

const STRAVA_CLIENT_ID = process.env.STRAVA_CLIENT_ID!;
const STRAVA_CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET!;
const STRAVA_REDIRECT_URI = process.env.STRAVA_REDIRECT_URI!;

type StravaTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_at: number; // unix seconds
  athlete?: { id: number };
};

type StravaActivity = {
  id: number;
  type: string; // "Run", "Ride", ...
  start_date: string;
  distance: number; // meters
  moving_time: number; // seconds
  average_heartrate?: number;
  total_elevation_gain?: number;
};

function toNormalizedActivity(a: StravaActivity): NormalizedActivity {
  return {
    providerActivityId: String(a.id),
    date: new Date(a.start_date),
    distanceMeters: a.distance,
    durationSeconds: a.moving_time,
    avgPaceSecPerKm:
      a.distance > 0 ? a.moving_time / (a.distance / 1000) : null,
    avgHeartRate: a.average_heartrate ? Math.round(a.average_heartrate) : null,
    elevationGainM: a.total_elevation_gain ?? null,
    raw: a,
  };
}

export const stravaProvider: FitnessProvider = {
  getAuthUrl(state) {
    const params = new URLSearchParams({
      client_id: STRAVA_CLIENT_ID,
      redirect_uri: STRAVA_REDIRECT_URI,
      response_type: "code",
      approval_prompt: "auto",
      scope: "read,activity:read_all",
      state,
    });
    return `https://www.strava.com/oauth/authorize?${params.toString()}`;
  },

  async exchangeCodeForTokens(code) {
    const res = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: STRAVA_CLIENT_ID,
        client_secret: STRAVA_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
      }),
    });
    if (!res.ok) {
      throw new Error(`Strava token exchange failed: ${res.status}`);
    }
    const data = (await res.json()) as StravaTokenResponse;
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(data.expires_at * 1000),
      providerAthleteId: data.athlete ? String(data.athlete.id) : null,
    };
  },

  async refreshAccessToken(refreshToken) {
    const res = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: STRAVA_CLIENT_ID,
        client_secret: STRAVA_CLIENT_SECRET,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });
    if (!res.ok) {
      throw new Error(`Strava token refresh failed: ${res.status}`);
    }
    const data = (await res.json()) as StravaTokenResponse;
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(data.expires_at * 1000),
    };
  },

  async listActivities(accessToken, since) {
    const params = new URLSearchParams({ per_page: "50" });
    if (since) {
      params.set("after", String(Math.floor(since.getTime() / 1000)));
    }
    const res = await fetch(
      `https://www.strava.com/api/v3/athlete/activities?${params.toString()}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) {
      throw new Error(`Strava activities fetch failed: ${res.status}`);
    }
    const activities = (await res.json()) as StravaActivity[];
    return activities
      .filter((a) => a.type === "Run")
      .map(toNormalizedActivity);
  },
};
