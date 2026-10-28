import { X } from "lucide-react";

/** Modal that shows the full-size profile picture when the avatar is clicked. */
export function ProfilePictureViewer({
  src,
  isOpen,
  onClose,
}: {
  src: string;
  isOpen: boolean;
  onClose: () => void;
}) {
  if (!isOpen) return null;

  return (
    <div className="profile-viewer-backdrop" onClick={onClose}>
      <div className="profile-viewer-panel" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="profile-viewer-close"
          onClick={onClose}
          aria-label="Close profile picture"
        >
          <X size={20} aria-hidden="true" />
        </button>
        <img src={src} alt="Profile picture" className="profile-viewer-image" />
      </div>
    </div>
  );
}
