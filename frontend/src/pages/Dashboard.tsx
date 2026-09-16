import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { CategoryOption, Dashboard as DashboardData } from "../api/types";

const TREND_SYMBOL: Record<string, string> = {
  improving: "↑",
  declining: "↓",
  stable: "→",
  insufficient_evidence: "?",
};

function scoreClass(score: number): string {
  if (score >= 70) return "score-good";
  if (score >= 45) return "score-mid";
  return "score-low";
}

export function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [dashboard, cats] = await Promise.all([
        api.get<DashboardData>("/dashboard"),
        api.get<CategoryOption[]>("/categories"),
      ]);
      setData(dashboard);
      setCategories(cats);
      setLoading(false);
    }
    load();
  }, []);

  function labelFor(value: string): string {
    return categories.find((c) => c.value === value)?.label ?? value;
  }

  if (loading || !data) return <div className="page-center">Loading...</div>;

  return (
    <div className="page">
      <h1>Your Life Overview</h1>

      <div className={`card overall-score ${scoreClass(data.overall_score)}`}>
        <span className="overall-score-value">{data.overall_score}</span>
        <span className="overall-score-label">Overall score (last 7 days)</span>
      </div>

      <div className="score-grid">
        {data.category_scores.map((cs) => (
          <div key={cs.category} className={`card score-card ${scoreClass(cs.score)}`}>
            <div className="score-card-header">
              <span>{labelFor(cs.category)}</span>
              <span className="trend-symbol">{TREND_SYMBOL[cs.trend] ?? ""}</span>
            </div>
            <span className="score-card-value">{cs.score}</span>
            <span className="score-card-meta">
              {cs.event_count} event(s) · {cs.trend.replace("_", " ")}
            </span>
          </div>
        ))}
      </div>

      <div className="card insight-card">
        <h2>Most important observation</h2>
        <p>{data.top_observation}</p>
      </div>

      {data.warnings.length > 0 && (
        <div className="card warning-card">
          <h2>What may need attention</h2>
          <ul>
            {data.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="card insight-card">
        <h2>Recommended focus</h2>
        <p>{data.recommendation}</p>
      </div>

      <div className="card">
        <h2>7-Day Outlook</h2>
        <ul className="forecast-list">
          {data.forecast_7day.map((f) => (
            <li key={f.category}>
              <strong>{labelFor(f.category)}:</strong> {f.narrative}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
