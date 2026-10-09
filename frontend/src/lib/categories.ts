import type { Category } from "../api/types";

interface CategoryMeta {
  label: string;
  icon: string;
  /** CSS custom property holding this category's accent color (see index.css). */
  color: string;
}

export const CATEGORY_META: Record<Category, CategoryMeta> = {
  health: { label: "Health", icon: "💪", color: "var(--cat-health)" },
  career: { label: "Career", icon: "💼", color: "var(--cat-career)" },
  finance: { label: "Finance", icon: "💰", color: "var(--cat-finance)" },
  relationships: { label: "Relationships", icon: "❤️", color: "var(--cat-relationships)" },
  learning: { label: "Learning", icon: "📚", color: "var(--cat-learning)" },
  personal_growth: { label: "Personal Growth", icon: "🌱", color: "var(--cat-growth)" },
  lifestyle: { label: "Lifestyle", icon: "🎨", color: "var(--cat-lifestyle)" },
};

export function categoryMeta(category: string): CategoryMeta {
  return (
    CATEGORY_META[category as Category] ?? {
      label: category.replaceAll("_", " "),
      icon: "•",
      color: "var(--text-muted)",
    }
  );
}
