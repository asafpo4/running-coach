import { NextResponse } from "next/server";
import { createPartFromFunctionResponse } from "@google/genai";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { genai, withGeminiFallback } from "@/lib/coach/gemini-client";
import {
  PERSONA_SYSTEM_INSTRUCTION,
  buildContextPreamble,
  buildGoalSummary,
} from "@/lib/coach/persona-prompt";
import { matchCompletedWorkouts } from "@/lib/coach/plan-generator";
import {
  WORKOUT_TOOL_DECLARATIONS,
  WORKOUT_TOOL_HANDLERS,
} from "@/lib/coach/workout-actions";

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

  return handleChat(user.id, message);
}

async function handleChat(userId: string, message: string) {
  await prisma.chatMessage.create({
    data: { userId, role: "user", content: message },
  });

  const recentHistory = await prisma.chatMessage.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  await matchCompletedWorkouts(userId);

  const [goal, recentActivities, activePlan] = await Promise.all([
    prisma.goal.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.activity.findMany({
      where: { userId },
      orderBy: { date: "desc" },
      take: 5,
    }),
    prisma.trainingPlan.findFirst({
      where: { userId, status: "active" },
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

  let replyText: string;
  try {
    const response = await withGeminiFallback(async (model) => {
      const chat = genai.chats.create({
        model,
        config: {
          systemInstruction,
          tools: [{ functionDeclarations: WORKOUT_TOOL_DECLARATIONS }],
        },
        history: chatHistory,
      });

      let result = await chat.sendMessage({ message });

      // One round of tool calls is enough for these actions — reschedule/
      // swap/skip don't need to chain into further calls. Execute whatever
      // the model asked for, then send the results back for its actual
      // reply to the user.
      if (result.functionCalls && result.functionCalls.length > 0) {
        const responseParts = await Promise.all(
          result.functionCalls.map(async (call) => {
            const handler = call.name ? WORKOUT_TOOL_HANDLERS[call.name] : undefined;
            const outcome = handler
              ? await handler(userId, call.args ?? {})
              : { success: false, message: `Unknown tool: ${call.name}` };
            return createPartFromFunctionResponse(
              call.id ?? call.name ?? "unknown",
              call.name ?? "unknown",
              outcome,
            );
          }),
        );
        result = await chat.sendMessage({ message: responseParts });
      }

      return result;
    });
    replyText = response.text ?? "…the coach is speechless. Try again.";
  } catch {
    replyText =
      "The coach is buried under too many requests right now (Gemini's free tier is overloaded) — give it a minute and try again.";
  }

  await prisma.chatMessage.create({
    data: { userId, role: "coach", content: replyText },
  });

  return NextResponse.json({ reply: replyText });
}
