import { CloudOff, ShieldCheck } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { API_BASE_URL } from "../api/client";
import { useAppConfig } from "../lib/appConfig";

/** Shown when a page's data couldn't load, instead of an endless "Loading...". */
export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="page">
      <div className="card load-error" role="alert">
        <CloudOff className="load-error-icon" size={28} aria-hidden="true" />
        <div>
          <h2>Couldn't load this page</h2>
          <p>{message}</p>
          <button type="button" className="btn-primary btn-small" onClick={onRetry}>
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}

/** Catches rendering crashes so one broken component doesn't blank the whole app. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unexpected UI error", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="page">
        <div className="card load-error" role="alert">
          <CloudOff className="load-error-icon" size={28} aria-hidden="true" />
          <div>
            <h2>Something went wrong</h2>
            <p>An unexpected error happened on this page. Reloading usually fixes it.</p>
            <button type="button" className="btn-primary btn-small" onClick={() => window.location.reload()}>
              Reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}

/** Tells people their journal text goes to an outside AI service (only when one is configured). */
export function PrivacyNote({ compact = false }: { compact?: boolean }) {
  const config = useAppConfig();
  if (!config?.ai.external) return null;
  return (
    <p className={`privacy-note ${compact ? "privacy-note-compact" : ""}`}>
      <ShieldCheck size={15} aria-hidden="true" />
      <span>
        Your entries are sent to {config.ai.vendor} to sort them into life areas and to answer questions, and{" "}
        {config.ai.vendor}'s own data policy applies to what it receives. JDC itself keeps them only in its own
        database; you can export or delete everything from your Account page.
      </span>
    </p>
  );
}

/** "Continue with Google", shown only when the server has Google sign-in configured. */
export function GoogleButton() {
  const config = useAppConfig();
  if (!config?.google_sign_in) return null;
  return (
    <>
      <a className="btn-google" href={`${API_BASE_URL}/auth/google/login`}>
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z" />
          <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
          <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
          <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.2-.1-2.3-.4-3.5z" />
        </svg>
        Continue with Google
      </a>
      <div className="auth-divider">
        <span>or</span>
      </div>
    </>
  );
}
