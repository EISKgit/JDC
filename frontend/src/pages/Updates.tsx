import { CalendarX, Flame, NotebookPen } from "lucide-react";
import { type FormEvent, type KeyboardEvent, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { categoriesApi, updatesApi } from "../api/endpoints";
import type { UpdateItem } from "../api/types";
import { LoadError } from "../components/Feedback";
import { DayCategorySummary } from "../components/updates/DayCategorySummary";
import { DaySummaryPanel } from "../components/updates/DaySummaryPanel";
import { UpdateCard } from "../components/updates/UpdateCard";
import { errorMessage, useAsync } from "../hooks/useAsync";
import { currentStreak, dayKey, groupByDay, longDate, relativeDayLabel, shortDate } from "../lib/dates";
import { usePageTitle } from "../lib/usePageTitle";

const RECENT_DAY_CHIPS = 10;

export function Updates() {
  usePageTitle("Updates");
  const { data, loading, error: loadError, retry, setData } = useAsync(async () => {
    const [categories, updates] = await Promise.all([categoriesApi.list(), updatesApi.list()]);
    return { categories, updates };
  });
  const categories = data?.categories ?? [];
  const updates = useMemo(() => data?.updates ?? [], [data]);
  const setUpdates = (change: (prev: UpdateItem[]) => UpdateItem[]) =>
    setData((prev) => (prev ? { ...prev, updates: change(prev.updates) } : prev));
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [searchParams] = useSearchParams();
  // "Ask JDC" source links open a specific day: /updates?date=YYYY-MM-DD
  const [selectedDay, setSelectedDay] = useState<string | null>(() => {
    const date = searchParams.get("date");
    return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
  });

  const days = useMemo(() => groupByDay(updates), [updates]);
  const streak = useMemo(() => currentStreak(days.map((d) => d.key)), [days]);
  const visibleDays = selectedDay ? days.filter((d) => d.key === selectedDay) : days;
  const today = dayKey(new Date());

  async function submit() {
    if (!content.trim() || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const created = await updatesApi.create(content);
      setUpdates((prev) => [created, ...prev]);
      setContent("");
      setSelectedDay(null); // make sure the new entry is visible
    } catch (err) {
      // Keep the text so nothing typed is lost, and say why it wasn't saved.
      setSubmitError(errorMessage(err, "Your update couldn't be saved. Please try again."));
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
        {submitError && <p className="form-error">{submitError}</p>}
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
