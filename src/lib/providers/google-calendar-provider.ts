// Google Calendar API v3 + OAuth2 — plain REST, no SDK needed. Unlike the
// fitness providers, this is a push target (we write events), not a pull
// source, so it doesn't implement FitnessProvider.

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI!;

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
};

export function getGoogleCalendarAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/calendar.events",
    access_type: "offline",
    // Forces Google to re-issue a refresh token even if this user already
    // granted access before — without this, a repeat auth can come back
    // with no refresh_token at all.
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: GOOGLE_REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    throw new Error(`Google token exchange failed: ${res.status}`);
  }
  const data = (await res.json()) as TokenResponse;
  if (!data.refresh_token) {
    throw new Error(
      "Google didn't return a refresh token — the OAuth consent screen may need `prompt=consent`",
    );
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
  };
}

export async function refreshAccessToken(
  refreshToken: string,
): Promise<{ accessToken: string; expiresAt: Date }> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    throw new Error(`Google token refresh failed: ${res.status}`);
  }
  const data = (await res.json()) as TokenResponse;
  return {
    accessToken: data.access_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
  };
}

export type CalendarEventInput = {
  summary: string;
  description?: string;
  /** YYYY-MM-DD — events are all-day, since we're scheduling a day's
   * workout, not presuming what hour the user wants to run. */
  date: string;
};

function toEventBody(input: CalendarEventInput) {
  const end = new Date(`${input.date}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 1); // Calendar API end date is exclusive
  return {
    summary: input.summary,
    description: input.description,
    start: { date: input.date },
    end: { date: end.toISOString().slice(0, 10) },
  };
}

export async function createCalendarEvent(
  accessToken: string,
  input: CalendarEventInput,
): Promise<string> {
  const res = await fetch(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(toEventBody(input)),
    },
  );
  if (!res.ok) {
    throw new Error(`Calendar event creation failed: ${res.status}`);
  }
  const data = (await res.json()) as { id: string };
  return data.id;
}

export async function updateCalendarEvent(
  accessToken: string,
  eventId: string,
  input: CalendarEventInput,
): Promise<void> {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(toEventBody(input)),
    },
  );
  if (!res.ok) {
    throw new Error(`Calendar event update failed: ${res.status}`);
  }
}

export async function deleteCalendarEvent(
  accessToken: string,
  eventId: string,
): Promise<void> {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } },
  );
  // 404/410 means it's already gone on Google's side — fine for our purposes.
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new Error(`Calendar event deletion failed: ${res.status}`);
  }
}
