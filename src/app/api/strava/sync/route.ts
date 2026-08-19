import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncStravaActivities } from "@/lib/providers/sync";

// Sync can now trigger a light-touch Gemini adjustment pass on top of the
// Strava fetch itself — same headroom reasoning as the chat/plan routes.
export const maxDuration = 60;

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await syncStravaActivities(user.id);

  if ("notConnected" in result) {
    return NextResponse.json(
      { error: "Strava is not connected" },
      { status: 400 },
    );
  }

  return NextResponse.json(result);
}
