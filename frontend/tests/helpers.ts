import { vi } from "vitest";

export interface Call {
  method: string;
  url: string;
  body: unknown;
}

type Handler = (call: Call) => unknown | Response;

/** Mock fetch by "METHOD /path" (path after /api/v1). Unmatched requests get a 404. */
export function mockRoutes(routes: Record<string, Handler | unknown>): Call[] {
  const calls: Call[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const call = { method, url, body };
    calls.push(call);
    const path = url.replace(/^.*\/api\/v1/, "");
    const key = Object.keys(routes).find((k) => k === `${method} ${path}` || k === `${method} ${path.split("?")[0]}`);
    if (!key) return new Response(JSON.stringify({ detail: "Not found" }), { status: 404 });
    const route = routes[key];
    const result = typeof route === "function" ? (route as Handler)(call) : route;
    if (result instanceof Response) return result;
    return result === undefined ? new Response(null, { status: 204 }) : new Response(JSON.stringify(result));
  });
  return calls;
}

export const USER = {
  id: 1,
  email: "asha@example.com",
  full_name: "Asha",
  created_at: "2026-10-01T09:00:00Z",
  has_password: true,
};

export const CONFIG = (overrides: { google?: boolean; external?: boolean } = {}) => ({
  google_sign_in: overrides.google ?? false,
  ai: { external: overrides.external ?? false, vendor: overrides.external ? "Groq" : null },
});
