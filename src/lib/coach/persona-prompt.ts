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
- The context below states today's date and, if a plan exists, a day-by-day
  schedule already marked DONE / MISSED / upcoming. That's ground truth —
  use it exactly as given rather than inferring completion from wording or
  guessing whether a date is past or future. Never claim a day is done or
  missed unless the schedule says so.
- The schedule/goal/activity context given with THIS message is always more
  current than anything said earlier in this conversation — plans get
  regenerated and goals change between messages. If the schedule here
  conflicts with something you said in an earlier turn, the schedule here
  wins silently: update to it without flagging the discrepancy or accusing
  the user of asking again, since from their side nothing repeated.
`.trim();

export type CoachContext = {
  goalSummary?: string;
  recentActivitySummary?: string;
  scheduleSummary?: string;
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
  // Stated explicitly rather than left for the model to infer — same
  // reasoning as computing plan dates in code: don't trust the LLM with
  // date math, including "is this scheduled day in the past or future."
  const parts: string[] = [`Today's date: ${new Date().toDateString()}`];

  if (ctx.goalSummary) parts.push(`Current goal: ${ctx.goalSummary}`);
  if (ctx.recentActivitySummary) {
    parts.push(`Recent activity: ${ctx.recentActivitySummary}`);
  }
  if (ctx.scheduleSummary) {
    parts.push(`Training schedule:\n${ctx.scheduleSummary}`);
  }
  if (!ctx.goalSummary && !ctx.recentActivitySummary && !ctx.scheduleSummary) {
    parts.push("No goal, activity, or plan data yet — this user just signed up.");
  }
  return parts.join("\n\n");
}
