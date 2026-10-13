import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, getToken, setToken } from "../src/api/client";

function mockFetch(status: number, body?: unknown, statusText = "") {
  const response = new Response(body === undefined ? null : JSON.stringify(body), { status, statusText });
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(response);
}

afterEach(() => {
  localStorage.clear();
});

describe("token storage", () => {
  it("stores and clears the token", () => {
    setToken("abc");
    expect(getToken()).toBe("abc");
    setToken(null);
    expect(getToken()).toBeNull();
  });
});

describe("api requests", () => {
  it("sends the bearer token and JSON body", async () => {
    setToken("my-token");
    const fetchSpy = mockFetch(200, { ok: true });

    const result = await api.post<{ ok: boolean }>("/updates", { content: "hi" });

    expect(result).toEqual({ ok: true });
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toMatch(/\/updates$/);
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe(JSON.stringify({ content: "hi" }));
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer my-token");
  });

  it("omits the Authorization header when logged out", async () => {
    const fetchSpy = mockFetch(200, {});
    await api.get("/health");
    const headers = (fetchSpy.mock.calls[0][1]?.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });

  it("returns undefined for 204 No Content", async () => {
    mockFetch(204);
    await expect(api.delete("/goals/1")).resolves.toBeUndefined();
  });

  it("throws ApiError with the backend's detail message", async () => {
    mockFetch(409, { detail: "Email already registered" });
    const error = await api.post("/auth/register", {}).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(409);
    expect((error as ApiError).message).toBe("Email already registered");
  });

  it("turns 422 validation errors into readable text", async () => {
    const detail = [
      { loc: ["body", "new_password"], msg: "String should have at least 8 characters" },
      { loc: ["body"], msg: "Value error, Passwords don't match" },
    ];
    mockFetch(422, { detail });
    await expect(api.post("/auth/register", {})).rejects.toThrow(
      "new password: String should have at least 8 characters; Passwords don't match",
    );
  });

  it("stringifies any other non-string detail", async () => {
    mockFetch(400, { detail: { code: 7 } });
    await expect(api.post("/x", {})).rejects.toThrow('{"code":7}');
  });

  it("falls back to statusText when the error body is not JSON", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("oops", { status: 500, statusText: "Internal Server Error" }),
    );
    await expect(api.get("/dashboard")).rejects.toThrow("Internal Server Error");
  });
});
