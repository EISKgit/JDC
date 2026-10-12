import { CalendarX, Check, FileText, Flame, NotebookPen, Pencil, Trash2, X } from "lucide-react";
import { type CSSProperties, type FormEvent, type KeyboardEvent, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ApiError, api } from "../api/client";
import type { Category, CategoryOption, DaySummary, EventItem, UpdateItem } from "../api/types";
import { LoadError } from "../components/Feedback";
import { categoryMeta } from "../lib/categories";
import {
  currentStreak,
  dayKey,
  groupByDay,
  longDate,
  relativeDayLabel,
  shortDate,
  timeOfDay,
  tzOffsetFor,
} from "../lib/dates";

const RECENT_DAY_CHIPS = 10;

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
      onChange(await api.patch<EventItem>(`/events/${event.id}`, { description }));
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

function UpdateCard({
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
      await api.delete(`/updates/${update.id}`);
      onDelete(update.id);
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : "Could not delete this entry");
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
      onChange(await api.patch<UpdateItem>(`/updates/${update.id}`, { content }));
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

function DaySummaryPanel({ dayKey: key }: { dayKey: string }) {
  const [result, setResult] = useState<DaySummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function summarize() {
    setLoading(true);
    setError(null);
    try {
      setResult(
        await api.post<DaySummary>("/assistant/day-summary", { day: key, tz_offset_minutes: tzOffsetFor(key) }),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not summarize this day");
    } finally {
      setLoading(false);
    }
  }

  if (!result) {
    return (
      <div className="day-summary-trigger">
        <button type="button" className="btn-link btn-link-icon" disabled={loading} onClick={summarize}>
          <FileText size={13} aria-hidden="true" />
          {loading ? "Summarizing..." : "Summarize day"}
        </button>
        {error && <span className="form-error">{error}</span>}
      </div>
    );
  }
  return (
    <div className="day-summary" aria-live="polite">
      <span className="day-summary-label">{result.used_ai ? "AI summary" : "Summary"}</span>
      <p>{result.summary}</p>
    </div>
  );
}

function DayCategorySummary({ updates }: { updates: UpdateItem[] }) {
  const counts = new Map<string, number>();
  for (const u of updates) for (const e of u.events) counts.set(e.category, (counts.get(e.category) ?? 0) + 1);
  if (counts.size === 0) return null;
  return (
    <div className="day-categories">
      {[...counts.entries()].map(([category, count]) => {
        const meta = categoryMeta(category);
        return (
          <span key={category} className="category-pill" style={{ "--accent": meta.color } as CSSProperties}>
            <meta.Icon size={13} aria-hidden="true" />
            {meta.label} · {count}
          </span>
        );
      })}
    </div>
  );
}

export function Updates() {
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [updates, setUpdates] = useState<UpdateItem[]>([]);
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchParams] = useSearchParams();
  // "Ask JDC" source links open a specific day: /updates?date=YYYY-MM-DD
  const [selectedDay, setSelectedDay] = useState<string | null>(() => {
    const date = searchParams.get("date");
    return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
  });

  const [loadError, setLoadError] = useState<string | null>(null);

  // Bumping `attempt` (the Try again button) re-runs the load.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    async function load() {
      try {
        const [cats, list] = await Promise.all([
          api.get<CategoryOption[]>("/categories"),
          api.get<UpdateItem[]>("/updates"),
        ]);
        setCategories(cats);
        setUpdates(list);
      } catch (err) {
        setLoadError(err instanceof ApiError ? err.message : "Something went wrong");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [attempt]);

  function retry() {
    setLoading(true);
    setLoadError(null);
    setAttempt((n) => n + 1);
  }

  const days = useMemo(() => groupByDay(updates), [updates]);
  const streak = useMemo(() => currentStreak(days.map((d) => d.key)), [days]);
  const visibleDays = selectedDay ? days.filter((d) => d.key === selectedDay) : days;
  const today = dayKey(new Date());

  async function submit() {
    if (!content.trim() || submitting) return;
    setSubmitting(true);
    try {
      const created = await api.post<UpdateItem>("/updates", { content });
      setUpdates((prev) => [created, ...prev]);
      setContent("");
      setSelectedDay(null); // make sure the new entry is visible
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    submit();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      submit();
    }
  }

  function replaceUpdate(updated: UpdateItem) {
    setUpdates((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
  }

  function removeUpdate(id: number) {
    setUpdates((prev) => prev.filter((u) => u.id !== id));
  }

  if (loadError) return <LoadError message={loadError} onRetry={retry} />;

  return (
    <div className="page">
      <header className="page-header">
        <p className="eyebrow">Daily journal</p>
        <h1>What happened today?</h1>
        <p className="page-subtitle">
          Write naturally. JDC splits your update into events, sorts them into life areas, and feeds your dashboard.
        </p>
      </header>

      <form className="card compose-card" onSubmit={handleSubmit}>
        <textarea
          rows={4}
          aria-label="Your update"
          placeholder="e.g. Worked on my backend project for 4 hours. Skipped the gym because I was tired. Had dinner with family."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div className="compose-footer">
          <span className="hint">One sentence per thing that happened · Ctrl + Enter to save</span>
          <button type="submit" className="btn-primary" disabled={submitting || !content.trim()}>
            {submitting ? "Adding..." : "Add update"}
          </button>
        </div>
      </form>

      {loading ? (
        <div className="page-center">Loading...</div>
      ) : (
        <section className="history" aria-labelledby="history-heading">
          <div className="history-header">
            <div>
              <h2 id="history-heading">History</h2>
              <p className="history-stats">
                <strong>{updates.length}</strong> {updates.length === 1 ? "entry" : "entries"} across{" "}
                <strong>{days.length}</strong> {days.length === 1 ? "day" : "days"}
                {streak > 0 && (
                  <>
                    {" "}
                    · <Flame className="streak-icon" size={14} aria-hidden="true" /> <strong>{streak}</strong>-day streak
                  </>
                )}
              </p>
            </div>
            <div className="history-controls">
              <label className="date-picker">
                <span>Jump to date</span>
                <input
                  type="date"
                  max={today}
                  value={selectedDay ?? ""}
                  onChange={(e) => setSelectedDay(e.target.value || null)}
                />
              </label>
              {selectedDay && (
                <button type="button" className="btn-secondary" onClick={() => setSelectedDay(null)}>
                  Show all days
                </button>
              )}
            </div>
          </div>

          {days.length > 0 && (
            <div className="day-chips" role="group" aria-label="Recent days">
              <button
                type="button"
                className={`day-chip ${selectedDay === null ? "active" : ""}`}
                aria-pressed={selectedDay === null}
                onClick={() => setSelectedDay(null)}
              >
                All days
              </button>
              {days.slice(0, RECENT_DAY_CHIPS).map((d) => (
                <button
                  key={d.key}
                  type="button"
                  className={`day-chip ${selectedDay === d.key ? "active" : ""}`}
                  aria-pressed={selectedDay === d.key}
                  onClick={() => setSelectedDay(d.key)}
                >
                  {relativeDayLabel(d.key) ?? shortDate(d.key)}
                  <span className="day-chip-count">{d.items.length}</span>
                </button>
              ))}
            </div>
          )}

          {updates.length === 0 && (
            <div className="card empty-card">
              <NotebookPen className="empty-icon" size={28} aria-hidden="true" />
              <p>No updates yet. Write your first one above and it will show up here, grouped by day.</p>
            </div>
          )}

          {selectedDay && visibleDays.length === 0 && (
            <div className="card empty-card">
              <CalendarX className="empty-icon" size={28} aria-hidden="true" />
              <p>No entries on {longDate(selectedDay)}.</p>
            </div>
          )}

          {visibleDays.map((day) => {
            const relative = relativeDayLabel(day.key);
            return (
              <section key={day.key} className="day-group" aria-label={longDate(day.key)}>
                <header className="day-header">
                  <div>
                    <h3>{relative ?? longDate(day.key)}</h3>
                    {relative && <span className="day-date">{longDate(day.key)}</span>}
                  </div>
                  <span className="day-count">
                    {day.items.length} {day.items.length === 1 ? "entry" : "entries"}
                  </span>
                </header>
                <DayCategorySummary updates={day.items} />
                {/* Keyed by the day's current text: an edit or delete resets a summary that no longer matches. */}
                <DaySummaryPanel
                  key={day.items.map((u) => `${u.id}:${u.content}`).join("|")}
                  dayKey={day.key}
                />

                <ol className="timeline">
                  {day.items.map((u) => (
                    <UpdateCard
                      key={u.id}
                      update={u}
                      categories={categories}
                      onChange={replaceUpdate}
                      onDelete={removeUpdate}
                    />
                  ))}
                </ol>
              </section>
            );
          })}
        </section>
      )}
    </div>
  );
}
