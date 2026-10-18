import { KeyRound } from "lucide-react";
import { type FormEvent, useState } from "react";
import { authApi } from "../../api/endpoints";
import { PasswordInput } from "../PasswordInput";
import { useAuth } from "../../context/auth";
import { errorMessage } from "../../hooks/useAsync";

/** Change the password, or set a first one for Google-only accounts. */
export function ChangePassword() {
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
      const result = await authApi.changePassword(settingFirstPassword ? null : current, next);
      await loginWithToken(result.access_token); // other sessions are now signed out; keep this one
      setCurrent("");
      setNext("");
      setMessage({ ok: true, text: "Password saved. You've been signed out on other devices." });
    } catch (err) {
      setMessage({ ok: false, text: errorMessage(err, "Could not change the password") });
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
        <PasswordInput
          label="Current password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          required
          autoComplete="current-password"
        />
      )}
      <PasswordInput
        label="New password"
        value={next}
        onChange={(e) => setNext(e.target.value)}
        minLength={8}
        maxLength={72}
        required
        autoComplete="new-password"
        hint="8–72 characters, not a common password"
      />
      {message && <p className={message.ok ? "form-success" : "form-error"} role={message.ok ? "status" : "alert"}>{message.text}</p>}
      <button type="submit" className="btn-primary" disabled={saving}>
        {saving ? "Saving..." : "Save password"}
      </button>
    </form>
  );
}
