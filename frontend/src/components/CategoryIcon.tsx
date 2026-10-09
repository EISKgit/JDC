import { categoryMeta } from "../lib/categories";

/** A life area's icon in its accent color. Decorative: the label is always shown next to it. */
export function CategoryIcon({ category, size = 16 }: { category: string; size?: number }) {
  const { Icon, color } = categoryMeta(category);
  return <Icon size={size} color={color} aria-hidden="true" className="category-icon" />;
}
