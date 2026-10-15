import { createContext, useContext } from "react";
import { ApiError, getToken, setToken } from "../api/client";
import { authApi } from "../api/endpoints";
import type { User } from "../api/types";

export interface AuthContextValue {
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

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export interface LoginCheck {
  user: User | null;
  error: string | null;
}

/** Who is signed in, according to the saved token. Never throws. */
export async function checkLogin(): Promise<LoginCheck> {
  if (!getToken()) return { user: null, error: null };
  try {
    return { user: await authApi.me(), error: null };
  } catch (err) {
    // Only a rejected token means "signed out" (the client already cleared it on 401).
    // Anything else, like the server being unreachable, must not throw the login away.
    if (err instanceof ApiError && err.status === 401) {
      setToken(null);
      return { user: null, error: null };
    }
    return { user: null, error: err instanceof ApiError ? err.message : "Couldn't check your login" };
  }
}
