import { cleanup, render, screen } from "@testing-library/react";
import axe from "axe-core";
import type { ComponentType, ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { setToken } from "../src/api/client";
import { NavBar } from "../src/components/NavBar";
import { AuthProvider } from "../src/context/AuthContext";
import { resetAppConfigCache } from "../src/lib/appConfig";
import { Account } from "../src/pages/Account";
import { Ask } from "../src/pages/Ask";
import { Dashboard } from "../src/pages/Dashboard";
import { Goals } from "../src/pages/Goals";
import { Login } from "../src/pages/Login";
import { Onboarding } from "../src/pages/Onboarding";
import { Signup } from "../src/pages/Signup";
import { Updates } from "../src/pages/Updates";
import { CONFIG, USER, mockRoutes } from "./helpers";

const CATEGORIES = [
  { value: "health", label: "Health" },
  { value: "learning", label: "Learning" },
];

const NOW = new Date().toISOString();
const UPDATE = {
  id: 1,
  content: "Went to the gym, felt great.",
  created_at: NOW,
  events: [
    {
      id: 10, update_id: 1, category: "health", type: "exercise", description: "I went to the gym.",
      sentiment: "positive", confidence: 0.9, details: {}, is_corrected: false, created_at: NOW,
    },
  ],
};
const SUMMARY = {
  overall_score: 64,
  category_scores: [
    { category: "health", score: 74, event_count: 1, trend: "improving", confidence: "low" },
    { category: "learning", score: 50, event_count: 0, trend: "insufficient_evidence", confidence: "low" },
  ],
  top_observation: "1 event this week.",
  warnings: [],
  recommendation: "Keep going.",
  forecast_7day: [
    { category: "health", horizon_days: 7, direction: "improving", confidence: "low", pct_change: 100, narrative: "Up." },
  ],
};

function routes() {
  return mockRoutes({
    "GET /auth/me": USER,
    "GET /config": CONFIG({ external: true }),
    "GET /categories": CATEGORIES,
    "GET /updates": [UPDATE],
    "GET /goals": [{ id: 1, category: "health", title: "Run 5k", description: null, status: "active", created_at: NOW }],
    "GET /dashboard": SUMMARY,
    "GET /onboarding": null,
    "GET /intelligence/daily": { ...SUMMARY, period: "daily", start: NOW, end: NOW, total_events: 1, category_counts: {}, narrative: "", evidence: {} },
  });
}

/** Run axe (WCAG 2.x A/AA rules) and return readable violations. Colour contrast needs a real
 * layout engine, so it's checked in the browser instead (see the KT doc). */
async function violations(): Promise<string[]> {
  const result = await axe.run(document.body, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"] },
    rules: { "color-contrast": { enabled: false }, region: { enabled: false } },
  });
  return result.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length}x) e.g. ${v.nodes[0]?.html.slice(0, 120)}`);
}

function renderWithShell(page: ReactNode, path = "/") {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <NavBar />
        <main id="main">{page}</main>
      </MemoryRouter>
    </AuthProvider>,
  );
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  resetAppConfigCache();
});

describe("accessibility (axe-core)", () => {
  const signedIn: [string, ComponentType, string][] = [
    ["Dashboard", Dashboard, "Your Life Overview"],
    ["Updates", Updates, "What happened today?"],
    ["Goals", Goals, "What are you working towards?"],
    ["Ask JDC", Ask, "Ask about your journal"],
    ["Account", Account, "Your account and data"],
    ["Life Profile", Onboarding, "Your Life Profile"],
  ];

  for (const [name, Page, heading] of signedIn) {
    it(`${name} has no violations`, async () => {
      setToken("t");
      routes();
      renderWithShell(<Page />);
      await screen.findByRole("heading", { level: 1, name: heading });
      await screen.findByRole("navigation");
      expect(await violations()).toEqual([]);
    });
  }

  for (const [name, Page] of [
    ["Login", Login],
    ["Sign up", Signup],
  ] as const) {
    it(`${name} has no violations`, async () => {
      routes();
      renderWithShell(<Page />);
      await screen.findByRole("button", { name: /Log in|Sign up/ });
      expect(await violations()).toEqual([]);
    });
  }
});
