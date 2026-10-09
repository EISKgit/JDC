import { type FormEvent, useEffect, useState } from "react";
import { api } from "../api/client";
import type { Category, CategoryOption, LifeProfile } from "../api/types";
import { categoryMeta } from "../lib/categories";

export function Onboarding() {
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [about, setAbout] = useState("");
  const [goalsText, setGoalsText] = useState("");
  const [challenges, setChallenges] = useState("");
  const [focusCategories, setFocusCategories] = useState<Category[]>([]);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
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
      setLoading(false);
    }
    load();
  }, []);

  function toggleCategory(value: Category) {
    setFocusCategories((prev) =>
      prev.includes(value) ? prev.filter((c) => c !== value) : [...prev, value],
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const profile = await api.put<LifeProfile>("/onboarding", {
        about: about || null,
        goals_text: goalsText || null,
        challenges: challenges || null,
        focus_categories: focusCategories,
      });
      setAiSummary(profile.ai_summary);
    } finally {
      setSaving(false);
    }
  }

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
                <span aria-hidden="true">{categoryMeta(c.value).icon}</span>
                {c.label}
              </label>
            ))}
          </div>
        </div>

        <label>
          Current challenges (optional)
          <textarea rows={2} value={challenges} onChange={(e) => setChallenges(e.target.value)} />
        </label>

        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? "Saving..." : "Save Life Profile"}
        </button>
      </form>

      {aiSummary && (
        <div className="card insight-card">
          <h2>
            <span aria-hidden="true">✨</span> AI summary
          </h2>
          <p>{aiSummary}</p>
        </div>
      )}
    </div>
  );
}
