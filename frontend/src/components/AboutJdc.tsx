import { ChevronDown, ChevronUp, Gauge, Hourglass, LayoutGrid, PenLine, Split, TrendingUp } from "lucide-react";
import { type CSSProperties, useState } from "react";
import { Link } from "react-router-dom";
import { categoryMeta } from "../lib/categories";
import { CategoryIcon } from "./CategoryIcon";

const STORAGE_KEY = "jdc_guide_open";

function readStoredOpen(): boolean | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === null ? null : value === "true";
  } catch {
    return null;
  }
}

function storeOpen(open: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, String(open));
  } catch {
    // storage unavailable (private mode etc.) — the toggle still works for this visit
  }
}

const EXAMPLE_EVENTS = [
  { text: "Gym in the morning", category: "health" },
  { text: "Spent $40 on groceries", category: "finance" },
];

function accent(category: string): CSSProperties {
  return { "--accent": categoryMeta(category).color } as CSSProperties;
}

/** The pipeline, each step showing what happens to one example entry. */
function Flow() {
  return (
    <ol className="flow" aria-label="How an update becomes insight">
      <li className="flow-step">
        <span className="flow-node">
          <PenLine size={20} aria-hidden="true" />
        </span>
        <strong>Write</strong>
        <span className="flow-caption">your day, in plain words</span>
        <div className="flow-example">
          <p className="flow-note">"Gym in the morning. Spent $40 on groceries."</p>
        </div>
      </li>

      <li className="flow-step">
        <span className="flow-node">
          <Split size={20} aria-hidden="true" />
        </span>
        <strong>Split</strong>
        <span className="flow-caption">into separate events</span>
        <div className="flow-example flow-stack">
          {EXAMPLE_EVENTS.map((e) => (
            <span key={e.text} className="flow-chip">
              {e.text}
            </span>
          ))}
        </div>
      </li>

      <li className="flow-step">
        <span className="flow-node">
          <LayoutGrid size={20} aria-hidden="true" />
        </span>
        <strong>Sort</strong>
        <span className="flow-caption">into 7 life areas</span>
        <div className="flow-example flow-stack">
          {EXAMPLE_EVENTS.map((e) => (
            <span key={e.category} className="flow-chip flow-chip-area" style={accent(e.category)}>
              <CategoryIcon category={e.category} size={14} />
              {categoryMeta(e.category).label}
            </span>
          ))}
        </div>
      </li>

      <li className="flow-step">
        <span className="flow-node">
          <Gauge size={20} aria-hidden="true" />
        </span>
        <strong>See</strong>
        <span className="flow-caption">scores, trends, outlook</span>
        <div className="flow-example flow-stack">
          <span className="flow-score" style={accent("health")}>
            <span>Health</span>
            <b>74</b>
            <TrendingUp size={14} aria-label="improving" />
          </span>
          <span className="flow-score" style={accent("finance")}>
            <span>Finance</span>
            <b>58</b>
            <Hourglass size={14} aria-label="not enough data yet" />
          </span>
        </div>
      </li>
    </ol>
  );
}

/** A schematic of the dashboard and Updates page, labelling where each result lives. */
function WhereToLook() {
  return (
    <div className="map" role="list" aria-label="Where to find your results">
      <div className="map-screen" role="listitem">
        <span className="map-title">Dashboard</span>
        <div className="map-zone map-hero">
          <span className="map-ring" aria-hidden="true" />
          <span className="map-label">Life score 0–100</span>
        </div>
        <div className="map-zone">
          <div className="map-tiles" aria-hidden="true">
            {Array.from({ length: 7 }, (_, i) => (
              <span key={i} />
            ))}
          </div>
          <span className="map-label">7 areas + trend arrows</span>
        </div>
        <div className="map-row">
          <div className="map-zone">
            <span className="map-label">Key observation</span>
          </div>
          <div className="map-zone map-accent">
            <span className="map-label">Recommended focus</span>
          </div>
        </div>
        <div className="map-zone map-warning">
          <span className="map-label">Warnings (when needed)</span>
        </div>
        <div className="map-zone">
          <span className="map-label">7-day outlook</span>
        </div>
      </div>

      <div className="map-screen" role="listitem">
        <span className="map-title">Updates</span>
        <div className="map-zone map-compose">
          <span className="map-label">Write today's entry</span>
        </div>
        <div className="map-zone">
          <div className="map-chips" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </div>
          <span className="map-label">Pick a day or date</span>
        </div>
        <div className="map-zone map-timeline">
          <span className="map-label">History by day, edit or delete</span>
        </div>
      </div>

      <div className="map-screen" role="listitem">
        <span className="map-title">Ask JDC</span>
        <div className="map-zone map-bubble-user">
          <span className="map-label">"When did I last go to the gym?"</span>
        </div>
        <div className="map-zone map-bubble-answer">
          <span className="map-label">Answer from your entries</span>
          <span className="map-cites" aria-hidden="true">
            <span>1</span>
            <span>2</span>
          </span>
        </div>
        <div className="map-zone">
          <span className="map-label">Linked sources</span>
        </div>
      </div>
    </div>
  );
}

export function AboutJdc({ defaultOpen }: { defaultOpen: boolean }) {
  const [open, setOpen] = useState(() => readStoredOpen() ?? defaultOpen);

  function toggle() {
    setOpen((prev) => {
      storeOpen(!prev);
      return !prev;
    });
  }

  return (
    <section className="card guide" aria-labelledby="guide-heading">
      <div className="guide-header">
        <div>
          <p className="eyebrow">JDC at a glance</p>
          <h2 id="guide-heading">From a few sentences to a clear picture of your life</h2>
        </div>
        <button type="button" className="btn-secondary" aria-expanded={open} onClick={toggle}>
          {open ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
          {open ? "Hide guide" : "How JDC works"}
        </button>
      </div>

      {open && (
        <div className="guide-body">
          <h3 className="guide-subheading">How it works</h3>
          <Flow />

          <h3 className="guide-subheading">Where to look</h3>
          <WhereToLook />

          <div className="guide-actions">
            <Link to="/onboarding" className="btn-secondary">
              1. Set up Life Profile
            </Link>
            <Link to="/updates" className="btn-primary">
              2. Write an update
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}
