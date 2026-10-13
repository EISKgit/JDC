import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError } from "../api/client";
import { AuthLayout } from "../components/AuthLayout";
import { GoogleButton, PrivacyNote } from "../components/Feedback";
import { useAuth } from "../context/AuthContext";

export function Signup() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await register(email, password, fullName);
      navigate("/onboarding");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sign up failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout>
      <form className="auth-card" onSubmit={handleSubmit}>
        <h2>Create your account</h2>
        <p className="auth-subtitle">Takes under a minute to get started.</p>
        <GoogleButton />
        <label>
          Full name (optional)
          <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </label>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Password
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
        {error && <p className="form-error">{error}</p>}
        <PrivacyNote compact />
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? "Creating account..." : "Sign up"}
        </button>
        <p className="auth-switch">
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </form>
    </AuthLayout>
  );
}
