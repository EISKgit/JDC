import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, SESSION_EXPIRED_EVENT, api, getToken, setToken, takeSessionExpired } from "../src/api/client";
import { AuthProvider } from "../src/context/AuthContext";
import { resetAppConfigCache } from "../src/lib/appConfig";
import { Account } from "../src/pages/Account";
import { AuthCallback } from "../src/pages/AuthCallback";
import { Dashboard } from "../src/pages/Dashboard";
import { Login } from "../src/pages/Login";
import { ForgotPassword, ResetPassword } from "../src/pages/PasswordReset";
import { Signup } from "../src/pages/Signup";
import { CONFIG, USER, mockRoutes } from "./helpers";

function renderAt(path: string, element: React.ReactNode, routePath = path.split(/[?#]/)[0]) {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={routePath} element={element} />
          <Route path="/login" element={<Login />} />
          <Route path="/dashboard" element={<p>dashboard page</p>} />
          <Route path="/signup" element={<p>signup page</p>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  resetAppConfigCache();
  window.location.hash = "";
});

describe("API client: expired sessions and offline errors", () => {
  it("ends the session when a signed-in request gets 401", async () => {
    setToken("old-token");
    const expired = vi.fn();
    window.addEventListener(SESSION_EXPIRED_EVENT, expired);
    mockRoutes({ "GET /updates": new Response(JSON.stringify({ detail: "Session expired" }), { status: 401 }) });

    await expect(api.get("/updates")).rejects.toThrow("Session expired");
    expect(getToken()).toBeNull();
    expect(expired).toHaveBeenCalledOnce();
    expect(takeSessionExpired()).toBe(true);
    expect(takeSessionExpired()).toBe(false); // shown once
    window.removeEventListener(SESSION_EXPIRED_EVENT, expired);
  });

  it("does not treat a wrong password (401 while signed out) as an expired session", async () => {
    mockRoutes({ "POST /auth/login": new Response(JSON.stringify({ detail: "Incorrect" }), { status: 401 }) });
    await expect(api.post("/auth/login", {})).rejects.toThrow("Incorrect");
    expect(takeSessionExpired()).toBe(false);
  });

  it("turns a network failure into a readable error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    const error = await api.get("/dashboard").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(0);
    expect((error as ApiError).message).toMatch(/Can't reach the server/);
  });
});

describe("Pages that fail to load", () => {
  it("show the error with a Try again button that reloads", async () => {
    let fail = true;
    mockRoutes({
      "GET /dashboard": () =>
        fail ? new Response(JSON.stringify({ detail: "Server error" }), { status: 500 }) : DASHBOARD,
      "GET /categories": [],
      "GET /config": CONFIG(),
    });
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );
    expect(await screen.findByText("Couldn't load this page")).toBeTruthy();
    expect(screen.getByText("Server error")).toBeTruthy();

    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Your Life Overview")).toBeTruthy();
  });
});

const DASHBOARD = {
  overall_score: 50,
  category_scores: [],
  top_observation: "",
  warnings: [],
  recommendation: "",
  forecast_7day: [],
};

describe("Login page", () => {
  it("shows Google sign-in and the forgot-password link when Google is configured", async () => {
    mockRoutes({ "GET /config": CONFIG({ google: true }) });
    renderAt("/login", <Login />);
    const google = await screen.findByRole("link", { name: /Continue with Google/ });
    expect(google.getAttribute("href")).toMatch(/\/api\/v1\/auth\/google\/login$/);
    expect(screen.getByRole("link", { name: "Forgot password?" }).getAttribute("href")).toBe("/forgot-password");
  });

  it("hides Google sign-in when it isn't configured", async () => {
    const calls = mockRoutes({ "GET /config": CONFIG({ google: false }) });
    renderAt("/login", <Login />);
    await waitFor(() => expect(calls.some((c) => c.url.endsWith("/config"))).toBe(true));
    expect(screen.queryByRole("link", { name: /Continue with Google/ })).toBeNull();
  });

  it("explains that the session expired", async () => {
    sessionStorage.setItem("jdc_session_expired", "1");
    mockRoutes({ "GET /config": CONFIG() });
    renderAt("/login", <Login />);
    expect(await screen.findByText("Your session expired. Please log in again.")).toBeTruthy();
  });
});

describe("Google sign-in callback", () => {
  it("stores the token from the URL fragment and goes to the dashboard", async () => {
    mockRoutes({ "GET /auth/me": USER, "GET /config": CONFIG() });
    window.location.hash = "#token=google-jwt";
    renderAt("/auth/callback", <AuthCallback />);
    expect(await screen.findByText("dashboard page")).toBeTruthy();
    expect(getToken()).toBe("google-jwt");
    expect(window.location.hash).toBe(""); // token removed from the address bar
  });

  it("shows the error on the login page", async () => {
    mockRoutes({ "GET /config": CONFIG() });
    window.location.hash = "#error=Google+sign-in+was+cancelled";
    renderAt("/auth/callback", <AuthCallback />);
    expect(await screen.findByText("Google sign-in was cancelled")).toBeTruthy();
    expect(getToken()).toBeNull();
  });
});

describe("Password reset", () => {
  it("forgot password always shows the same confirmation", async () => {
    const calls = mockRoutes({ "POST /auth/forgot-password": { detail: "ok" } });
    renderAt("/forgot-password", <ForgotPassword />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "asha@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
    expect(await screen.findByText(/If an account exists for asha@example.com/)).toBeTruthy();
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({ email: "asha@example.com" });
  });

  it("reset checks the two passwords match, then signs in", async () => {
    const calls = mockRoutes({
      "POST /auth/reset-password": { access_token: "fresh", token_type: "bearer" },
      "GET /auth/me": USER,
    });
    renderAt("/reset-password?token=abc", <ResetPassword />);
    fireEvent.change(screen.getByLabelText(/^New password/), { target: { value: "new-password" } });
    fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "different" } });
    fireEvent.click(screen.getByRole("button", { name: "Save password" }));
    expect(screen.getByText("The two passwords don't match")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "new-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Save password" }));
    expect(await screen.findByText("dashboard page")).toBeTruthy();
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({ token: "abc", new_password: "new-password" });
    expect(getToken()).toBe("fresh");
  });

  it("explains an expired or used link", async () => {
    mockRoutes({
      "POST /auth/reset-password": new Response(JSON.stringify({ detail: "Invalid" }), { status: 401 }),
    });
    renderAt("/reset-password?token=old", <ResetPassword />);
    fireEvent.change(screen.getByLabelText(/^New password/), { target: { value: "new-password" } });
    fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "new-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Save password" }));
    expect(await screen.findByText(/expired or was already used/)).toBeTruthy();
  });
});

describe("Account page", () => {
  function renderAccount(user = USER, extra: Record<string, unknown> = {}) {
    setToken("t");
    const calls = mockRoutes({ "GET /auth/me": user, "GET /config": CONFIG({ external: true }), ...extra });
    renderAt("/account", <Account />);
    return calls;
  }

  it("changes the password and keeps you signed in", async () => {
    const calls = renderAccount(USER, { "POST /auth/change-password": { access_token: "rotated", token_type: "bearer" } });
    fireEvent.change(await screen.findByLabelText("Current password"), { target: { value: "old-password" } });
    fireEvent.change(screen.getByLabelText(/^New password/), { target: { value: "new-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Save password" }));
    expect(await screen.findByText(/Password saved/)).toBeTruthy();
    expect(calls.find((c) => c.url.endsWith("/change-password"))?.body).toEqual({
      current_password: "old-password",
      new_password: "new-password",
    });
    expect(getToken()).toBe("rotated");
  });

  it("lets Google-only accounts set a first password without a current one", async () => {
    renderAccount({ ...USER, has_password: false });
    expect(await screen.findByRole("heading", { name: "Set a password" })).toBeTruthy();
    expect(screen.queryByLabelText("Current password")).toBeNull();
  });

  it("shows the privacy note when an outside AI is used", async () => {
    renderAccount();
    expect(await screen.findByText(/Your entries are sent to Groq/)).toBeTruthy();
  });

  it("exports data as a file download", async () => {
    const createUrl = vi.fn(() => "blob:export");
    URL.createObjectURL = createUrl;
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    renderAccount(USER, {
      "GET /auth/me/export": new Response(JSON.stringify({ updates: [] }), {
        headers: { "Content-Disposition": 'attachment; filename="jdc-export-2026-10-12.json"' },
      }),
    });
    fireEvent.click(await screen.findByRole("button", { name: "Export my data" }));
    await waitFor(() => expect(click).toHaveBeenCalledOnce());
    expect(createUrl).toHaveBeenCalledOnce();
    expect((click.mock.instances[0] as unknown as HTMLAnchorElement).download).toBe("jdc-export-2026-10-12.json");
  });

  it("only deletes the account after typing DELETE and the password", async () => {
    const calls = renderAccount(USER, { "DELETE /auth/me": undefined });
    fireEvent.click(await screen.findByRole("button", { name: "Delete my account..." }));
    const confirmButton = screen.getByRole("button", { name: "Delete everything" }) as HTMLButtonElement;
    fireEvent.change(screen.getByLabelText("Your password"), { target: { value: "pw-123456" } });
    fireEvent.change(screen.getByLabelText("Type DELETE to confirm"), { target: { value: "delete" } });
    expect(confirmButton.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("Type DELETE to confirm"), { target: { value: "DELETE" } });
    fireEvent.click(confirmButton);
    expect(await screen.findByText("signup page")).toBeTruthy();
    expect(calls.find((c) => c.method === "DELETE")?.body).toEqual({ password: "pw-123456", confirm: "DELETE" });
    expect(getToken()).toBeNull();
  });
});

describe("Sign-up privacy note", () => {
  it("is shown only when entries go to an outside AI", async () => {
    mockRoutes({ "GET /config": CONFIG({ external: true }) });
    renderAt("/signup-form", <Signup />);
    expect(await screen.findByText(/Your entries are sent to Groq/)).toBeTruthy();
    cleanup();
    resetAppConfigCache();

    const calls = mockRoutes({ "GET /config": CONFIG({ external: false }) });
    renderAt("/signup-form", <Signup />);
    await waitFor(() => expect(calls.some((c) => c.url.endsWith("/config"))).toBe(true));
    expect(screen.queryByText(/Your entries are sent to/)).toBeNull();
  });
});
