import { type FormEvent, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ApiError, takeSessionExpired } from "../api/client";
import { PasswordInput } from "../components/PasswordInput";
import { AuthLayout } from "../components/AuthLayout";
import { GoogleButton } from "../components/Feedback";
import { useAuth } from "../context/auth";
import { usePageTitle } from "../lib/usePageTitle";

export function Login() {
  usePageTitle("Log in");
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const location = useLocation();
  // An error passed from Google sign-in (/auth/callback), or a note that the session expired.
  const [error, setError] = useState<string | null>(
    () => (location.state as { error?: string } | null)?.error ?? null,
  );
  const [expired] = useState(takeSessionExpired);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout>
      <form className="auth-card" onSubmit={handleSubmit}>
        <h2>Welcome back</h2>
        <p className="auth-subtitle">Log in to see how your week is going.</p>
        {expired && !error && <p className="form-notice" role="status">Your session expired. Please log in again.</p>}
        <GoogleButton />
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <PasswordInput
          label="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          rowExtra={
            <Link to="/forgot-password" className="label-link">
              Forgot password?
            </Link>
          }
        />
        {error && <p className="form-error" role="alert">{error}</p>}
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? "Logging in..." : "Log in"}
        </button>
        <p className="auth-switch">
          No account? <Link to="/signup">Sign up</Link>
        </p>
      </form>
    </AuthLayout>
  );
}
