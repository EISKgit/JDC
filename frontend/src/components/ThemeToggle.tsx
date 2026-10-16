import { Monitor, Moon, Sun } from "lucide-react";
import { useState } from "react";
import { applyTheme, nextTheme, storedTheme, type Theme } from "../lib/theme";

const LABEL: Record<Theme, string> = { system: "System", light: "Light", dark: "Dark" };
const ICON = { system: Monitor, light: Sun, dark: Moon };

/** Cycles System -> Light -> Dark. The button says what it is now and what a click does. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(storedTheme);
  const Icon = ICON[theme];
  const next = nextTheme(theme);

  function cycle() {
    applyTheme(next);
    setTheme(next);
  }

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={cycle}
      aria-label={`Theme: ${LABEL[theme]}. Switch to ${LABEL[next]}`}
      title={`Theme: ${LABEL[theme]} (click for ${LABEL[next]})`}
    >
      <Icon size={16} aria-hidden="true" />
    </button>
  );
}
