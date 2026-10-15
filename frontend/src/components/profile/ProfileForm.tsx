import { type FormEvent, useState } from "react";
import { profileApi } from "../../api/endpoints";
import type { Category, CategoryOption, LifeProfile } from "../../api/types";
import { errorMessage } from "../../hooks/useAsync";
import { CategoryIcon } from "../CategoryIcon";

/**
 * The Life Profile form. Receives the saved profile as its starting values (the
 * page loads it), owns only the editing state, and saves through profileApi.
 */
export function ProfileForm({ categories, initial }: { categories: CategoryOption[]; initial: LifeProfile | null }) {
  const [about, setAbout] = useState(initial?.about ?? "");
  const [goalsText, setGoalsText] = useState(initial?.goals_text ?? "");
  const [challenges, setChallenges] = useState(initial?.challenges ?? "");
  const [focusCategories, setFocusCategories] = useState<Category[]>(initial?.focus_categories ?? []);
  const [aiSummary, setAiSummary] = useState<string | null>(initial?.ai_summary ?? null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  function toggleCategory(value: Category) {
    setFocusCategories((prev) => (prev.includes(value) ? prev.filter((c) => c !== value) : [...prev, value]));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    try {
      const profile = await profileApi.save({
        about: about || null,
        goals_text: goalsText || null,
        challenges: challenges || null,
        focus_categories: focusCategories,
      });
      setAiSummary(profile.ai_summary);
    } catch (err) {
      setSaveError(errorMessage(err, "Could not save your Life Profile"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
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
              <label key={c.value} className={`checkbox-option ${focusCategories.includes(c.value) ? "checked" : ""}`}>
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
    </>
  );
}
