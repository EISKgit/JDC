import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AskResponse, UpdateItem } from "../src/api/types";
import { dayKey } from "../src/lib/dates";
import { Ask } from "../src/pages/Ask";

const GYM: UpdateItem = {
  id: 12,
  content: "Went to the gym for leg day.",
  created_at: new Date(2026, 9, 7, 8, 30).toISOString(),
  events: [
    {
      id: 120,
      update_id: 12,
      category: "health",
      type: "exercise",
      description: "Went to the gym for leg day.",
      sentiment: "positive",
      confidence: 0.9,
      details: {},
      is_corrected: false,
      created_at: new Date(2026, 9, 7, 8, 30).toISOString(),
    },
  ],
};

type Body = { question: string; history: { role: string; content: string }[]; tz_offset_minutes: number };

function mockAsk(replies: (AskResponse | number)[]) {
  const bodies: Body[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    if (String(input).endsWith("/config")) {
      return new Response(JSON.stringify({ google_sign_in: false, ai: { external: true, vendor: "Groq" } }));
    }
    bodies.push(JSON.parse(String(init?.body)));
    const reply = replies[bodies.length - 1];
    if (typeof reply === "number") {
      return new Response(JSON.stringify({ detail: "Too many requests" }), { status: reply });
    }
    return new Response(JSON.stringify(reply));
  });
  return bodies;
}

function renderAsk() {
  return render(
    <MemoryRouter>
      <Ask />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
});

describe("Ask JDC", () => {
  it("answers with numbered citations linked to source entries", async () => {
    const bodies = mockAsk([{ answer: "You went on 7 October [#12].", sources: [GYM], used_ai: true }]);
    renderAsk();

    fireEvent.change(screen.getByLabelText("Your question"), { target: { value: "When did I go to the gym?" } });
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));

    const answer = await screen.findByText(/You went on 7 October/);
    // [#12] became a numbered reference, not raw text
    expect(answer.textContent).toBe("You went on 7 October 1.");
    expect(within(answer).getByTitle("Source 1").textContent).toBe("1");

    const sources = screen.getByRole("list", { name: "Sources" });
    const link = within(sources).getByRole("link");
    expect(link.getAttribute("href")).toBe(`/updates?date=${dayKey(new Date(GYM.created_at))}`);
    expect(link.textContent).toContain("Went to the gym for leg day.");

    expect(bodies[0]).toEqual({
      question: "When did I go to the gym?",
      history: [],
      tz_offset_minutes: new Date().getTimezoneOffset(),
    });
    expect(screen.queryByText(/Search only/)).toBeNull();
  });

  it("sends the conversation so far for follow-up questions", async () => {
    const bodies = mockAsk([
      { answer: "Twice this week [#12].", sources: [GYM], used_ai: true },
      { answer: "Leg day.", sources: [], used_ai: true },
    ]);
    renderAsk();

    fireEvent.click(screen.getByRole("button", { name: "When did I last go to the gym?" }));
    await screen.findByText(/Twice this week/);
    fireEvent.change(screen.getByLabelText("Your question"), { target: { value: "What did I train?" } });
    fireEvent.keyDown(screen.getByLabelText("Your question"), { key: "Enter" });

    await screen.findByText("Leg day.");
    expect(bodies[1].history).toEqual([
      { role: "user", content: "When did I last go to the gym?" },
      { role: "assistant", content: "Twice this week [#12]." },
    ]);
  });

  it("labels search-only answers when the AI is unavailable", async () => {
    mockAsk([{ answer: "AI answers are switched off. Closest entries:", sources: [GYM], used_ai: false }]);
    renderAsk();
    fireEvent.click(screen.getByRole("button", { name: "What have I been learning lately?" }));
    expect(await screen.findByText("Search only, AI unavailable")).toBeTruthy();
  });

  it("shows an error bubble and leaves it out of the history", async () => {
    const bodies = mockAsk([429, { answer: "Fine.", sources: [], used_ai: true }]);
    renderAsk();

    fireEvent.click(screen.getByRole("button", { name: "How was my week overall?" }));
    expect(await screen.findByText("Couldn't get an answer: Too many requests")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Your question"), { target: { value: "Try again" } });
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    await screen.findByText("Fine.");
    expect(bodies[1].history).toEqual([{ role: "user", content: "How was my week overall?" }]);
  });
});
