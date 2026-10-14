import { type ReactNode, useEffect, useState } from "react";
import { SESSION_EXPIRED_EVENT, api, setToken } from "../api/client";
import type { Token, User } from "../api/types";
import { clearAskHistory } from "../lib/askHistory";
import { AuthContext, type LoginCheck, checkLogin } from "./auth";

// This file only exports a component (React fast refresh needs that); the context
// object, useAuth() and the login check live in ./auth.ts.

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  function apply(result: LoginCheck) {
    setUser(result.user);
    setAuthError(result.error);
    setLoading(false);
  }

  async function loadUser() {
    apply(await checkLogin());
  }

  useEffect(() => {
    checkLogin().then(apply);
    // The API client signals when the server rejects the token; protected pages
    // then redirect to /login.
    const onExpired = () => {
      clearAskHistory();
      setUser(null);
      setAuthError(null);
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, []);

  async function loginWithToken(token: string) {
    setToken(token);
    await loadUser();
  }

  async function login(email: string, password: string) {
    const token = await api.post<Token>("/auth/login", { email, password });
    await loginWithToken(token.access_token);
  }

  async function register(email: string, password: string, fullName?: string) {
    const token = await api.post<Token>("/auth/register", {
      email,
      password,
      full_name: fullName || null,
    });
    await loginWithToken(token.access_token);
  }

  function retryAuth() {
    setLoading(true);
    setAuthError(null);
    loadUser();
  }

  function logout() {
    clearAskHistory(); // answers quote the journal: don't leave them for the next person
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider
      value={{ user, loading, authError, retryAuth, login, register, loginWithToken, refreshUser: loadUser, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}
