export type Category =
  | "health"
  | "career"
  | "finance"
  | "relationships"
  | "learning"
  | "personal_growth"
  | "lifestyle";

export type Sentiment = "positive" | "neutral" | "negative";

export interface CategoryOption {
  value: Category;
  label: string;
}

export interface User {
  id: number;
  email: string;
  full_name: string | null;
  created_at: string;
}

export interface Token {
  access_token: string;
  token_type: string;
}

export interface LifeProfile {
  id: number;
  about: string | null;
  goals_text: string | null;
  challenges: string | null;
  focus_categories: Category[];
  ai_summary: string | null;
  created_at: string;
  updated_at: string;
}

export type GoalStatus = "active" | "completed" | "archived";

export interface Goal {
  id: number;
  category: Category;
  title: string;
  description: string | null;
  status: GoalStatus;
  created_at: string;
}

export interface EventItem {
  id: number;
  update_id: number;
  category: Category;
  type: string;
  description: string;
  sentiment: Sentiment | null;
  confidence: number | null;
  details: Record<string, unknown>;
  is_corrected: boolean;
  created_at: string;
}

export interface UpdateItem {
  id: number;
  content: string;
  created_at: string;
  events: EventItem[];
}

export interface EvidenceRef {
  event_id: number;
  update_id: number;
  description: string;
}

export interface CategoryScore {
  category: Category;
  score: number;
  event_count: number;
  trend: string;
  confidence: string;
}

export interface PeriodSummary {
  period: string;
  start: string;
  end: string;
  total_events: number;
  category_counts: Record<string, number>;
  category_scores: CategoryScore[];
  overall_score: number;
  narrative: string;
  warnings: string[];
  evidence: Record<string, EvidenceRef[]>;
}

export interface ForecastItem {
  category: Category;
  horizon_days: number;
  direction: string;
  confidence: string;
  pct_change: number | null;
  narrative: string;
}

export interface Dashboard {
  overall_score: number;
  category_scores: CategoryScore[];
  top_observation: string;
  warnings: string[];
  recommendation: string;
  forecast_7day: ForecastItem[];
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface AskResponse {
  answer: string;
  sources: UpdateItem[];
  used_ai: boolean;
}

export interface DaySummary {
  day: string;
  summary: string;
  entry_count: number;
  used_ai: boolean;
}
