import { Check, Pencil, X } from "lucide-react";
import { type CSSProperties, type KeyboardEvent, useState } from "react";
import { eventsApi } from "../../api/endpoints";
import type { Category, CategoryOption, EventItem } from "../../api/types";
import { categoryMeta } from "../../lib/categories";

/** One AI-extracted statement: change its area, reword it, or remove it. */
export function EventRow({
  event,
  categories,
  onChange,
}: {
  event: EventItem;
  categories: CategoryOption[];
  onChange: (updated: EventItem | null) => void;
}) {
  async function handleCategoryChange(category: Category) {
    const updated = await eventsApi.correct(event.id, { category });
    onChange(updated);
  }

  async function handleDelete() {
    await eventsApi.remove(event.id);
    onChange(null);
  }

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(event.description);
  const [saving, setSaving] = useState(false);

  function startEdit() {
    setDraft(event.description);
    setEditing(true);
  }

  async function saveDescription() {
    const description = draft.trim();
    if (!description || saving) return;
    if (description === event.description) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      onChange(await eventsApi.correct(event.id, { description }));
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  function handleEditKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      saveDescription();
    } else if (e.key === "Escape") {
      setEditing(false);
    }
  }

  const meta = categoryMeta(event.category);

  return (
    <li className="event-row" style={{ "--accent": meta.color } as CSSProperties}>
      <div className="event-main">
        <meta.Icon className="event-icon" size={16} aria-hidden="true" />
        <select
          aria-label="Event category"
          value={event.category}
          onChange={(e) => handleCategoryChange(e.target.value as Category)}
        >
          {categories.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        {editing ? (
          <span className="event-edit">
            <input
              aria-label="Edit statement"
              value={draft}
              autoFocus
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleEditKeyDown}
            />
            <button
              type="button"
              className="icon-btn"
              aria-label="Save statement"
              disabled={saving || !draft.trim()}
              onClick={saveDescription}
            >
              <Check size={15} aria-hidden="true" />
            </button>
            <button type="button" className="icon-btn" aria-label="Cancel editing" onClick={() => setEditing(false)}>
              <X size={15} aria-hidden="true" />
            </button>
          </span>
        ) : (
          <span className="event-description">{event.description}</span>
        )}
      </div>
      <div className="event-meta">
        {event.sentiment && <span className={`tag tag-${event.sentiment}`}>{event.sentiment}</span>}
        {event.confidence != null && <span className="tag">{Math.round(event.confidence * 100)}% sure</span>}
        {event.is_corrected && <span className="tag tag-corrected">corrected</span>}
        {!editing && (
          <button type="button" className="btn-link btn-link-icon" onClick={startEdit}>
            <Pencil size={12} aria-hidden="true" />
            Edit
          </button>
        )}
        <button type="button" className="btn-link btn-link-danger" onClick={handleDelete}>
          Remove
        </button>
      </div>
    </li>
  );
}
