/** Local calendar day as "YYYY-MM-DD" — the same format as <input type="date">. */
export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Parse a "YYYY-MM-DD" key back to local midnight (new Date("YYYY-MM-DD") would be UTC). */
export function parseDayKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function relativeDayLabel(key: string, now: Date = new Date()): string | null {
  const today = dayKey(now);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (key === today) return "Today";
  if (key === dayKey(yesterday)) return "Yesterday";
  return null;
}

/** "Thursday, 9 October 2026" style, in the user's locale. */
export function longDate(key: string): string {
  return parseDayKey(key).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** "Thu, 9 Oct" — compact form for chips. */
export function shortDate(key: string): string {
  return parseDayKey(key).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

export function timeOfDay(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export interface DayGroup<T> {
  key: string;
  items: T[];
}

/** Group items by the local day of `created_at`, newest day first, preserving item order within a day. */
export function groupByDay<T extends { created_at: string }>(items: T[]): DayGroup<T>[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = dayKey(new Date(item.created_at));
    const bucket = groups.get(key);
    if (bucket) bucket.push(item);
    else groups.set(key, [item]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([key, groupItems]) => ({ key, items: groupItems }));
}

/** Consecutive days with at least one entry, counting back from today — or from
 * yesterday, so a streak isn't "broken" before today's entry has been written. */
export function currentStreak(keys: Iterable<string>, now: Date = new Date()): number {
  const days = new Set(keys);
  const cursor = new Date(now);
  if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (days.has(dayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/** The browser's UTC offset for a local day, as JavaScript reports it (UTC minus local, in minutes;
 * India is -330). Taken per day so daylight-saving changes are respected. The API uses it to turn
 * local days into UTC ranges. */
export function tzOffsetFor(key: string): number {
  return parseDayKey(key).getTimezoneOffset();
}
