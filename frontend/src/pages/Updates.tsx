import { type FormEvent, useEffect, useState } from "react";
import { api } from "../api/client";
import type { Category, CategoryOption, EventItem, UpdateItem } from "../api/types";

function EventRow({
  event,
  categories,
  onChange,
}: {
  event: EventItem;
  categories: CategoryOption[];
  onChange: (updated: EventItem | null) => void;
}) {
  async function handleCategoryChange(category: Category) {
    const updated = await api.patch<EventItem>(`/events/${event.id}`, { category });
    onChange(updated);
  }

  async function handleDelete() {
    await api.delete(`/events/${event.id}`);
    onChange(null);
  }

  return (
    <li className={`event-row sentiment-${event.sentiment ?? "neutral"}`}>
      <div className="event-main">
        <select value={event.category} onChange={(e) => handleCategoryChange(e.target.value as Category)}>
          {categories.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <span className="event-type">{event.type}</span>
        <span className="event-description">{event.description}</span>
      </div>
      <div className="event-meta">
        {event.sentiment && <span className="tag">{event.sentiment}</span>}
        {event.confidence != null && <span className="tag">confidence {Math.round(event.confidence * 100)}%</span>}
        {event.is_corrected && <span className="tag tag-corrected">corrected</span>}
        <button type="button" className="btn-link" onClick={handleDelete}>
          Remove
        </button>
      </div>
    </li>
  );
}

export function Updates() {
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [updates, setUpdates] = useState<UpdateItem[]>([]);
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [cats, list] = await Promise.all([
        api.get<CategoryOption[]>("/categories"),
        api.get<UpdateItem[]>("/updates"),
      ]);
      setCategories(cats);
      setUpdates(list);
      setLoading(false);
    }
    load();
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setSubmitting(true);
    try {
      const created = await api.post<UpdateItem>("/updates", { content });
      setUpdates((prev) => [created, ...prev]);
      setContent("");
    } finally {
      setSubmitting(false);
    }
  }

  function updateEvent(updateId: number, eventId: number, updated: EventItem | null) {
    setUpdates((prev) =>
      prev.map((u) =>
        u.id !== updateId
          ? u
          : {
              ...u,
              events: updated
                ? u.events.map((e) => (e.id === eventId ? updated : e))
                : u.events.filter((e) => e.id !== eventId),
            },
      ),
    );
  }

  return (
    <div className="page">
      <h1>What happened today?</h1>

      <form className="card" onSubmit={handleSubmit}>
        <textarea
          rows={4}
          placeholder="I worked on my backend project for 4 hours. I skipped the gym because I was tired..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? "Adding..." : "Add Update"}
        </button>
      </form>

      {loading ? (
        <div className="page-center">Loading...</div>
      ) : (
        <div className="update-list">
          {updates.length === 0 && <p className="empty-state">No updates yet — write your first one above.</p>}
          {updates.map((u) => (
            <div key={u.id} className="card update-card">
              <div className="update-header">
                <span className="update-date">{new Date(u.created_at).toLocaleString()}</span>
              </div>
              <p className="update-content">{u.content}</p>
              {u.events.length > 0 && (
                <ul className="event-list">
                  {u.events.map((ev) => (
                    <EventRow
                      key={ev.id}
                      event={ev}
                      categories={categories}
                      onChange={(updated) => updateEvent(u.id, ev.id, updated)}
                    />
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
