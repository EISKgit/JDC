import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProtectedRoute } from "../src/components/ProtectedRoute";
import { AuthProvider } from "../src/context/AuthContext";
import { setToken } from "../src/api/client";

function renderAt(path: string) {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/login" element={<p>login page</p>} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <p>secret dashboard</p>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("ProtectedRoute", () => {
  it("redirects to /login when there is no token", async () => {
    renderAt("/dashboard");
    expect(await screen.findByText("login page")).toBeTruthy();
    expect(screen.queryByText("secret dashboard")).toBeNull();
  });

  it("renders the page when the token is valid", async () => {
    setToken("valid");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: 1, email: "a@b.com", full_name: null, created_at: "2026-01-01" })),
    );
    renderAt("/dashboard");
    expect(await screen.findByText("secret dashboard")).toBeTruthy();
  });

  it("clears a rejected token and redirects to /login", async () => {
    setToken("expired");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ detail: "Could not validate credentials" }), { status: 401 }),
    );
    renderAt("/dashboard");
    expect(await screen.findByText("login page")).toBeTruthy();
    expect(localStorage.getItem("ilc_token")).toBeNull();
  });
});

describe("ProtectedRoute when the server is unreachable", () => {
  it("keeps the saved login and offers a retry instead of logging out", async () => {
    setToken("still-valid");
    let down = true;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      if (down) throw new TypeError("Failed to fetch");
      return new Response(JSON.stringify({ id: 1, email: "a@b.com", full_name: null, created_at: "2026-01-01" }));
    });
    renderAt("/dashboard");

    expect(await screen.findByText(/Can't reach the server/)).toBeTruthy();
    expect(localStorage.getItem("ilc_token")).toBe("still-valid");
    expect(screen.queryByText("login page")).toBeNull();

    down = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("secret dashboard")).toBeTruthy();
  });
});
