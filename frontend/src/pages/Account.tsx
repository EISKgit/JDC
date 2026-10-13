import { Download, KeyRound, LogOut, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, api, downloadFile } from "../api/client";
import type { Token } from "../api/types";
import { PrivacyNote } from "../components/Feedback";
import { useAuth } from "../context/AuthContext";
import { longDate, dayKey } from "../lib/dates";

function errorText(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

function ChangePassword() {
  const { user, loginWithToken } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const settingFirstPassword = user ? !user.has_password : false;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const result = await api.post<Token>("/auth/change-password", {
        current_password: settingFirstPassword ? null : current,
        new_password: next,
      });
      await loginWithToken(result.access_token); // other sessions are now signed out; keep this one
      setCurrent("");
      setNext("");
      setMessage({ ok: true, text: "Password saved. You've been signed out on other devices." });
    } catch (err) {
      setMessage({ ok: false, text: errorText(err, "Could not change the password") });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="card form-stack" onSubmit={handleSubmit}>
      <h2 className="card-heading">
        <KeyRound size={18} aria-hidden="true" />
        {settingFirstPassword ? "Set a password" : "Change password"}
      </h2>
      {settingFirstPassword && (
        <p className="hint">You signed up with Google. A password lets you log in with your email too.</p>
      )}
      {!settingFirstPassword && (
        <label>
          Current password
          <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
        </label>
      )}
      <label>
        New password
        <input
          type="password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          minLength={8}
          maxLength={72}
          required
        />
        <span className="field-hint">8–72 characters, not a common password</span>
      </label>
      {message && <p className={message.ok ? "form-success" : "form-error"}>{message.text}</p>}
      <button type="submit" className="btn-primary" disabled={saving}>
        {saving ? "Saving..." : "Save password"}
      </button>
    </form>
  );
}

function SignOutEverywhere() {
  const { loginWithToken } = useAuth();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await api.post<Token>("/auth/logout-all");
      await loginWithToken(result.access_token); // keep this device signed in
      setMessage({ ok: true, text: "Done. Every other device has been signed out." });
    } catch (err) {
      setMessage({ ok: false, text: errorText(err, "Could not sign out other devices") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2 className="card-heading">
        <LogOut size={18} aria-hidden="true" />
        Devices
      </h2>
      <p className="hint">
        Lost a phone or used a shared computer? This signs out everywhere except here. Changing your password does
        the same.
      </p>
      {message && <p className={message.ok ? "form-success" : "form-error"}>{message.text}</p>}
      <button type="button" className="btn-secondary" onClick={handleClick} disabled={busy}>
        {busy ? "Signing out..." : "Sign out of all other devices"}
      </button>
    </section>
  );
}

function DeleteAccount() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete(e: FormEvent) {
    e.preventDefault();
    setDeleting(true);
    setError(null);
    try {
      await api.delete("/auth/me", { password: user?.has_password ? password : null, confirm });
      logout();
      navigate("/signup", { replace: true });
    } catch (err) {
      setError(errorText(err, "Could not delete the account"));
      setDeleting(false);
    }
  }

  return (
    <section className="card danger-zone">
      <h2 className="card-heading">
        <Trash2 size={18} aria-hidden="true" />
        Delete account
      </h2>
      <p>Permanently deletes your account, Life Profile, goals, and every update and statement. This can't be undone.</p>
      {!open ? (
        <button type="button" className="btn-danger" onClick={() => setOpen(true)}>
          Delete my account...
        </button>
      ) : (
        <form className="form-stack" onSubmit={handleDelete}>
          {user?.has_password && (
            <label>
              Your password
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </label>
          )}
          <label>
            Type DELETE to confirm
            <input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" required />
          </label>
          {error && <p className="form-error">{error}</p>}
          <div className="delete-confirm-actions">
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)} disabled={deleting}>
              Cancel
            </button>
            <button type="submit" className="btn-danger" disabled={deleting || confirm !== "DELETE"}>
              {deleting ? "Deleting..." : "Delete everything"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

export function Account() {
  const { user } = useAuth();
  const [exportError, setExportError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    setExporting(true);
    setExportError(null);
    try {
      await downloadFile("/auth/me/export", "jdc-export.json");
    } catch (err) {
      setExportError(errorText(err, "Could not export your data"));
    } finally {
      setExporting(false);
    }
  }

  if (!user) return null;

  return (
    <div className="page">
      <header className="page-header">
        <p className="eyebrow">Account</p>
        <h1>Your account and data</h1>
      </header>

      <section className="card account-summary">
        <span className="avatar avatar-large" aria-hidden="true">
          {(user.full_name || user.email).charAt(0).toUpperCase()}
        </span>
        <div>
          <strong>{user.full_name || "No name set"}</strong>
          <p>
            <UserRound size={14} aria-hidden="true" /> {user.email} · member since{" "}
            {longDate(dayKey(new Date(user.created_at)))}
          </p>
        </div>
      </section>

      <ChangePassword />

      <SignOutEverywhere />

      <section className="card">
        <h2 className="card-heading">
          <ShieldCheck size={18} aria-hidden="true" />
          Your data
        </h2>
        <PrivacyNote compact />
        <p>Download everything JDC stores about you (profile, goals, updates and statements) as one JSON file.</p>
        {exportError && <p className="form-error">{exportError}</p>}
        <button type="button" className="btn-secondary" onClick={handleExport} disabled={exporting}>
          <Download size={16} aria-hidden="true" />
          {exporting ? "Preparing..." : "Export my data"}
        </button>
      </section>

      <DeleteAccount />
    </div>
  );
}
