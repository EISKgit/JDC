import { MailCheck } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ApiError } from "../api/client";
import { authApi } from "../api/endpoints";
import { errorMessage } from "../hooks/useAsync";
import { AuthLayout } from "../components/AuthLayout";
import { useAuth } from "../context/auth";
import { usePageTitle } from "../lib/usePageTitle";

export function ForgotPassword() {
  usePageTitle("Forgot password");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await authApi.forgotPassword(email);
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout>
      <form className="auth-card" onSubmit={handleSubmit}>
        <h2>Reset your password</h2>
        {sent ? (
          <div className="auth-success" role="status">
            <MailCheck size={20} aria-hidden="true" />
            <p>If an account exists for {email}, we've sent a link to reset its password. It's valid for 30 minutes.</p>
          </div>
        ) : (
          <>
            <p className="auth-subtitle">Enter your email and we'll send you a reset link.</p>
            <label>
              Email
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? "Sending..." : "Send reset link"}
            </button>
          </>
        )}
        <p className="auth-switch">
          <Link to="/login">Back to log in</Link>
        </p>
      </form>
    </AuthLayout>
  );
}

export function ResetPassword() {
  usePageTitle("Reset password");
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const { loginWithToken } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("The two passwords don't match");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const result = await authApi.resetPassword(token, password);
      await loginWithToken(result.access_token);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? "This reset link has expired or was already used. Request a new one."
          : err instanceof ApiError
            ? err.message
            : "Something went wrong",
      );
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout>
      <form className="auth-card" onSubmit={handleSubmit}>
        <h2>Choose a new password</h2>
        {!token ? (
          <p className="form-error" role="alert">This link is incomplete. Request a new one below.</p>
        ) : (
          <>
            <p className="auth-subtitle">You'll be signed in right after.</p>
            <label>
              New password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                maxLength={72}
                required
              />
              <span className="field-hint">8–72 characters, not a common password</span>
            </label>
            <label>
              Confirm new password
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
            </label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? "Saving..." : "Save password"}
            </button>
          </>
        )}
        <p className="auth-switch">
          <Link to="/forgot-password">Request a new link</Link>
        </p>
      </form>
    </AuthLayout>
  );
}
