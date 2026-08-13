import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { exchangeCodeForTokens } from "@/lib/providers/google-calendar-provider";

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
    ?.match(/calendar_oauth_state=([^;]+)/)?.[1];

  if (!code || !state || state !== cookieState) {
    return NextResponse.redirect(
      new URL("/dashboard?calendar_error=invalid_state", request.url),
    );
  }

  try {
    const tokens = await exchangeCodeForTokens(code);

    await prisma.providerConnection.upsert({
      where: {
        userId_provider: { userId: user.id, provider: "google_calendar" },
      },
      create: {
        userId: user.id,
        provider: "google_calendar",
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
      },
      update: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
      },
    });
  } catch {
    return NextResponse.redirect(
      new URL("/dashboard?calendar_error=exchange_failed", request.url),
    );
  }

  const res = NextResponse.redirect(
    new URL("/dashboard?calendar_connected=1", request.url),
  );
  res.cookies.delete("calendar_oauth_state");
  return res;
}
