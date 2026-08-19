import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { genai, withGeminiFallback } from "@/lib/coach/gemini-client";
import {
  PERSONA_SYSTEM_INSTRUCTION,
  buildContextPreamble,
  buildGoalSummary,
} from "@/lib/coach/persona-prompt";
import { matchCompletedWorkouts } from "@/lib/coach/plan-generator";

// Default Vercel Hobby function timeout (5-10s) isn't enough headroom for
// withGeminiFallback's sequential model attempts plus the DB queries around
// it — Vercel kills the function mid-request rather than letting our own
// fallback message return, which the client sees as a hard failure. Hobby
// allows up to 60s if explicitly requested.
export const maxDuration = 60;

const WORKOUT_TYPE_LABEL: Record<string, string> = {
  easy: "Easy run",
  tempo: "Tempo run",
  interval: "Intervals",
  long: "Long run",
  rest: "Rest day",
};

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const history = await prisma.chatMessage.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    take: 50,
  });

  return NextResponse.json({ messages: history });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { message } = (await request.json()) as { message?: string };
  if (!message?.trim()) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  // TEMPORARY: wraps the whole handler so we see exactly where/why a
  // request is failing, not just the Gemini call. Remove once diagnosed.
  try {
    return await handleChat(user.id, message);
  } catch (err) {
    const detail = err instanceof Error ? `${err.name}: ${err.message}\n${err.stack}` : String(err);
    return NextResponse.json({ error: `[DEBUG] ${detail}` }, { status: 500 });
  }
}

async function handleChat(userId: string, message: string) {
  await prisma.chatMessage.create({
    data: { userId: userId, role: "user", content: message },
  });

  const recentHistory = await prisma.chatMessage.findMany({
    where: { userId: userId },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  await matchCompletedWorkouts(userId);

  const [goal, recentActivities, activePlan] = await Promise.all([
    prisma.goal.findFirst({
      where: { userId: userId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.activity.findMany({
      where: { userId: userId },
      orderBy: { date: "desc" },
      take: 5,
    }),
    prisma.trainingPlan.findFirst({
      where: { userId: userId, status: "active" },
      orderBy: { generatedAt: "desc" },
      include: { workouts: { orderBy: { date: "asc" } } },
    }),
  ]);

  const scheduleSummary = activePlan
    ? activePlan.workouts
        .map((w) => {
          const label = WORKOUT_TYPE_LABEL[w.type] ?? w.type;
          const status = w.completedActivityId
            ? "DONE"
            : w.date < new Date()
              ? "MISSED"
              : "upcoming, not due yet";
          return `${w.date.toDateString()}: ${label} — ${status}`;
        })
        .join("\n")
    : undefined;

  const recentActivitySummary =
    recentActivities.length > 0
      ? recentActivities
          .map(
            (a) =>
              `${a.date.toDateString()}: ${(a.distanceMeters / 1000).toFixed(1)}km` +
              (a.avgPaceSecPerKm
                ? ` @ ${Math.floor(a.avgPaceSecPerKm / 60)}:${Math.round(a.avgPaceSecPerKm % 60).toString().padStart(2, "0")}/km`
                : "") +
              (a.avgHeartRate ? `, avg HR ${a.avgHeartRate}` : ""),
          )
          .join("; ")
      : undefined;

  const chatHistory = recentHistory
    .slice(1) // drop the message we just saved, sent separately below
    .reverse()
    .map((m) => ({
      role: m.role === "user" ? ("user" as const) : ("model" as const),
      parts: [{ text: m.content }],
    }));

  const systemInstruction = `${PERSONA_SYSTEM_INSTRUCTION}\n\n${buildContextPreamble({
    goalSummary: goal ? buildGoalSummary(goal) : undefined,
    recentActivitySummary,
    scheduleSummary,
  })}`;

  // TEMPORARY: inner catch removed so a Gemini failure propagates to the
  // outer debug wrapper in POST() instead of being silently converted to
  // the friendly fallback message. Restore the try/catch once diagnosed.
  const response = await withGeminiFallback((model) => {
    const chat = genai.chats.create({
      model,
      config: { systemInstruction },
      history: chatHistory,
    });
    return chat.sendMessage({ message });
  });
  const replyText = response.text ?? "…the coach is speechless. Try again.";

  await prisma.chatMessage.create({
    data: { userId: userId, role: "coach", content: replyText },
  });

  return NextResponse.json({ reply: replyText });
}
