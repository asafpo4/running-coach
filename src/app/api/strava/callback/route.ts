import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { stravaProvider } from "@/lib/providers/strava-provider";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const cookieState = request.headers
    .get("cookie")
    ?.match(/strava_oauth_state=([^;]+)/)?.[1];

  if (!code || !state || state !== cookieState) {
    return NextResponse.redirect(
      new URL("/dashboard?strava_error=invalid_state", request.url),
    );
  }

  const tokens = await stravaProvider.exchangeCodeForTokens(code);

  await prisma.providerConnection.upsert({
    where: { userId_provider: { userId: user.id, provider: "strava" } },
    create: {
      userId: user.id,
      provider: "strava",
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      providerAthleteId: tokens.providerAthleteId,
    },
    update: {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      providerAthleteId: tokens.providerAthleteId,
    },
  });

  const res = NextResponse.redirect(
    new URL("/dashboard?strava_connected=1", request.url),
  );
  res.cookies.delete("strava_oauth_state");
  return res;
}
