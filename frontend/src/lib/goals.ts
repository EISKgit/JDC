import type { UpdateItem } from "../api/types";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Events per life area over the last 7 days, to show goal-related activity. */
export function weeklyActivity(updates: UpdateItem[], now: number = Date.now()): Map<string, number> {
  const since = now - WEEK_MS;
  const counts = new Map<string, number>();
  for (const u of updates) {
    if (new Date(u.created_at).getTime() < since) continue;
    for (const e of u.events) counts.set(e.category, (counts.get(e.category) ?? 0) + 1);
  }
  return counts;
}
