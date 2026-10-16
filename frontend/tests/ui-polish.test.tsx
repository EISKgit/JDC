import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import type { UpdateItem } from "../src/api/types";
import { PageSkeleton } from "../src/components/PageSkeleton";
import { RouteFocus } from "../src/components/RouteFocus";
import { ThemeToggle } from "../src/components/ThemeToggle";
import { parseRange } from "../src/lib/overview";
import { Dashboard } from "../src/pages/Dashboard";
import { Updates } from "../src/pages/Updates";
import { mockRoutes } from "./helpers";

afterEach(() => {
  cleanup();
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe("Theme toggle", () => {
  it("cycles System -> Light -> Dark -> System and remembers the choice", () => {
    render(<ThemeToggle />);
    const button = () => screen.getByRole("button", { name: /^Theme:/ });

    expect(button().getAttribute("aria-label")).toBe("Theme: System. Switch to Light");
    expect(document.documentElement.dataset.theme).toBeUndefined();

    fireEvent.click(button());
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem("jdc_theme")).toBe("light");

    fireEvent.click(button());
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(button().getAttribute("aria-label")).toBe("Theme: Dark. Switch to System");

    fireEvent.click(button());
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(localStorage.getItem("jdc_theme")).toBeNull();
  });

  it("starts from the stored theme", () => {
    localStorage.setItem("jdc_theme", "dark");
    render(<ThemeToggle />);
    expect(screen.getByRole("button", { name: "Theme: Dark. Switch to System" })).toBeTruthy();
  });
});

describe("Route focus", () => {
  it("moves focus to the main content after navigating, not on first load", () => {
    render(
      <MemoryRouter initialEntries={["/a"]}>
        <RouteFocus />
        <Link to="/b">Go to B</Link>
        <main id="main" tabIndex={-1}>
          <Routes>
            <Route path="/a" element={<p>Page A</p>} />
            <Route path="/b" element={<p>Page B</p>} />
          </Routes>
        </main>
      </MemoryRouter>,
    );
    const main = document.getElementById("main");
    expect(document.activeElement).not.toBe(main);

    fireEvent.click(screen.getByRole("link", { name: "Go to B" }));
    expect(screen.getByText("Page B")).toBeTruthy();
    expect(document.activeElement).toBe(main);
  });
});

describe("Page skeleton", () => {
  it("announces loading to assistive technology", () => {
    render(<PageSkeleton variant="grid" />);
    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-busy")).toBe("true");
    expect(status.textContent).toContain("Loading");
  });
});

const SCORES = [{ category: "health", score: 64, event_count: 2, trend: "stable", confidence: "low" }];
const FORECAST = [{ category: "health", direction: "stable", confidence: "low", narrative: "Steady." }];

function summary(narrative: string) {
  return { period: "x", start: "", end: "", overall_score: 64, category_scores: SCORES, narrative, warnings: [] };
}

describe("Dashboard time range", () => {
  it("defaults to 7 days and switches to today and 30 days", async () => {
    const calls = mockRoutes({
      "GET /categories": [{ value: "health", label: "Health" }],
      "GET /dashboard": {
        overall_score: 64,
        category_scores: SCORES,
        top_observation: "Week view",
        warnings: [],
        recommendation: "Keep walking",
        forecast_7day: FORECAST,
      },
      "GET /intelligence/daily": summary("Day view"),
      "GET /intelligence/monthly": summary("Month view"),
      "GET /intelligence/forecast": FORECAST,
    });
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Overall score (last 7 days)")).toBeTruthy();
    expect(screen.getByRole("button", { name: "7 days" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Recommended focus")).toBeTruthy();
    expect(screen.getByText("7-Day Outlook")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    expect(await screen.findByText("Overall score (today)")).toBeTruthy();
    expect(screen.getByText("Day view")).toBeTruthy();
    // the curated recommendation belongs to the 7-day view only
    expect(screen.queryByText("Recommended focus")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "30 days" }));
    expect(await screen.findByText("Overall score (last 30 days)")).toBeTruthy();
    expect(screen.getByText("Month view")).toBeTruthy();
    expect(screen.getByText("30-Day Outlook")).toBeTruthy();
    expect(calls.some((c) => c.url.endsWith("/intelligence/forecast?horizon=30"))).toBe(true);
  });

  it("only accepts known ranges from the address bar", () => {
    expect(parseRange("day")).toBe("day");
    expect(parseRange("month")).toBe("month");
    expect(parseRange(null)).toBe("week");
    expect(parseRange("year")).toBe("week");
  });
});

function entry(id: number, content: string, statement: string): UpdateItem {
  const createdAt = new Date().toISOString();
  return {
    id,
    content,
    created_at: createdAt,
    events: [
      {
        id: id * 10,
        update_id: id,
        category: "health",
        type: "x",
        description: statement,
        sentiment: "positive",
        confidence: 0.9,
        details: {},
        is_corrected: false,
        created_at: createdAt,
      },
    ],
  };
}

describe("Updates search", () => {
  it("filters history by what was written or by an extracted statement", async () => {
    mockRoutes({
      "GET /categories": [{ value: "health", label: "Health" }],
      "GET /updates": [
        entry(1, "Went to the gym", "Workout at the gym"),
        entry(2, "Paid the rent", "Rent payment made"),
      ],
    });
    render(
      <MemoryRouter>
        <Updates />
      </MemoryRouter>,
    );
    const search = await screen.findByRole("searchbox", { name: "Search your updates" });

    fireEvent.change(search, { target: { value: "GYM" } });
    await waitFor(() => expect(screen.queryByText("Paid the rent")).toBeNull());
    expect(screen.getByText("Went to the gym")).toBeTruthy();
    expect(screen.getByText(/entry matches/).textContent).toContain("1");

    fireEvent.change(search, { target: { value: "payment" } });
    expect(await screen.findByText("Paid the rent")).toBeTruthy();
    expect(screen.queryByText("Went to the gym")).toBeNull();

    fireEvent.change(search, { target: { value: "swimming" } });
    expect(await screen.findByText(/No entries match "swimming"/)).toBeTruthy();

    fireEvent.change(search, { target: { value: "" } });
    expect(await screen.findByText("Went to the gym")).toBeTruthy();
    expect(screen.getByText("Paid the rent")).toBeTruthy();
  });
});
