import { Download, ShieldCheck, UserRound } from "lucide-react";
import { useState } from "react";
import { downloadFile } from "../api/client";
import { ChangePassword } from "../components/account/ChangePassword";
import { DeleteAccount } from "../components/account/DeleteAccount";
import { ProfilePicture } from "../components/account/ProfilePicture";
import { SignOutEverywhere } from "../components/account/SignOutEverywhere";
import { PrivacyNote } from "../components/Feedback";
import { useAuth } from "../context/auth";
import { errorMessage } from "../hooks/useAsync";
import { dayKey, longDate } from "../lib/dates";
import { usePageTitle } from "../lib/usePageTitle";

export function Account() {
  usePageTitle("Account");
  const { user } = useAuth();
  const [exportError, setExportError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    setExporting(true);
    setExportError(null);
    try {
      await downloadFile("/auth/me/export", "jdc-export.json");
    } catch (err) {
      setExportError(errorMessage(err, "Could not export your data"));
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
          {user.profile_picture_url ? (
            <img src={user.profile_picture_url} alt="" />
          ) : (
            (user.full_name || user.email).charAt(0).toUpperCase()
          )}
        </span>
        <div>
          <strong>{user.full_name || "No name set"}</strong>
          <p>
            <UserRound size={14} aria-hidden="true" /> {user.email} · member since{" "}
            {longDate(dayKey(new Date(user.created_at)))}
          </p>
        </div>
      </section>

      <ProfilePicture />

      <ChangePassword />

      <SignOutEverywhere />

      <section className="card">
        <h2 className="card-heading">
          <ShieldCheck size={18} aria-hidden="true" />
          Your data
        </h2>
        <PrivacyNote compact />
        <p>Download everything JDC stores about you (profile, goals, updates and statements) as one JSON file.</p>
        {exportError && <p className="form-error" role="alert">{exportError}</p>}
        <button type="button" className="btn-secondary" onClick={handleExport} disabled={exporting}>
          <Download size={16} aria-hidden="true" />
          {exporting ? "Preparing..." : "Export my data"}
        </button>
      </section>

      <DeleteAccount />
    </div>
  );
}
