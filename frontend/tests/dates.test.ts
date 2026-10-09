import { describe, expect, it } from "vitest";
import { currentStreak, dayKey, groupByDay, parseDayKey, relativeDayLabel } from "../src/lib/dates";

// Local-time constructors keep these tests independent of the machine's timezone.
const NOW = new Date(2026, 9, 9, 15, 0); // Thu 9 Oct 2026, 15:00 local

describe("dayKey / parseDayKey", () => {
  it("uses the local calendar day", () => {
    expect(dayKey(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
    expect(dayKey(new Date(2026, 0, 6, 0, 1))).toBe("2026-01-06");
  });

  it("round-trips", () => {
    expect(dayKey(parseDayKey("2026-10-09"))).toBe("2026-10-09");
  });
});

describe("relativeDayLabel", () => {
  it("labels today and yesterday, nothing else", () => {
    expect(relativeDayLabel("2026-10-09", NOW)).toBe("Today");
    expect(relativeDayLabel("2026-10-08", NOW)).toBe("Yesterday");
    expect(relativeDayLabel("2026-10-07", NOW)).toBeNull();
  });

  it("handles month boundaries", () => {
    expect(relativeDayLabel("2026-09-30", new Date(2026, 9, 1, 8, 0))).toBe("Yesterday");
  });
});

describe("groupByDay", () => {
  it("groups by local day, newest day first, keeping order within a day", () => {
    const items = [
      { id: 3, created_at: new Date(2026, 9, 9, 21, 0).toISOString() },
      { id: 2, created_at: new Date(2026, 9, 9, 8, 0).toISOString() },
      { id: 1, created_at: new Date(2026, 9, 7, 23, 30).toISOString() },
    ];
    const groups = groupByDay(items);
    expect(groups.map((g) => g.key)).toEqual(["2026-10-09", "2026-10-07"]);
    expect(groups[0].items.map((i) => i.id)).toEqual([3, 2]);
  });

  it("puts a late-evening UTC timestamp on the user's local day", () => {
    // 23:30 local on 7 Oct must stay on 7 Oct, whatever UTC date that is.
    const late = new Date(2026, 9, 7, 23, 30);
    expect(groupByDay([{ created_at: late.toISOString() }])[0].key).toBe("2026-10-07");
  });
});

describe("currentStreak", () => {
  it("counts consecutive days ending today", () => {
    expect(currentStreak(["2026-10-09", "2026-10-08", "2026-10-07", "2026-10-05"], NOW)).toBe(3);
  });

  it("still counts if today has no entry yet", () => {
    expect(currentStreak(["2026-10-08", "2026-10-07"], NOW)).toBe(2);
  });

  it("is zero when the last entry is older than yesterday", () => {
    expect(currentStreak(["2026-10-06"], NOW)).toBe(0);
  });
});
