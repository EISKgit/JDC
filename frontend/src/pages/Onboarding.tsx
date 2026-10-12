import { type FormEvent, useEffect, useState } from "react";
import { ApiError, api } from "../api/client";
import type { Category, CategoryOption, LifeProfile } from "../api/types";
import { CategoryIcon } from "../components/CategoryIcon";
import { LoadError, PrivacyNote } from "../components/Feedback";

export function Onboarding() {
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [about, setAbout] = useState("");
  const [goalsText, setGoalsText] = useState("");
  const [challenges, setChallenges] = useState("");
  const [focusCategories, setFocusCategories] = useState<Category[]>([]);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Bumping `attempt` (the Try again button) re-runs the load.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    async function load() {
      try {
        const [cats, profile] = await Promise.all([
          api.get<CategoryOption[]>("/categories"),
          api.get<LifeProfile | null>("/onboarding"),
        ]);
        setCategories(cats);
        if (profile) {
          setAbout(profile.about ?? "");
          setGoalsText(profile.goals_text ?? "");
          setChallenges(profile.challenges ?? "");
          setFocusCategories(profile.focus_categories);
          setAiSummary(profile.ai_summary);
        }
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

  function toggleCategory(value: Category) {
    setFocusCategories((prev) =>
      prev.includes(value) ? prev.filter((c) => c !== value) : [...prev, value],
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    try {
      const profile = await api.put<LifeProfile>("/onboarding", {
        about: about || null,
        goals_text: goalsText || null,
        challenges: challenges || null,
        focus_categories: focusCategories,
      });
      setAiSummary(profile.ai_summary);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Could not save your Life Profile");
    } finally {
      setSaving(false);
    }
  }

  if (loadError) return <LoadError message={loadError} onRetry={retry} />;
  if (loading) return <div className="page-center">Loading...</div>;

  return (
    <div className="page">
      <header className="page-header">
        <p className="eyebrow">Step 1 · Life Profile</p>
        <h1>Your Life Profile</h1>
        <p className="page-subtitle">
          Tell us a little about yourself. This shapes how your updates get interpreted, and the areas you pick
          count 1.5× in your overall score.
        </p>
      </header>
      <PrivacyNote />

      <form className="card form-stack" onSubmit={handleSubmit}>
        <label>
          Tell us a little about yourself
          <textarea rows={3} value={about} onChange={(e) => setAbout(e.target.value)} />
        </label>

        <label>
          What are the most important things you want to improve?
          <textarea rows={3} value={goalsText} onChange={(e) => setGoalsText(e.target.value)} />
        </label>

        <div className="field-group">
          <span className="field-label">Areas of life</span>
          <div className="checkbox-grid">
            {categories.map((c) => (
              <label
                key={c.value}
                className={`checkbox-option ${focusCategories.includes(c.value) ? "checked" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={focusCategories.includes(c.value)}
                  onChange={() => toggleCategory(c.value)}
                />
                <CategoryIcon category={c.value} />
                {c.label}
              </label>
            ))}
          </div>
        </div>

        <label>
          Current challenges (optional)
          <textarea rows={2} value={challenges} onChange={(e) => setChallenges(e.target.value)} />
        </label>

        {saveError && <p className="form-error">{saveError}</p>}
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? "Saving..." : "Save Life Profile"}
        </button>
      </form>

      {aiSummary && (
        <div className="card insight-card">
          <h2>AI summary</h2>
          <p>{aiSummary}</p>
        </div>
      )}
    </div>
  );
}
