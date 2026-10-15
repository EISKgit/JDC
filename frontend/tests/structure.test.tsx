/// <reference types="node" />
// ^ the architecture check reads source files from disk.
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { ApiError } from "../src/api/client";
import type { UpdateItem } from "../src/api/types";
import { useAsync } from "../src/hooks/useAsync";
import { weeklyActivity } from "../src/lib/goals";
import { Onboarding } from "../src/pages/Onboarding";
import { Updates } from "../src/pages/Updates";
import { mockRoutes } from "./helpers";

afterEach(() => {
  cleanup();
});

// ------------------------------------------------------------ architecture rule

describe("frontend layering", () => {
  it("only src/api talks to the backend directly; everything else uses the typed endpoints", () => {
    const src = join(__dirname, "..", "src");
    const files = (function walk(dir: string): string[] {
      return readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        return statSync(path).isDirectory() ? walk(path) : /\.tsx?$/.test(name) ? [path] : [];
      });
    })(src);
    const offenders = files
      .filter((f) => !relative(src, f).startsWith("api"))
      .filter((f) => /\bapi\.(get|post|put|patch|delete)\b/.test(readFileSync(f, "utf8")))
      .map((f) => relative(src, f));
    expect(offenders).toEqual([]);
  });
});

// ------------------------------------------------------------ useAsync

describe("useAsync", () => {
  it("loads, reports errors, and retries", async () => {
    let fail = true;
    const { result } = renderHook(() =>
      useAsync(async () => {
        if (fail) throw new ApiError(500, "Server error");
        return 42;
      }),
    );
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.error).toBe("Server error"));
    expect(result.current.data).toBeNull();

    fail = false;
    act(() => result.current.retry());
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.data).toBe(42));
    expect(result.current.error).toBeNull();
  });

  it("ignores an answer that arrives after the page is gone", async () => {
    let resolve: (value: number) => void = () => {};
    const { result, unmount } = renderHook(() => useAsync(() => new Promise<number>((r) => (resolve = r))));
    unmount();
    await act(async () => resolve(1));
    expect(result.current.data).toBeNull(); // no state update on an unmounted component
  });

  it("lets the page update loaded data locally", async () => {
    const { result } = renderHook(() => useAsync(async () => [1, 2]));
    await waitFor(() => expect(result.current.data).toEqual([1, 2]));
    act(() => result.current.setData((prev) => [...(prev ?? []), 3]));
    expect(result.current.data).toEqual([1, 2, 3]);
  });
});

// ------------------------------------------------------------ pure helpers

describe("weeklyActivity", () => {
  it("counts this week's events per life area", () => {
    const now = new Date(2026, 9, 15, 12).getTime();
    const at = (days: number) => new Date(now - days * 86_400_000).toISOString();
    const update = (days: number, categories: string[]) =>
      ({ id: days, content: "", created_at: at(days), events: categories.map((category) => ({ category })) }) as unknown as UpdateItem;

    const counts = weeklyActivity([update(1, ["health", "health"]), update(3, ["learning"]), update(9, ["health"])], now);
    expect(Object.fromEntries(counts)).toEqual({ health: 2, learning: 1 });
  });
});

// ------------------------------------------------------------ Life Profile (container + form)

describe("Life Profile", () => {
  const CATEGORIES = [
    { value: "health", label: "Health" },
    { value: "learning", label: "Learning" },
  ];

  it("pre-fills the saved profile and saves changes", async () => {
    const calls = mockRoutes({
      "GET /categories": CATEGORIES,
      "GET /onboarding": { about: "Developer", goals_text: null, challenges: null, focus_categories: ["health"], ai_summary: null },
      "PUT /onboarding": ({ body }: { body: unknown }) => ({ ...(body as object), ai_summary: "Focused on health and learning." }),
      "GET /config": { google_sign_in: false, ai: { external: false, vendor: null } },
    });
    render(
      <MemoryRouter>
        <Onboarding />
      </MemoryRouter>,
    );
    const about = (await screen.findByLabelText("Tell us a little about yourself")) as HTMLTextAreaElement;
    expect(about.value).toBe("Developer");
    expect((screen.getByRole("checkbox", { name: /Health/ }) as HTMLInputElement).checked).toBe(true);

    fireEvent.click(screen.getByRole("checkbox", { name: /Learning/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save Life Profile" }));
    expect(await screen.findByText("Focused on health and learning.")).toBeTruthy();
    expect(calls.find((c) => c.method === "PUT")?.body).toEqual({
      about: "Developer",
      goals_text: null,
      challenges: null,
      focus_categories: ["health", "learning"],
    });
  });
});

// ------------------------------------------------------------ bug fix: failed saves are reported

describe("Writing an update", () => {
  it("keeps the text and explains when an update couldn't be saved", async () => {
    mockRoutes({
      "GET /categories": [],
      "GET /updates": [],
      "POST /updates": new Response(JSON.stringify({ detail: "Too many requests. Please try again in 30 seconds." }), {
        status: 429,
      }),
    });
    render(
      <MemoryRouter>
        <Updates />
      </MemoryRouter>,
    );
    const box = (await screen.findByLabelText("Your update")) as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "Went to the gym" } });
    fireEvent.click(screen.getByRole("button", { name: "Add update" }));

    expect(await screen.findByText("Too many requests. Please try again in 30 seconds.")).toBeTruthy();
    expect(box.value).toBe("Went to the gym"); // nothing typed is lost
  });
});
