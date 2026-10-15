import { Archive, Check, RotateCcw, Trash2 } from "lucide-react";
import { type CSSProperties, useState } from "react";
import { Link } from "react-router-dom";
import { goalsApi } from "../../api/endpoints";
import type { Goal, GoalStatus } from "../../api/types";
import { categoryMeta } from "../../lib/categories";
import { CategoryIcon } from "../CategoryIcon";

/** One goal with its status actions. Reports changes upward; owns only its busy state. */
export function GoalCard({
  goal,
  activity,
  onChange,
  onDelete,
}: {
  goal: Goal;
  activity: number;
  onChange: (goal: Goal) => void;
  onDelete: (id: number) => void;
}) {
  const [busy, setBusy] = useState(false);
  const meta = categoryMeta(goal.category);

  async function setStatus(status: GoalStatus) {
    setBusy(true);
    try {
      onChange(await goalsApi.setStatus(goal.id, status));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await goalsApi.remove(goal.id);
      onDelete(goal.id);
    } catch {
      setBusy(false);
    }
  }

  return (
    <li className={`card goal-card goal-${goal.status}`} style={{ "--accent": meta.color } as CSSProperties}>
      <div className="goal-main">
        <span className="goal-icon">
          <CategoryIcon category={goal.category} size={18} />
        </span>
        <div>
          <strong className="goal-title">{goal.title}</strong>
          {goal.description && <p className="goal-description">{goal.description}</p>}
          <span className="goal-meta">
            {meta.label}
            {goal.status === "active" && (
              <>
                {" · "}
                {activity > 0 ? (
                  `${activity} ${activity === 1 ? "entry" : "entries"} in this area this week`
                ) : (
                  <Link to="/updates">no entries in this area this week</Link>
                )}
              </>
            )}
          </span>
        </div>
      </div>
      <div className="goal-actions">
        {goal.status === "active" ? (
          <>
            <button type="button" className="btn-secondary btn-small" disabled={busy} onClick={() => setStatus("completed")}>
              <Check size={14} aria-hidden="true" />
              Done
            </button>
            <button type="button" className="icon-btn" aria-label="Archive goal" disabled={busy} onClick={() => setStatus("archived")}>
              <Archive size={15} aria-hidden="true" />
            </button>
          </>
        ) : (
          <button type="button" className="btn-secondary btn-small" disabled={busy} onClick={() => setStatus("active")}>
            <RotateCcw size={14} aria-hidden="true" />
            Reopen
          </button>
        )}
        <button type="button" className="icon-btn" aria-label="Delete goal" disabled={busy} onClick={remove}>
          <Trash2 size={15} aria-hidden="true" />
        </button>
      </div>
    </li>
  );
}
