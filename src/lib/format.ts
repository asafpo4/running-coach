export function formatDistance(meters: number): string {
  return `${(meters / 1000).toFixed(2)} km`;
}

export function formatPace(secPerKm: number | null): string {
  if (!secPerKm) return "—";
  const min = Math.floor(secPerKm / 60);
  const sec = Math.round(secPerKm % 60);
  return `${min}:${sec.toString().padStart(2, "0")} /km`;
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// "45:00" -> 2700, "1:30:00" -> 5400. Returns null if the string isn't a
// valid mm:ss or h:mm:ss clock format.
export function parseClockDuration(input: string): number | null {
  const parts = input.trim().split(":").map((p) => p.trim());
  if (parts.length < 2 || parts.length > 3) return null;
  if (!parts.every((p) => /^\d+$/.test(p))) return null;

  const nums = parts.map(Number);
  const [h, m, s] = nums.length === 3 ? nums : [0, nums[0], nums[1]];
  if (m >= 60 || s >= 60) return null;

  return h * 3600 + m * 60 + s;
}

// 2700 -> "45:00", 5400 -> "1:30:00"
export function formatClockDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  const mm = m.toString().padStart(2, "0");
  const ss = s.toString().padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

// "YYYY-MM-DD" in the server's local timezone — NOT date.toISOString(),
// which converts to UTC first and silently rolls back to the previous day
// for any positive UTC offset (e.g. Israel) whenever the stored time is
// local midnight. Use this anywhere a Date needs to become a calendar-day
// string that has to match what a user actually sees on that day.
export function toLocalDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const d = date.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${d}`;
}
