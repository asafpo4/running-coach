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

  // Fetch the most recent 50 (desc), then reverse for chronological
  // display order. The previous version ordered asc before taking 50,
  // which returns the OLDEST 50 messages ever sent — once a conversation
  // passes 50 messages total, every message after that point becomes
  // permanently invisible on load, even though it's still in the DB.
  const recent = await prisma.chatMessage.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ messages: recent.reverse() });
}

export async function DELETE() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await prisma.chatMessage.deleteMany({ where: { userId: user.id } });

  return NextResponse.json({ ok: true });
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

  const MAX_TOOL_ROUNDS = 5;

  let replyText: string;
  try {
    // Track outcomes across rounds so we can still tell the user what
    // actually happened even if the model's final text comes back empty —
    // the tool calls are real DB writes regardless of whether the model
    // manages to narrate them.
    const toolOutcomes: string[] = [];
    // TEMPORARY: full trace of every tool call attempted, appended to the
    // reply so we can see exactly what ran without needing DB access.
    // Remove once diagnosed.
    const toolTrace: string[] = [];

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

      // Loop rather than a single fixed round — the model can reasonably
      // want a second round (e.g. after seeing one result, decide another
      // date also needs changing), and treating only the first round as
      // final left later tool calls silently unexecuted.
      for (
        let round = 0;
        round < MAX_TOOL_ROUNDS && result.functionCalls && result.functionCalls.length > 0;
        round++
      ) {
        const responseParts = await Promise.all(
          result.functionCalls.map(async (call) => {
            const handler = call.name ? WORKOUT_TOOL_HANDLERS[call.name] : undefined;
            const outcome = handler
              ? await handler(userId, call.args ?? {})
              : { success: false, message: `Unknown tool: ${call.name}` };
            toolOutcomes.push(outcome.message);
            toolTrace.push(
              `${call.name}(${JSON.stringify(call.args)}) -> ${JSON.stringify(outcome)}`,
            );
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

    replyText =
      response.text ||
      (toolOutcomes.length > 0
        ? toolOutcomes.join(" ")
        : "…the coach is speechless. Try again.");

    if (toolTrace.length > 0) {
      replyText += `\n\n[DEBUG tool calls]\n${toolTrace.join("\n")}`;
    }
  } catch {
    replyText =
      "The coach is buried under too many requests right now (Gemini's free tier is overloaded) — give it a minute and try again.";
  }

  await prisma.chatMessage.create({
    data: { userId, role: "coach", content: replyText },
  });

  return NextResponse.json({ reply: replyText });
}
