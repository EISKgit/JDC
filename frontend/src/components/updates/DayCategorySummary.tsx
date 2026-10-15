import type { CSSProperties } from "react";
import type { UpdateItem } from "../../api/types";
import { categoryMeta } from "../../lib/categories";

/** The life areas a day touched, as small coloured pills with counts. */
export function DayCategorySummary({ updates }: { updates: UpdateItem[] }) {
  const counts = new Map<string, number>();
  for (const u of updates) for (const e of u.events) counts.set(e.category, (counts.get(e.category) ?? 0) + 1);
  if (counts.size === 0) return null;
  return (
    <div className="day-categories">
      {[...counts.entries()].map(([category, count]) => {
        const meta = categoryMeta(category);
        return (
          <span key={category} className="category-pill" style={{ "--accent": meta.color } as CSSProperties}>
            <meta.Icon size={13} aria-hidden="true" />
            {meta.label} · {count}
          </span>
        );
      })}
    </div>
  );
}
