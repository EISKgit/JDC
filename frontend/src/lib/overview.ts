/**
 * The dashboard's data for a chosen time range, in one shape the page can render.
 *
 * - "week" uses /dashboard (the curated 7-day view, including the recommendation).
 * - "day" / "month" combine /intelligence/daily|monthly with a 7- or 30-day forecast.
 */
import { dashboardApi, intelligenceApi } from "../api/endpoints";
import type { CategoryScore, ForecastItem } from "../api/types";

export type Range = "day" | "week" | "month";

export const RANGES: Record<Range, { tab: string; scoreLabel: string; span: string; countSuffix: string; forecastDays: 7 | 30 }> = {
  day: { tab: "Today", scoreLabel: "Overall score (today)", span: "today", countSuffix: "today", forecastDays: 7 },
  week: { tab: "7 days", scoreLabel: "Overall score (last 7 days)", span: "the last 7 days", countSuffix: "this week", forecastDays: 7 },
  month: { tab: "30 days", scoreLabel: "Overall score (last 30 days)", span: "the last 30 days", countSuffix: "in the last 30 days", forecastDays: 30 },
};

export function parseRange(value: string | null): Range {
  return value === "day" || value === "month" ? value : "week";
}

export interface Overview {
  overallScore: number;
  categoryScores: CategoryScore[];
  observation: string;
  warnings: string[];
  /** Only the 7-day view has a curated recommendation. */
  recommendation: string | null;
  forecast: ForecastItem[];
  forecastDays: 7 | 30;
}

export async function loadOverview(range: Range): Promise<Overview> {
  if (range === "week") {
    const d = await dashboardApi.get();
    return {
      overallScore: d.overall_score,
      categoryScores: d.category_scores,
      observation: d.top_observation,
      warnings: d.warnings,
      recommendation: d.recommendation,
      forecast: d.forecast_7day,
      forecastDays: 7,
    };
  }
  const forecastDays = RANGES[range].forecastDays;
  const [summary, forecast] = await Promise.all([
    intelligenceApi.summary(range === "day" ? "daily" : "monthly"),
    intelligenceApi.forecast(forecastDays),
  ]);
  return {
    overallScore: summary.overall_score,
    categoryScores: summary.category_scores,
    observation: summary.narrative,
    warnings: summary.warnings,
    recommendation: null,
    forecast,
    forecastDays,
  };
}
