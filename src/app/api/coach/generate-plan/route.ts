import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generatePlan } from "@/lib/coach/plan-generator";

// Same reasoning as /api/coach/chat: withGeminiFallback's sequential model
// attempts plus calendar sync can exceed Vercel Hobby's default 5-10s
// function timeout.
export const maxDuration = 60;

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const plan = await generatePlan(user.id);
    return NextResponse.json({ plan });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Plan generation failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
