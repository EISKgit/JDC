import { Image as ImageIcon, ImageMinus, ImagePlus, RotateCcw } from "lucide-react";
import { type FormEvent, useRef, useState } from "react";
import { authApi } from "../../api/endpoints";
import { ApiError } from "../../api/client";
import { useAuth } from "../../context/auth";
import { ProfilePictureViewer } from "./ProfilePictureViewer";

/** Max width/height (px) the uploaded image is resized to before it's uploaded. */
const MAX_IMAGE_SIZE = 256;

/** Resize an image file to a JPEG data URL no larger than MAX_IMAGE_SIZE on each side. */
function resizeImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      let width = img.width;
      let height = img.height;
      if (width > height && width > MAX_IMAGE_SIZE) {
        height = Math.round((height * MAX_IMAGE_SIZE) / width);
        width = MAX_IMAGE_SIZE;
      } else if (height > MAX_IMAGE_SIZE) {
        width = Math.round((width * MAX_IMAGE_SIZE) / height);
        height = MAX_IMAGE_SIZE;
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Could not resize the image"));
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", 0.6));
    };
    img.onerror = () => reject(new Error("Could not read the image file"));
    img.src = URL.createObjectURL(file);
  });
}

export function ProfilePicture() {
  const { user, refreshUser } = useAuth();
  const fileInput = useRef<HTMLInputElement>(null);
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [viewingPicture, setViewingPicture] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function pickFile() {
    setMessage(null);
    fileInput.current?.click();
    setPicking(true);
  }

  async function handleFile(e: FormEvent<HTMLInputElement>) {
    const file = e.currentTarget.files?.[0];
    setPicking(false);
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setMessage({ ok: false, text: "Please choose an image file (PNG/JPEG/WEBP)." });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const dataUrl = await resizeImage(file);
      await authApi.updateProfilePicture(dataUrl);
      await refreshUser();
      setMessage({ ok: true, text: "Profile picture updated." });
    } catch (err) {
      const apiMsg = err instanceof ApiError ? err.message : null;
      setMessage({
        ok: false,
        text: apiMsg ?? (err instanceof Error ? err.message : "Could not update your profile picture"),
      });
    } finally {
      setSaving(false);
      // Reset the input via the ref (e.currentTarget can be null after an await).
      const input = fileInput.current;
      if (input) input.value = "";
    }
  }

  function clearPicture() {
    setSaving(true);
    setMessage(null);
    void authApi
      .updateProfilePicture("")
      .then(() => refreshUser())
      .then(() => setMessage({ ok: true, text: "Profile picture removed." }))
      .catch((err) => {
        const apiMsg = err instanceof ApiError ? err.message : null;
        setMessage({
          ok: false,
          text: apiMsg ?? (err instanceof Error ? err.message : "Could not remove your profile picture"),
        });
      })
      .finally(() => setSaving(false));
  }

  const hasPicture = Boolean(user?.profile_picture_url);

  return (
    <section className="card form-stack">
      <h2 className="card-heading">
        <ImageIcon size={18} aria-hidden="true" />
        Profile picture
      </h2>
      <p>Choose a photo to show next to your name in the navbar and on your account page.</p>

      <div className="profile-picker">
        <label className="profile-picker-trigger" aria-hidden="true">
          {hasPicture ? (
            <img
              src={user!.profile_picture_url}
              alt=""
              className="profile-picker-current"
              onClick={() => setViewingPicture(true)}
            />
          ) : (
            <span className="avatar avatar-large" aria-hidden="true">
              {(user?.full_name || user?.email || "?").charAt(0).toUpperCase()}
            </span>
          )}
          <ImagePlus size={20} aria-hidden="true" />
          <span className="profile-picker-label">{picking ? "Picking…" : "Change picture"}</span>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            hidden
            onChange={handleFile}
          />
        </label>
        {hasPicture && user && (
          <button
            type="button"
            className="btn-secondary btn-small"
            onClick={clearPicture}
            disabled={saving}
          >
            <ImageMinus size={14} aria-hidden="true" />
            {saving ? "Removing…" : "Remove picture"}
          </button>
        )}
      </div>

      {message && (
        <p className={message.ok ? "form-success" : "form-error"} role={message.ok ? "status" : "alert"}>
          {message.text}
        </p>
      )}

      <ProfilePictureViewer
        src={user!.profile_picture_url}
        isOpen={viewingPicture}
        onClose={() => setViewingPicture(false)}
      />
    </section>
  );
}
