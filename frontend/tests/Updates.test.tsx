import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

describe("Editing updates", () => {
  function mockApiWithEdits(updates: UpdateItem[]) {
    const calls: { method: string; url: string; body: unknown }[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ method, url, body });
      if (method === "PATCH" && url.includes("/updates/")) {
        const edited = update(3, body.content, updates[0].created_at, "learning");
        edited.events[0].description = "Studied Python.";
        return new Response(JSON.stringify(edited));
      }
      if (method === "PATCH" && url.includes("/events/")) {
        return new Response(JSON.stringify({ ...updates[0].events[0], ...body, is_corrected: true }));
      }
      return new Response(JSON.stringify(url.endsWith("/categories") ? CATEGORIES : updates));
    });
    return calls;
  }

  it("edits the whole update and shows the re-sorted statements", async () => {
    const calls = mockApiWithEdits([UPDATES[0]]);
    renderUpdates();
    await screen.findByText("Went to the gym", { selector: ".update-content" });

    fireEvent.click(screen.getByRole("button", { name: "Edit update" }));
    fireEvent.change(screen.getByLabelText("Edit update"), { target: { value: "studyed python" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("studyed python", { selector: ".update-content" })).toBeTruthy();
    expect(screen.getByText("Studied Python.", { selector: ".event-description" })).toBeTruthy();
    expect(calls.find((c) => c.method === "PATCH")).toMatchObject({ body: { content: "studyed python" } });
  });

  it("edits a single categorized statement", async () => {
    const calls = mockApiWithEdits([UPDATES[0]]);
    renderUpdates();
    await screen.findByText("Went to the gym", { selector: ".update-content" });

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const input = screen.getByLabelText("Edit statement");
    fireEvent.change(input, { target: { value: "Went to the gym for leg day." } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(await screen.findByText("Went to the gym for leg day.", { selector: ".event-description" })).toBeTruthy();
    expect(screen.getByText("corrected")).toBeTruthy();
    // the paragraph the user typed is untouched
    expect(screen.getByText("Went to the gym", { selector: ".update-content" })).toBeTruthy();
    expect(calls.find((c) => c.method === "PATCH")?.url).toMatch(/\/events\/30$/);
  });
});

describe("Deleting updates", () => {
  function mockApiWithDelete(updates: UpdateItem[], deleteStatus = 204) {
    const calls: { method: string; url: string }[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      calls.push({ method, url });
      if (method === "DELETE") {
        return deleteStatus === 204
          ? new Response(null, { status: 204 })
          : new Response(JSON.stringify({ detail: "Update not found" }), { status: deleteStatus });
      }
      return new Response(JSON.stringify(url.endsWith("/categories") ? CATEGORIES : updates));
    });
    return calls;
  }

  it("asks for confirmation, then deletes the entry and its day group", async () => {
    const calls = mockApiWithDelete([UPDATES[0], UPDATES[1]]);
    renderUpdates();
    await screen.findByText("Went to the gym", { selector: ".update-content" });

    const todayGroup = screen.getByRole("heading", { name: "Today" }).closest("section")!;
    fireEvent.click(within(todayGroup).getByRole("button", { name: "Delete" }));
    expect(screen.getByRole("alertdialog", { name: "Confirm delete" }).textContent).toMatch(
      /Delete this entry and its 1 statement\?/,
    );
    expect(calls.some((c) => c.method === "DELETE")).toBe(false); // nothing deleted before confirming

    fireEvent.click(screen.getByRole("button", { name: "Delete entry" }));
    await waitFor(() =>
      expect(document.querySelector(".history-stats")?.textContent).toMatch(/^1 entry across 1 day/),
    );
    expect(screen.queryByText("Went to the gym", { selector: ".update-content" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Today" })).toBeNull();
    expect(calls.find((c) => c.method === "DELETE")?.url).toMatch(/\/updates\/3$/);
  });

  it("cancel keeps the entry", async () => {
    const calls = mockApiWithDelete([UPDATES[0]]);
    renderUpdates();
    await screen.findByText("Went to the gym", { selector: ".update-content" });

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByText("Went to the gym", { selector: ".update-content" })).toBeTruthy();
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);
  });

  it("shows an error and keeps the entry if the delete fails", async () => {
    mockApiWithDelete([UPDATES[0]], 404);
    renderUpdates();
    await screen.findByText("Went to the gym", { selector: ".update-content" });

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete entry" }));
    expect(await screen.findByText("Update not found")).toBeTruthy();
    expect(screen.getByText("Went to the gym", { selector: ".update-content" })).toBeTruthy();
  });
});

describe("Day summaries and deep links", () => {
  it("summarizes a day with the browser's timezone offset", async () => {
    let request: { url: string; body: { day: string; tz_offset_minutes: number } } | null = null;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/assistant/day-summary")) {
        request = { url, body: JSON.parse(String(init?.body)) };
        return new Response(
          JSON.stringify({ day: request.body.day, summary: "You trained hard today.", entry_count: 1, used_ai: true }),
        );
      }
      return new Response(JSON.stringify(url.endsWith("/categories") ? CATEGORIES : [UPDATES[0]]));
    });
    renderUpdates();
    await screen.findByText("Went to the gym", { selector: ".update-content" });

    fireEvent.click(screen.getByRole("button", { name: "Summarize day" }));
    expect(await screen.findByText("You trained hard today.")).toBeTruthy();
    expect(screen.getByText("AI summary")).toBeTruthy();
    const today = dayKey(new Date(UPDATES[0].created_at));
    expect(request!.body).toEqual({ day: today, tz_offset_minutes: new Date().getTimezoneOffset() });
  });

  it("opens the day given in ?date= (used by Ask JDC source links)", async () => {
    mockApi(UPDATES);
    const fiveDaysAgo = dayKey(new Date(UPDATES[2].created_at));
    render(
      <MemoryRouter initialEntries={[`/updates?date=${fiveDaysAgo}`]}>
        <Updates />
      </MemoryRouter>,
    );
    expect(await screen.findByText("Walked in the park", { selector: ".update-content" })).toBeTruthy();
    expect(screen.queryByText("Went to the gym", { selector: ".update-content" })).toBeNull();
    expect((screen.getByLabelText("Jump to date") as HTMLInputElement).value).toBe(fiveDaysAgo);
  });
});
