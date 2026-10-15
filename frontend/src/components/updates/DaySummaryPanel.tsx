import { FileText } from "lucide-react";
import { useState } from "react";
import { assistantApi } from "../../api/endpoints";
import type { DaySummary } from "../../api/types";
import { errorMessage } from "../../hooks/useAsync";
import { tzOffsetFor } from "../../lib/dates";

/** "Summarize day": asks the AI for a short summary of one local day. */
export function DaySummaryPanel({ dayKey: key }: { dayKey: string }) {
  const [result, setResult] = useState<DaySummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function summarize() {
    setLoading(true);
    setError(null);
    try {
      setResult(
        await assistantApi.daySummary(key, tzOffsetFor(key)),
      );
    } catch (err) {
      setError(errorMessage(err, "Could not summarize this day"));
    } finally {
      setLoading(false);
    }
  }

  if (!result) {
    return (
      <div className="day-summary-trigger">
        <button type="button" className="btn-link btn-link-icon" disabled={loading} onClick={summarize}>
          <FileText size={13} aria-hidden="true" />
          {loading ? "Summarizing..." : "Summarize day"}
        </button>
        {error && <span className="form-error">{error}</span>}
      </div>
    );
  }
  return (
    <div className="day-summary" aria-live="polite">
      <span className="day-summary-label">{result.used_ai ? "AI summary" : "Summary"}</span>
      <p>{result.summary}</p>
    </div>
  );
}
