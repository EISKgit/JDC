import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Dashboard as DashboardData } from "../src/api/types";
import { Dashboard } from "../src/pages/Dashboard";

const CATEGORIES = [
  { value: "health", label: "Health" },
  { value: "personal_growth", label: "Personal Growth" },
];

function dashboard(healthEvents: number): DashboardData {
  return {
    overall_score: healthEvents ? 72 : 50,
    category_scores: [
      { category: "health", score: healthEvents ? 72 : 50, event_count: healthEvents, trend: "insufficient_evidence", confidence: "low" },
      { category: "personal_growth", score: 50, event_count: 0, trend: "insufficient_evidence", confidence: "low" },
    ],
    top_observation: "",
    warnings: [],
    recommendation: "",
    forecast_7day: [],
  } as DashboardData;
}

function mockApi(data: DashboardData) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const body = String(input).endsWith("/categories") ? CATEGORIES : data;
    return new Response(JSON.stringify(body));
  });
}

function renderDashboard() {
  return render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
});

describe("Dashboard", () => {
  it("shows — instead of a baseline 50 when there is no data", async () => {
    mockApi(dashboard(0));
    renderDashboard();

    expect(await screen.findByText(/No data yet/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "log your first update" }).getAttribute("href")).toBe("/updates");
    expect(screen.queryByText("50")).toBeNull();
    expect(screen.getAllByText("—")).toHaveLength(3); // overall + 2 categories
    expect(screen.getAllByText(/not enough data/)).toHaveLength(2);
  });

  it("shows real scores once there is activity", async () => {
    mockApi(dashboard(3));
    renderDashboard();

    expect(await screen.findByText("Overall score (last 7 days)")).toBeTruthy();
    expect(screen.getAllByText("72")).toHaveLength(2); // overall + health
    expect(screen.getAllByText("—")).toHaveLength(1); // personal growth still empty
  });
});

describe("JDC guide on the dashboard", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("is open for a new user and shows the flow diagram and screen map", async () => {
    mockApi(dashboard(0));
    renderDashboard();

    expect(await screen.findByRole("heading", { name: /clear picture of your life/ })).toBeTruthy();

    const flow = screen.getByRole("list", { name: "How an update becomes insight" });
    const steps = within(flow).getAllByRole("listitem").map((li) => li.querySelector("strong")?.textContent);
    expect(steps).toEqual(["Write", "Split", "Sort", "See"]);

    const map = screen.getByRole("list", { name: "Where to find your results" });
    expect(within(map).getByText("Life score 0–100")).toBeTruthy();
    expect(within(map).getByText("History, grouped by day")).toBeTruthy();

    expect(screen.getByRole("link", { name: /Set up Life Profile/ }).getAttribute("href")).toBe("/onboarding");
    expect(screen.getByRole("link", { name: /2\. Write an update/ }).getAttribute("href")).toBe("/updates");
  });

  it("starts collapsed once there is data, and remembers the user's choice", async () => {
    mockApi(dashboard(3));
    renderDashboard();

    const toggle = await screen.findByRole("button", { name: "How JDC works" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("list", { name: "How an update becomes insight" })).toBeNull();

    fireEvent.click(toggle);
    expect(screen.getByRole("list", { name: "How an update becomes insight" })).toBeTruthy();
    expect(localStorage.getItem("jdc_guide_open")).toBe("true");

    cleanup();
    renderDashboard();
    expect(await screen.findByRole("button", { name: "Hide guide" })).toBeTruthy();
  });
});
