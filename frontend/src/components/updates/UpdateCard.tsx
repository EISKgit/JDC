import { Pencil, Trash2 } from "lucide-react";
import { type KeyboardEvent, useState } from "react";
import { updatesApi } from "../../api/endpoints";
import type { CategoryOption, EventItem, UpdateItem } from "../../api/types";
import { errorMessage } from "../../hooks/useAsync";
import { timeOfDay } from "../../lib/dates";
import { EventRow } from "./EventRow";

/** One journal entry: its text (editable), its statements, and delete with confirmation. */
export function UpdateCard({
  update,
  categories,
  onChange,
  onDelete,
}: {
  update: UpdateItem;
  categories: CategoryOption[];
  onChange: (updated: UpdateItem) => void;
  onDelete: (id: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(update.content);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const hasCorrections = update.events.some((e) => e.is_corrected);

  async function confirmDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await updatesApi.remove(update.id);
      onDelete(update.id);
    } catch (err) {
      setDeleteError(errorMessage(err, "Could not delete this entry"));
      setDeleting(false);
    }
  }

  function startEdit() {
    setDraft(update.content);
    setEditing(true);
  }

  async function save() {
    const content = draft.trim();
    if (!content || saving) return;
    if (content === update.content) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      // The server re-reads the new text, so the categorized statements below follow it.
      onChange(await updatesApi.edit(update.id, content));
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      save();
    } else if (e.key === "Escape") {
      setEditing(false);
    }
  }

  function updateEvent(eventId: number, updated: EventItem | null) {
    onChange({
      ...update,
      events: updated
        ? update.events.map((e) => (e.id === eventId ? updated : e))
        : update.events.filter((e) => e.id !== eventId),
    });
  }

  return (
    <li className="card update-card">
      <div className="update-card-header">
        <time className="update-time" dateTime={update.created_at}>
          {timeOfDay(update.created_at)}
        </time>
        {!editing && !confirmingDelete && (
          <span className="update-card-actions">
            <button type="button" className="btn-link btn-link-icon" onClick={startEdit}>
              <Pencil size={12} aria-hidden="true" />
              Edit update
            </button>
            <button
              type="button"
              className="btn-link btn-link-icon btn-link-danger"
              onClick={() => setConfirmingDelete(true)}
            >
              <Trash2 size={12} aria-hidden="true" />
              Delete
            </button>
          </span>
        )}
      </div>
      {confirmingDelete && (
        <div className="delete-confirm" role="alertdialog" aria-label="Confirm delete">
          <p>
            Delete this entry
            {update.events.length > 0 &&
              ` and its ${update.events.length} ${update.events.length === 1 ? "statement" : "statements"}`}
            ? Your scores, trends and insights will be recalculated without it.
          </p>
          {deleteError && <p className="form-error">{deleteError}</p>}
          <div className="delete-confirm-actions">
            <button
              type="button"
              className="btn-secondary btn-small"
              disabled={deleting}
              onClick={() => setConfirmingDelete(false)}
            >
              Cancel
            </button>
            <button type="button" className="btn-danger btn-small" disabled={deleting} onClick={confirmDelete}>
              {deleting ? "Deleting..." : "Delete entry"}
            </button>
          </div>
        </div>
      )}
      {editing ? (
        <div className="update-edit">
          <textarea
            rows={4}
            aria-label="Edit update"
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          {hasCorrections && (
            <p className="hint">
              Statements are rebuilt from the new text. Categories you fixed stay for sentences you keep.
            </p>
          )}
          <div className="update-edit-actions">
            <button type="button" className="btn-secondary btn-small" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button type="button" className="btn-primary btn-small" disabled={saving || !draft.trim()} onClick={save}>
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      ) : (
        <p className="update-content">{update.content}</p>
      )}
      {update.events.length > 0 && (
        <ul className="event-list">
          {update.events.map((ev) => (
            <EventRow
              key={ev.id}
              event={ev}
              categories={categories}
              onChange={(updated) => updateEvent(ev.id, updated)}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
