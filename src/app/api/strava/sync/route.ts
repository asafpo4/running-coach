import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncStravaActivities } from "@/lib/providers/sync";

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
