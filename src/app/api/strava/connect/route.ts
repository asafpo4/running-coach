import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { stravaProvider } from "@/lib/providers/strava-provider";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Random state, stored in a short-lived cookie, verified in the callback
  // — standard OAuth CSRF protection.
  const state = randomUUID();
  const res = NextResponse.redirect(stravaProvider.getAuthUrl(state));
  res.cookies.set("strava_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/",
  });
  return res;
}
