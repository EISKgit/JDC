import { LogOut } from "lucide-react";
import { useState } from "react";
import { authApi } from "../../api/endpoints";
import { useAuth } from "../../context/auth";
import { errorMessage } from "../../hooks/useAsync";

/** "Sign out of all other devices". */
export function SignOutEverywhere() {
  const { loginWithToken } = useAuth();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await authApi.logoutEverywhere();
      await loginWithToken(result.access_token); // keep this device signed in
      setMessage({ ok: true, text: "Done. Every other device has been signed out." });
    } catch (err) {
      setMessage({ ok: false, text: errorMessage(err, "Could not sign out other devices") });
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
      {message && <p className={message.ok ? "form-success" : "form-error"} role={message.ok ? "status" : "alert"}>{message.text}</p>}
      <button type="button" className="btn-secondary" onClick={handleClick} disabled={busy}>
        {busy ? "Signing out..." : "Sign out of all other devices"}
      </button>
    </section>
  );
}
