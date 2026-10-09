import { CalendarDays, LayoutGrid, LineChart, PenLine } from "lucide-react";
import type { ReactNode } from "react";
import { Logo } from "./Logo";

const HIGHLIGHTS = [
  { Icon: PenLine, text: "Write about your day in plain words" },
  { Icon: LayoutGrid, text: "JDC sorts it into 7 life areas automatically" },
  { Icon: LineChart, text: "See scores, trends and a 7-day outlook" },
  { Icon: CalendarDays, text: "Look back at any day in your history" },
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
        <p className="auth-hero-tagline">A few sentences a day. A clear picture of how your life is really going.</p>
        <ul className="auth-highlights">
          {HIGHLIGHTS.map(({ Icon, text }) => (
            <li key={text}>
              <Icon size={18} aria-hidden="true" />
              {text}
            </li>
          ))}
        </ul>
      </aside>
      <div className="auth-form-side">{children}</div>
    </div>
  );
}
