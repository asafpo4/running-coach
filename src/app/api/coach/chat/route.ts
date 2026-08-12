import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { genai, COACH_MODEL } from "@/lib/coach/gemini-client";
import {
  PERSONA_SYSTEM_INSTRUCTION,
  buildContextPreamble,
} from "@/lib/coach/persona-prompt";

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

// Activity-aware banter lands in Phase 2 (needs Strava sync running) — for
// now the coach only knows the user's stated goal, if any.
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

  await prisma.chatMessage.create({
    data: { userId: user.id, role: "user", content: message },
  });

  const recentHistory = await prisma.chatMessage.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  const goal = await prisma.goal.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });

  const chat = genai.chats.create({
    model: COACH_MODEL,
    config: {
      systemInstruction: `${PERSONA_SYSTEM_INSTRUCTION}\n\n${buildContextPreamble({
        goalSummary: goal
          ? `${goal.type} target of ${goal.targetValue}${goal.targetDate ? ` by ${goal.targetDate.toDateString()}` : ""}`
          : undefined,
      })}`,
    },
    history: recentHistory
      .slice(1) // drop the message we just saved, sent separately below
      .reverse()
      .map((m) => ({
        role: m.role === "user" ? "user" : "model",
        parts: [{ text: m.content }],
      })),
  });

  const response = await chat.sendMessage({ message });
  const replyText = response.text ?? "…the coach is speechless. Try again.";

  await prisma.chatMessage.create({
    data: { userId: user.id, role: "coach", content: replyText },
  });

  return NextResponse.json({ reply: replyText });
}
