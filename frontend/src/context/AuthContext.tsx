import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { ApiError, SESSION_EXPIRED_EVENT, api, getToken, setToken } from "../api/client";
import type { Token, User } from "../api/types";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  /** Set when we have a saved login but couldn't check it (e.g. the server is down). */
  authError: string | null;
  retryAuth: () => void;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName?: string) => Promise<void>;
  /** Sign in with a token obtained elsewhere (Google sign-in, password reset, password change). */
  loginWithToken: (token: string) => Promise<void>;
  refreshUser: () => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  async function loadUser() {
    if (!getToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const me = await api.get<User>("/auth/me");
      setUser(me);
      setAuthError(null);
    } catch (err) {
      setUser(null);
      // Only a rejected token means "signed out" (the client already cleared it on 401).
      // Anything else, like the server being unreachable, must not throw the login away.
      if (err instanceof ApiError && err.status === 401) setToken(null);
      else setAuthError(err instanceof ApiError ? err.message : "Couldn't check your login");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUser();
    // The API client signals when the server rejects the token; protected pages
    // then redirect to /login.
    const onExpired = () => {
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
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, authError, retryAuth, login, register, loginWithToken, refreshUser: loadUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
