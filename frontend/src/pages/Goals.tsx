import { Archive, Check, RotateCcw, Target, Trash2 } from "lucide-react";
import { type CSSProperties, type FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, api } from "../api/client";
import type { Category, CategoryOption, Goal, GoalStatus, UpdateItem } from "../api/types";
import { CategoryIcon } from "../components/CategoryIcon";
import { LoadError } from "../components/Feedback";
import { categoryMeta } from "../lib/categories";

const SECTIONS: { status: GoalStatus; title: string }[] = [
  { status: "active", title: "Active" },
  { status: "completed", title: "Completed" },
  { status: "archived", title: "Archived" },
];

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Events per life area over the last 7 days, to show goal-related activity. */
function weeklyActivity(updates: UpdateItem[]): Map<string, number> {
  const since = Date.now() - WEEK_MS;
  const counts = new Map<string, number>();
  for (const u of updates) {
    if (new Date(u.created_at).getTime() < since) continue;
    for (const e of u.events) counts.set(e.category, (counts.get(e.category) ?? 0) + 1);
  }
  return counts;
}

function GoalCard({
  goal,
  activity,
  onChange,
  onDelete,
}: {
  goal: Goal;
  activity: number;
  onChange: (goal: Goal) => void;
  onDelete: (id: number) => void;
}) {
  const [busy, setBusy] = useState(false);
  const meta = categoryMeta(goal.category);

  async function setStatus(status: GoalStatus) {
    setBusy(true);
    try {
      onChange(await api.patch<Goal>(`/goals/${goal.id}`, { status }));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api.delete(`/goals/${goal.id}`);
      onDelete(goal.id);
    } catch {
      setBusy(false);
    }
  }

  return (
    <li className={`card goal-card goal-${goal.status}`} style={{ "--accent": meta.color } as CSSProperties}>
      <div className="goal-main">
        <span className="goal-icon">
          <CategoryIcon category={goal.category} size={18} />
        </span>
        <div>
          <strong className="goal-title">{goal.title}</strong>
          {goal.description && <p className="goal-description">{goal.description}</p>}
          <span className="goal-meta">
            {meta.label}
            {goal.status === "active" && (
              <>
                {" · "}
                {activity > 0 ? (
                  `${activity} ${activity === 1 ? "entry" : "entries"} in this area this week`
                ) : (
                  <Link to="/updates">no entries in this area this week</Link>
                )}
              </>
            )}
          </span>
        </div>
      </div>
      <div className="goal-actions">
        {goal.status === "active" ? (
          <>
            <button type="button" className="btn-secondary btn-small" disabled={busy} onClick={() => setStatus("completed")}>
              <Check size={14} aria-hidden="true" />
              Done
            </button>
            <button type="button" className="icon-btn" aria-label="Archive goal" disabled={busy} onClick={() => setStatus("archived")}>
              <Archive size={15} aria-hidden="true" />
            </button>
          </>
        ) : (
          <button type="button" className="btn-secondary btn-small" disabled={busy} onClick={() => setStatus("active")}>
            <RotateCcw size={14} aria-hidden="true" />
            Reopen
          </button>
        )}
        <button type="button" className="icon-btn" aria-label="Delete goal" disabled={busy} onClick={remove}>
          <Trash2 size={15} aria-hidden="true" />
        </button>
      </div>
    </li>
  );
}

export function Goals() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [updates, setUpdates] = useState<UpdateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<Category>("health");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Bumping `attempt` (the Try again button) re-runs the load.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    async function load() {
      try {
        const [g, c, u] = await Promise.all([
          api.get<Goal[]>("/goals"),
          api.get<CategoryOption[]>("/categories"),
          api.get<UpdateItem[]>("/updates"),
        ]);
        setGoals(g);
        setCategories(c);
        setUpdates(u);
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

  const activity = useMemo(() => weeklyActivity(updates), [updates]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setFormError(null);
    try {
      const created = await api.post<Goal>("/goals", {
        title: title.trim(),
        category,
        description: description.trim() || null,
      });
      setGoals((prev) => [created, ...prev]);
      setTitle("");
      setDescription("");
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Could not add the goal");
    } finally {
      setSaving(false);
    }
  }

  if (loadError) return <LoadError message={loadError} onRetry={retry} />;
  if (loading) return <div className="page-center">Loading...</div>;

  return (
    <div className="page">
      <header className="page-header">
        <p className="eyebrow">Goals</p>
        <h1>What are you working towards?</h1>
        <p className="page-subtitle">Each goal belongs to a life area, so you can see if your days are moving it forward.</p>
      </header>

      <form className="card goal-form" onSubmit={handleCreate}>
        <div className="goal-form-row">
          <label className="goal-form-title">
            <span>Goal</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Go to the gym 3 times a week"
              maxLength={255}
              required
            />
          </label>
          <label>
            <span>Life area</span>
            <select value={category} onChange={(e) => setCategory(e.target.value as Category)}>
              {categories.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          <span>Details (optional)</span>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Why it matters, or how you'll know you've done it"
            maxLength={2000}
          />
        </label>
        {formError && <p className="form-error">{formError}</p>}
        <button type="submit" className="btn-primary" disabled={saving || !title.trim()}>
          {saving ? "Adding..." : "Add goal"}
        </button>
      </form>

      {goals.length === 0 && (
        <div className="card empty-card">
          <Target className="empty-icon" size={28} aria-hidden="true" />
          <p>No goals yet. Add one above to start tracking it alongside your daily updates.</p>
        </div>
      )}

      {SECTIONS.map(({ status, title: heading }) => {
        const items = goals.filter((g) => g.status === status);
        if (items.length === 0) return null;
        return (
          <section key={status} className="goal-section" aria-label={`${heading} goals`}>
            <h2>
              {heading} <span className="goal-count">{items.length}</span>
            </h2>
            <ul className="goal-list">
              {items.map((g) => (
                <GoalCard
                  key={g.id}
                  goal={g}
                  activity={activity.get(g.category) ?? 0}
                  onChange={(updated) => setGoals((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))}
                  onDelete={(id) => setGoals((prev) => prev.filter((x) => x.id !== id))}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
