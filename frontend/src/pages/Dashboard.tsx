import {
  Hourglass,
  Lightbulb,
  type LucideIcon,
  MoveRight,
  PenLine,
  Search,
  Telescope,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
} from "lucide-react";
import type { CSSProperties } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { categoriesApi } from "../api/endpoints";
import { AboutJdc } from "../components/AboutJdc";
import { CategoryIcon } from "../components/CategoryIcon";
import { LoadError } from "../components/Feedback";
import { useAsync } from "../hooks/useAsync";
import { categoryMeta } from "../lib/categories";
import { RANGES, type Range, loadOverview, parseRange } from "../lib/overview";
import { usePageTitle } from "../lib/usePageTitle";
import { PageSkeleton } from "../components/PageSkeleton";

const TREND_ICON: Record<string, LucideIcon> = {
  improving: TrendingUp,
  declining: TrendingDown,
  stable: MoveRight,
  insufficient_evidence: Hourglass,
};

const TREND_LABEL: Record<string, string> = {
  insufficient_evidence: "not enough data",
};

function trendLabel(trend: string): string {
  return TREND_LABEL[trend] ?? trend.replaceAll("_", " ");
}

function TrendIcon({ trend, size = 16 }: { trend: string; size?: number }) {
  const Icon = TREND_ICON[trend];
  return Icon ? <Icon size={size} aria-hidden="true" /> : null;
}

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
        {/* a zero-length stroke with round caps still paints a dot, so skip it entirely */}
        {filled > 0 && (
          <circle
            className="score-ring-fill"
            cx="60"
            cy="60"
            r={radius}
            strokeDasharray={`${filled} ${circumference}`}
            transform="rotate(-90 60 60)"
          />
        )}
      </svg>
      <span className="overall-score-value">{hasData ? score : "—"}</span>
    </div>
  );
}

function CardHeading({ Icon, children }: { Icon: LucideIcon; children: string }) {
  return (
    <h2 className="card-heading">
      <Icon size={18} aria-hidden="true" />
      {children}
    </h2>
  );
}

export function Dashboard() {
  usePageTitle("Dashboard");
  const [searchParams, setSearchParams] = useSearchParams();
  const range = parseRange(searchParams.get("range"));
  const { data: loaded, loading, error: loadError, retry } = useAsync(async () => {
    const [overview, categories] = await Promise.all([loadOverview(range), categoriesApi.list()]);
    return { overview, categories };
  }, [range]);
  const data = loaded?.overview ?? null;
  const categories = loaded?.categories ?? [];
  const meta = RANGES[range];

  function chooseRange(next: Range) {
    // In the address bar, so back/forward and shared links keep the chosen range.
    setSearchParams(next === "week" ? {} : { range: next }, { replace: true });
  }

  function labelFor(value: string): string {
    return categories.find((c) => c.value === value)?.label ?? categoryMeta(value).label;
  }

  if (loadError) return <LoadError message={loadError} onRetry={retry} />;
  if (loading || !data) return <PageSkeleton variant="grid" />;

  // With no events every score is just the neutral baseline of 50, which
  // reads like a real middle-of-the-road result. Show "—" instead.
  const hasData = data.categoryScores.some((cs) => cs.event_count > 0);
  const totalEvents = data.categoryScores.reduce((sum, cs) => sum + cs.event_count, 0);

  return (
    <div className="page page-wide">
      <header className="page-header">
        <p className="eyebrow">{greeting()}</p>
        <h1>Your Life Overview</h1>
        <p className="page-subtitle">A snapshot of {meta.span}, built only from what you logged.</p>
      </header>

      <AboutJdc defaultOpen={!hasData} />

      <div className="segmented" role="group" aria-label="Time range">
        {(Object.keys(RANGES) as Range[]).map((r) => (
          <button key={r} type="button" aria-pressed={r === range} onClick={() => chooseRange(r)}>
            {RANGES[r].tab}
          </button>
        ))}
      </div>

      <section className="card hero-card overall-score">
        <ScoreRing score={data.overallScore} hasData={hasData} />
        <div className="hero-text">
          <span className="overall-score-label">
            {hasData ? (
              meta.scoreLabel
            ) : (
              <>
                No data yet. <Link to="/updates">log your first update</Link> to get your score
              </>
            )}
          </span>
          {hasData && (
            <p className="hero-meta">
              Based on <strong>{totalEvents}</strong> {totalEvents === 1 ? "event" : "events"} {meta.countSuffix}. Focus areas
              from your Life Profile count 1.5×.
            </p>
          )}
          <Link to="/updates" className="btn-primary hero-cta">
            <PenLine size={16} aria-hidden="true" />
            Add today's update
          </Link>
        </div>
      </section>

      <div className="score-grid">
        {data.categoryScores.map((cs) => {
          const empty = cs.event_count === 0;
          return (
            <div
              key={cs.category}
              className={`card score-card ${empty ? "score-none" : scoreClass(cs.score)}`}
              style={{ "--accent": categoryMeta(cs.category).color } as CSSProperties}
            >
              <div className="score-card-header">
                <span className="score-card-title">
                  <span className="score-card-icon">
                    <CategoryIcon category={cs.category} />
                  </span>
                  {labelFor(cs.category)}
                </span>
                <span className="trend-symbol" title={trendLabel(cs.trend)}>
                  <TrendIcon trend={cs.trend} />
                </span>
              </div>
              <span className="score-card-value">{empty ? "—" : cs.score}</span>
              <div className="score-bar" aria-hidden="true">
                <span style={{ width: empty ? "0%" : `${cs.score}%` }} />
              </div>
              <span className="score-card-meta">
                {cs.event_count} event(s) · {trendLabel(cs.trend)}
              </span>
            </div>
          );
        })}
      </div>

      <div className="insight-grid">
        <div className="card insight-card">
          <CardHeading Icon={Search}>Most important observation</CardHeading>
          <p>{data.observation}</p>
        </div>

        {data.recommendation && (
          <div className="card insight-card insight-accent">
            <CardHeading Icon={Lightbulb}>Recommended focus</CardHeading>
            <p>{data.recommendation}</p>
          </div>
        )}
      </div>

      {data.warnings.length > 0 && (
        <div className="card warning-card">
          <CardHeading Icon={TriangleAlert}>What may need attention</CardHeading>
          <ul>
            {data.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="card">
        <CardHeading Icon={Telescope}>{`${data.forecastDays}-Day Outlook`}</CardHeading>
        <ul className="forecast-list">
          {data.forecast.map((f) => (
            <li key={f.category}>
              <span className="forecast-icon">
                <CategoryIcon category={f.category} size={18} />
              </span>
              <div>
                <strong>{labelFor(f.category)}</strong>{" "}
                <span className={`direction direction-${f.direction}`}>
                  <TrendIcon trend={f.direction} size={12} />
                  {trendLabel(f.direction)}
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
