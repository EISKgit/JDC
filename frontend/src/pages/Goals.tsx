import { Target } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import { categoriesApi, goalsApi, updatesApi } from "../api/endpoints";
import type { Category, Goal, GoalStatus } from "../api/types";
import { LoadError } from "../components/Feedback";
import { GoalCard } from "../components/goals/GoalCard";
import { errorMessage, useAsync } from "../hooks/useAsync";
import { weeklyActivity } from "../lib/goals";
import { usePageTitle } from "../lib/usePageTitle";

const SECTIONS: { status: GoalStatus; title: string }[] = [
  { status: "active", title: "Active" },
  { status: "completed", title: "Completed" },
  { status: "archived", title: "Archived" },
];

export function Goals() {
  usePageTitle("Goals");
  const { data, loading, error: loadError, retry, setData } = useAsync(async () => {
    const [goals, categories, updates] = await Promise.all([goalsApi.list(), categoriesApi.list(), updatesApi.list()]);
    return { goals, categories, updates };
  });
  const goals = data?.goals ?? [];
  const categories = data?.categories ?? [];
  const setGoals = (change: (prev: Goal[]) => Goal[]) =>
    setData((prev) => (prev ? { ...prev, goals: change(prev.goals) } : prev));

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<Category>("health");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const updates = data?.updates;
  const activity = useMemo(() => weeklyActivity(updates ?? []), [updates]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setFormError(null);
    try {
      const created = await goalsApi.create({
        title: title.trim(),
        category,
        description: description.trim() || null,
      });
      setGoals((prev) => [created, ...prev]);
      setTitle("");
      setDescription("");
    } catch (err) {
      setFormError(errorMessage(err, "Could not add the goal"));
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
