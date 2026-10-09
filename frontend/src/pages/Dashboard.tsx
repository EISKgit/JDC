import { type CSSProperties, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { CategoryOption, Dashboard as DashboardData } from "../api/types";
import { AboutJdc } from "../components/AboutJdc";
import { categoryMeta } from "../lib/categories";

const TREND_SYMBOL: Record<string, string> = {
  improving: "↑",
  declining: "↓",
  stable: "→",
  insufficient_evidence: "?",
};

const TREND_LABEL: Record<string, string> = {
  insufficient_evidence: "not enough data",
};

const DIRECTION_ICON: Record<string, string> = {
  improving: "📈",
  declining: "📉",
  stable: "➡️",
  insufficient_evidence: "⏳",
};

function scoreClass(score: number): string {
  if (score >= 70) return "score-good";
  if (score >= 45) return "score-mid";
  return "score-low";
}

function greeting(now: Date = new Date()): string {
  const hour = now.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function ScoreRing({ score, hasData }: { score: number; hasData: boolean }) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const filled = hasData ? (score / 100) * circumference : 0;
  return (
    <div className={`score-ring ${hasData ? scoreClass(score) : "score-none"}`}>
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle className="score-ring-track" cx="60" cy="60" r={radius} />
        <circle
          className="score-ring-fill"
          cx="60"
          cy="60"
          r={radius}
          strokeDasharray={`${filled} ${circumference}`}
          transform="rotate(-90 60 60)"
        />
      </svg>
      <span className="overall-score-value">{hasData ? score : "—"}</span>
    </div>
  );
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
    return categories.find((c) => c.value === value)?.label ?? categoryMeta(value).label;
  }

  if (loading || !data) return <div className="page-center">Loading...</div>;

  // With no events every score is just the neutral baseline of 50, which
  // reads like a real middle-of-the-road result. Show "—" instead.
  const hasData = data.category_scores.some((cs) => cs.event_count > 0);
  const totalEvents = data.category_scores.reduce((sum, cs) => sum + cs.event_count, 0);

  return (
    <div className="page page-wide">
      <header className="page-header">
        <p className="eyebrow">{greeting()}</p>
        <h1>Your Life Overview</h1>
        <p className="page-subtitle">A snapshot of the last 7 days, built only from what you logged.</p>
      </header>

      <AboutJdc defaultOpen={!hasData} />

      <section className="card hero-card overall-score">
        <ScoreRing score={data.overall_score} hasData={hasData} />
        <div className="hero-text">
          <span className="overall-score-label">
            {hasData ? (
              "Overall score (last 7 days)"
            ) : (
              <>
                No data yet. <Link to="/updates">log your first update</Link> to get your score
              </>
            )}
          </span>
          {hasData && (
            <p className="hero-meta">
              Based on <strong>{totalEvents}</strong> {totalEvents === 1 ? "event" : "events"} this week. Focus areas
              from your Life Profile count 1.5×.
            </p>
          )}
          <Link to="/updates" className="btn-primary hero-cta">
            ✍️ Add today's update
          </Link>
        </div>
      </section>

      <div className="score-grid">
        {data.category_scores.map((cs) => {
          const empty = cs.event_count === 0;
          const meta = categoryMeta(cs.category);
          return (
            <div
              key={cs.category}
              className={`card score-card ${empty ? "score-none" : scoreClass(cs.score)}`}
              style={{ "--accent": meta.color } as CSSProperties}
            >
              <div className="score-card-header">
                <span className="score-card-title">
                  <span className="score-card-icon" aria-hidden="true">
                    {meta.icon}
                  </span>
                  {labelFor(cs.category)}
                </span>
                <span className="trend-symbol" title={TREND_LABEL[cs.trend] ?? cs.trend}>
                  {TREND_SYMBOL[cs.trend] ?? ""}
                </span>
              </div>
              <span className="score-card-value">{empty ? "—" : cs.score}</span>
              <div className="score-bar" aria-hidden="true">
                <span style={{ width: empty ? "0%" : `${cs.score}%` }} />
              </div>
              <span className="score-card-meta">
                {cs.event_count} event(s) · {TREND_LABEL[cs.trend] ?? cs.trend.replaceAll("_", " ")}
              </span>
            </div>
          );
        })}
      </div>

      <div className="insight-grid">
        <div className="card insight-card">
          <h2>
            <span aria-hidden="true">🔍</span> Most important observation
          </h2>
          <p>{data.top_observation}</p>
        </div>

        <div className="card insight-card insight-accent">
          <h2>
            <span aria-hidden="true">💡</span> Recommended focus
          </h2>
          <p>{data.recommendation}</p>
        </div>
      </div>

      {data.warnings.length > 0 && (
        <div className="card warning-card">
          <h2>
            <span aria-hidden="true">⚠️</span> What may need attention
          </h2>
          <ul>
            {data.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="card">
        <h2>
          <span aria-hidden="true">🔮</span> 7-Day Outlook
        </h2>
        <ul className="forecast-list">
          {data.forecast_7day.map((f) => (
            <li key={f.category}>
              <span className="forecast-icon" aria-hidden="true">
                {categoryMeta(f.category).icon}
              </span>
              <div>
                <strong>{labelFor(f.category)}</strong>{" "}
                <span className={`direction direction-${f.direction}`}>
                  {DIRECTION_ICON[f.direction] ?? ""} {TREND_LABEL[f.direction] ?? f.direction.replaceAll("_", " ")}
                </span>
                <p>{f.narrative}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
