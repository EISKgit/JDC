import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import type { Goal } from "../src/api/types";
import { Goals } from "../src/pages/Goals";
import { mockRoutes } from "./helpers";

const CATEGORIES = [
  { value: "health", label: "Health" },
  { value: "learning", label: "Learning" },
];

const GYM_GOAL: Goal = {
  id: 1,
  category: "health",
  title: "Gym 3x a week",
  description: null,
  status: "active",
  created_at: "2026-10-01T09:00:00Z",
};

function recentUpdate(category: string, daysAgo: number) {
  const created = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
  return {
    id: daysAgo + 100,
    content: "x",
    created_at: created,
    events: [{ id: daysAgo, update_id: daysAgo + 100, category, type: "x", description: "x", sentiment: null,
      confidence: null, details: {}, is_corrected: false, created_at: created }],
  };
}

function renderGoals() {
  return render(
    <MemoryRouter>
      <Goals />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
});

describe("Goals", () => {
  it("lists goals with this week's activity in their life area", async () => {
    mockRoutes({
      "GET /goals": [GYM_GOAL, { ...GYM_GOAL, id: 2, title: "Learn Spanish", category: "learning" }],
      "GET /categories": CATEGORIES,
      // 2 health entries this week, 1 older one that doesn't count
      "GET /updates": [recentUpdate("health", 1), recentUpdate("health", 3), recentUpdate("health", 10)],
    });
    renderGoals();
    const active = await screen.findByRole("region", { name: "Active goals" });
    expect(within(active).getByText(/2 entries in this area this week/)).toBeTruthy();
    expect(within(active).getByRole("link", { name: "no entries in this area this week" })).toBeTruthy();
  });

  it("adds a goal", async () => {
    const calls = mockRoutes({
      "GET /goals": [],
      "GET /categories": CATEGORIES,
      "GET /updates": [],
      "POST /goals": ({ body }: { body: unknown }) => ({ ...GYM_GOAL, id: 9, ...(body as object) }),
    });
    renderGoals();
    expect(await screen.findByText(/No goals yet/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Goal"), { target: { value: "  Read 10 books  " } });
    fireEvent.change(screen.getByLabelText("Life area"), { target: { value: "learning" } });
    fireEvent.click(screen.getByRole("button", { name: "Add goal" }));

    expect(await screen.findByText("Read 10 books")).toBeTruthy();
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({
      title: "Read 10 books",
      category: "learning",
      description: null,
    });
    expect((screen.getByLabelText("Goal") as HTMLInputElement).value).toBe("");
  });

  it("marks a goal done, moving it to Completed, and can reopen it", async () => {
    mockRoutes({
      "GET /goals": [GYM_GOAL],
      "GET /categories": CATEGORIES,
      "GET /updates": [],
      "PATCH /goals/1": ({ body }: { body: unknown }) => ({ ...GYM_GOAL, ...(body as object) }),
    });
    renderGoals();
    fireEvent.click(await screen.findByRole("button", { name: "Done" }));

    const completed = await screen.findByRole("region", { name: "Completed goals" });
    expect(within(completed).getByText("Gym 3x a week")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Active goals" })).toBeNull();

    fireEvent.click(within(completed).getByRole("button", { name: "Reopen" }));
    expect(await screen.findByRole("region", { name: "Active goals" })).toBeTruthy();
  });

  it("deletes a goal", async () => {
    mockRoutes({ "GET /goals": [GYM_GOAL], "GET /categories": CATEGORIES, "GET /updates": [], "DELETE /goals/1": undefined });
    renderGoals();
    fireEvent.click(await screen.findByRole("button", { name: "Delete goal" }));
    await waitFor(() => expect(screen.queryByText("Gym 3x a week")).toBeNull());
    expect(screen.getByText(/No goals yet/)).toBeTruthy();
  });
});
