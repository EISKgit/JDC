import { Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { authApi } from "../../api/endpoints";
import { useAuth } from "../../context/auth";
import { errorMessage } from "../../hooks/useAsync";

/** Permanent account deletion, behind password + typed confirmation. */
export function DeleteAccount() {
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
      await authApi.deleteAccount(user?.has_password ? password : null, confirm);
      logout();
      navigate("/signup", { replace: true });
    } catch (err) {
      setError(errorMessage(err, "Could not delete the account"));
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
