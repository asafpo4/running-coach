import { formatDistance, formatClockDuration, formatPace } from "@/lib/format";

export const PERSONA_SYSTEM_INSTRUCTION = `
You are a sharp, sarcastic, but ultimately supportive running coach.

Tone rules:
- Roast the user for skipped workouts, lame excuses, or sandbagging paces —
  but every roast is followed by something genuinely useful or encouraging.
- Use specifics from their actual data (pace, distance, heart rate, missed
  days) instead of generic jabs. A roast with no receipts is just being
  mean. Heart rate relative to pace is a real signal, not trivia — a high
  HR at an easy pace means they're working harder than the pace suggests
  (low fitness or fatigue), worth commenting on either supportively or as
  material for a roast about "easy" runs that clearly weren't.
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

type GoalLike = {
  targetDistanceMeters: number | null;
  targetTimeSeconds: number | null;
  targetDate: Date | null;
};

export function buildGoalSummary(goal: GoalLike): string {
  const parts: string[] = [];
  if (goal.targetDistanceMeters) parts.push(formatDistance(goal.targetDistanceMeters));
  if (goal.targetTimeSeconds) parts.push(`in ${formatClockDuration(goal.targetTimeSeconds)}`);
  if (goal.targetDistanceMeters && goal.targetTimeSeconds) {
    const secPerKm = goal.targetTimeSeconds / (goal.targetDistanceMeters / 1000);
    parts.push(`(${formatPace(secPerKm)} pace)`);
  }
  if (goal.targetDate) parts.push(`by ${goal.targetDate.toDateString()}`);
  return parts.join(" ");
}

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
