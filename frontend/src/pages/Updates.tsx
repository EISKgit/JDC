import { type CSSProperties, type FormEvent, type KeyboardEvent, useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import type { Category, CategoryOption, EventItem, UpdateItem } from "../api/types";
import { categoryMeta } from "../lib/categories";
import { currentStreak, dayKey, groupByDay, longDate, relativeDayLabel, shortDate, timeOfDay } from "../lib/dates";

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

  const meta = categoryMeta(event.category);

  return (
    <li className="event-row" style={{ "--accent": meta.color } as CSSProperties}>
      <div className="event-main">
        <span className="event-icon" aria-hidden="true">
          {meta.icon}
        </span>
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
        <span className="event-description">{event.description}</span>
      </div>
      <div className="event-meta">
        {event.sentiment && <span className={`tag tag-${event.sentiment}`}>{event.sentiment}</span>}
        {event.confidence != null && <span className="tag">{Math.round(event.confidence * 100)}% sure</span>}
        {event.is_corrected && <span className="tag tag-corrected">corrected</span>}
        <button type="button" className="btn-link btn-link-danger" onClick={handleDelete}>
          Remove
        </button>
      </div>
    </li>
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
            {meta.icon} {meta.label} · {count}
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
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

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
                    · 🔥 <strong>{streak}</strong>-day streak
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
              <span className="empty-icon" aria-hidden="true">
                ✍️
              </span>
              <p>No updates yet. Write your first one above and it will show up here, grouped by day.</p>
            </div>
          )}

          {selectedDay && visibleDays.length === 0 && (
            <div className="card empty-card">
              <span className="empty-icon" aria-hidden="true">
                📭
              </span>
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

                <ol className="timeline">
                  {day.items.map((u) => (
                    <li key={u.id} className="card update-card">
                      <time className="update-time" dateTime={u.created_at}>
                        {timeOfDay(u.created_at)}
                      </time>
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
                    </li>
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
