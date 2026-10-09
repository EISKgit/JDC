import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { UpdateItem } from "../src/api/types";
import { dayKey } from "../src/lib/dates";
import { Updates } from "../src/pages/Updates";

const CATEGORIES = [
  { value: "health", label: "Health" },
  { value: "learning", label: "Learning" },
];

function daysAgo(n: number, hour = 10): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

function update(id: number, content: string, createdAt: string, category = "health"): UpdateItem {
  return {
    id,
    content,
    created_at: createdAt,
    events: [
      {
        id: id * 10,
        update_id: id,
        category: category as UpdateItem["events"][number]["category"],
        type: "x",
        description: content,
        sentiment: "positive",
        confidence: 0.9,
        details: {},
        is_corrected: false,
        created_at: createdAt,
      },
    ],
  };
}

const UPDATES = [
  update(3, "Went to the gym", daysAgo(0, 9)),
  update(2, "Read a book chapter", daysAgo(1), "learning"),
  update(1, "Walked in the park", daysAgo(5)),
];

function mockApi(updates: UpdateItem[]) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const body = String(input).endsWith("/categories") ? CATEGORIES : updates;
    return new Response(JSON.stringify(body));
  });
}

function renderUpdates() {
  return render(
    <MemoryRouter>
      <Updates />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
});

describe("Updates history", () => {
  it("groups entries by day with Today / Yesterday headings", async () => {
    mockApi(UPDATES);
    renderUpdates();

    expect(await screen.findByRole("heading", { name: "Today" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Yesterday" })).toBeTruthy();
    // 2-day streak: today + yesterday (the 5-days-ago entry is not part of the chain)
    expect(document.querySelector(".history-stats")?.textContent).toMatch(/^3 entries across 3 days ·\s+2-day streak$/);
  });

  it("filters to one day from a chip and back to all", async () => {
    mockApi(UPDATES);
    renderUpdates();
    await screen.findByRole("heading", { name: "Today" });

    const chips = screen.getByRole("group", { name: "Recent days" });
    fireEvent.click(within(chips).getByRole("button", { name: /Yesterday/ }));

    expect(screen.queryByText("Went to the gym", { selector: ".update-content" })).toBeNull();
    expect(screen.getByText("Read a book chapter", { selector: ".update-content" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Show all days" }));
    expect(screen.getByText("Went to the gym", { selector: ".update-content" })).toBeTruthy();
  });

  it("jumps to a date from the picker and shows an empty message for days without entries", async () => {
    mockApi(UPDATES);
    renderUpdates();
    await screen.findByRole("heading", { name: "Today" });

    const picker = screen.getByLabelText("Jump to date");
    const fiveDaysAgo = dayKey(new Date(daysAgo(5)));
    fireEvent.change(picker, { target: { value: fiveDaysAgo } });
    expect(screen.getByText("Walked in the park", { selector: ".update-content" })).toBeTruthy();
    expect(screen.queryByText("Went to the gym", { selector: ".update-content" })).toBeNull();

    fireEvent.change(picker, { target: { value: dayKey(new Date(daysAgo(3))) } });
    expect(screen.getByText(/No entries on/)).toBeTruthy();
  });

  it("shows a friendly empty state for a new user", async () => {
    mockApi([]);
    renderUpdates();
    expect(await screen.findByText(/No updates yet/)).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Recent days" })).toBeNull();
  });
});
