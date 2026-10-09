import { useState } from "react";
import { Link } from "react-router-dom";

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

const STEPS = [
  {
    title: "Set up your Life Profile",
    body: "Tell JDC what you care about and which life areas to focus on. Focus areas count 1.5× in your overall score.",
    to: "/onboarding",
    cta: "Open Life Profile",
  },
  {
    title: "Write a quick daily update",
    body: "Plain sentences about your day. JDC splits them into events and sorts each into a life area: no forms, no tagging.",
    to: "/updates",
    cta: "Write an update",
  },
  {
    title: "Come back here for insights",
    body: "Scores, trends and suggestions refresh every time you log. The more days you log, the sharper they get.",
    to: null,
    cta: null,
  },
];

const OUTCOMES = [
  { icon: "🎯", title: "Life score", where: "Top of this page", body: "0–100 per area plus a weighted overall score for the last 7 days." },
  { icon: "📈", title: "Trends", where: "Arrows on each area card", body: "↑ improving, ↓ declining, → stable vs. the previous week." },
  { icon: "⚠️", title: "Early warnings", where: "“What may need attention”", body: "Flags an area with repeated negative updates." },
  { icon: "💡", title: "Recommended focus", where: "Below the observation", body: "The one area that most needs a small, consistent action." },
  { icon: "🔮", title: "7-day outlook", where: "Bottom of this page", body: "Where each area is heading if the current pattern continues." },
  { icon: "🗓️", title: "Day-by-day history", where: "Updates page", body: "Every entry grouped by date, with a date picker to look back." },
];

export function AboutJdc({ defaultOpen }: { defaultOpen: boolean }) {
  const [open, setOpen] = useState(() => readStoredOpen() ?? defaultOpen);

  function toggle() {
    setOpen((prev) => {
      storeOpen(!prev);
      return !prev;
    });
  }

  return (
    <section className={`card guide ${open ? "guide-open" : ""}`} aria-labelledby="guide-heading">
      <div className="guide-header">
        <div>
          <p className="eyebrow">JDC at a glance</p>
          <h2 id="guide-heading">Your daily notes, turned into a clear picture of your life</h2>
        </div>
        <button type="button" className="btn-secondary" aria-expanded={open} onClick={toggle}>
          {open ? "Hide guide" : "How JDC works"}
        </button>
      </div>

      {open && (
        <div className="guide-body">
          <p className="guide-intro">
            <strong>JDC (Just a Daily Companion)</strong> is a personal life tracker. You write about your day in your own
            words; JDC turns it into events across seven life areas (health, career, finance, relationships, learning,
            personal growth and lifestyle) and shows how each one is really going, based only on what you logged.
          </p>

          <h3 className="guide-subheading">How to use it</h3>
          <ol className="guide-steps">
            {STEPS.map((step, i) => (
              <li key={step.title} className="guide-step">
                <span className="guide-step-number">{i + 1}</span>
                <div>
                  <strong>{step.title}</strong>
                  <p>{step.body}</p>
                  {step.to && (
                    <Link to={step.to} className="guide-link">
                      {step.cta} →
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ol>

          <h3 className="guide-subheading">What you get and where to find it</h3>
          <ul className="guide-outcomes">
            {OUTCOMES.map((o) => (
              <li key={o.title} className="guide-outcome">
                <span className="guide-outcome-icon" aria-hidden="true">
                  {o.icon}
                </span>
                <div>
                  <strong>{o.title}</strong>
                  <p>{o.body}</p>
                  <span className="guide-where">📍 {o.where}</span>
                </div>
              </li>
            ))}
          </ul>

          <p className="guide-footnote">
            Scores come from fixed, transparent formulas over your logged events. AI is only used to read your updates
            and to word the insights. If an event lands in the wrong area, fix it on the Updates page and your scores
            follow.
          </p>
        </div>
      )}
    </section>
  );
}
