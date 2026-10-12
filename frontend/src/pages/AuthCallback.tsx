import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

/** Where the backend sends the browser after Google sign-in: /auth/callback#token=... or #error=... */
export function AuthCallback() {
  const { loginWithToken } = useAuth();
  const navigate = useNavigate();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return; // StrictMode runs effects twice in development
    handled.current = true;
    const params = new URLSearchParams(window.location.hash.slice(1));
    // Remove the token from the address bar and history right away.
    window.history.replaceState(null, "", window.location.pathname);
    const token = params.get("token");
    if (!token) {
      navigate("/login", { replace: true, state: { error: params.get("error") ?? "Google sign-in failed" } });
      return;
    }
    loginWithToken(token).then(() => navigate("/dashboard", { replace: true }));
  }, [loginWithToken, navigate]);

  return <div className="page-center">Signing you in...</div>;
}
