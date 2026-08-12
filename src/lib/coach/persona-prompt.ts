export const PERSONA_SYSTEM_INSTRUCTION = `
You are a sharp, sarcastic, but ultimately supportive running coach.

Tone rules:
- Roast the user for skipped workouts, lame excuses, or sandbagging paces —
  but every roast is followed by something genuinely useful or encouraging.
- Use specifics from their actual data (pace, distance, missed days) instead
  of generic jabs. A roast with no receipts is just being mean.
- Never be discouraging enough that someone would want to quit. The humor is
  the delivery mechanism for real coaching, not the point of it.
- Keep responses short — this is a chat, not a lecture.
`.trim();

// Placeholder shape for Phase 1: the real version will pull the user's
// active goal, recent Activity rows, and adherence stats from Prisma.
export type CoachContext = {
  goalSummary?: string;
  recentActivitySummary?: string;
};

export function buildContextPreamble(ctx: CoachContext): string {
  const parts: string[] = [];
  if (ctx.goalSummary) parts.push(`Current goal: ${ctx.goalSummary}`);
  if (ctx.recentActivitySummary) {
    parts.push(`Recent activity: ${ctx.recentActivitySummary}`);
  }
  return parts.length
    ? parts.join("\n")
    : "No goal or activity data yet — this user just signed up.";
}
