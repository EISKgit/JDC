import type { ReactNode } from "react";
import { Logo } from "./Logo";

const HIGHLIGHTS = [
  { icon: "✍️", text: "Write about your day in plain words" },
  { icon: "🧩", text: "JDC sorts it into 7 life areas automatically" },
  { icon: "📊", text: "See scores, trends and a 7-day outlook" },
  { icon: "🗓️", text: "Look back at any day in your history" },
];

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-page">
      <aside className="auth-hero">
        <div className="auth-hero-brand">
          <Logo size={40} />
          <span>JDC</span>
        </div>
        <h1>
          Just a Daily <span className="gradient-text">Companion</span>
        </h1>
        <p className="auth-hero-tagline">
          A few sentences a day. A clear picture of how your life is really going.
        </p>
        <ul className="auth-highlights">
          {HIGHLIGHTS.map((h) => (
            <li key={h.text}>
              <span aria-hidden="true">{h.icon}</span>
              {h.text}
            </li>
          ))}
        </ul>
      </aside>
      <div className="auth-form-side">{children}</div>
    </div>
  );
}
