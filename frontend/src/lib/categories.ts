import {
  BookOpen,
  Briefcase,
  CircleHelp,
  HeartPulse,
  type LucideIcon,
  Palette,
  Sprout,
  Users,
  Wallet,
} from "lucide-react";
import type { Category } from "../api/types";

interface CategoryMeta {
  label: string;
  Icon: LucideIcon;
  /** CSS custom property holding this category's accent color (see index.css). */
  color: string;
}

export const CATEGORY_META: Record<Category, CategoryMeta> = {
  health: { label: "Health", Icon: HeartPulse, color: "var(--cat-health)" },
  career: { label: "Career", Icon: Briefcase, color: "var(--cat-career)" },
  finance: { label: "Finance", Icon: Wallet, color: "var(--cat-finance)" },
  relationships: { label: "Relationships", Icon: Users, color: "var(--cat-relationships)" },
  learning: { label: "Learning", Icon: BookOpen, color: "var(--cat-learning)" },
  personal_growth: { label: "Personal Growth", Icon: Sprout, color: "var(--cat-growth)" },
  lifestyle: { label: "Lifestyle", Icon: Palette, color: "var(--cat-lifestyle)" },
};

export function categoryMeta(category: string): CategoryMeta {
  return (
    CATEGORY_META[category as Category] ?? {
      label: category.replaceAll("_", " "),
      Icon: CircleHelp,
      color: "var(--text-muted)",
    }
  );
}
