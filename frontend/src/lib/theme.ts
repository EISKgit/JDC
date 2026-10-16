/**
 * Light / dark / system theme. "system" follows the OS setting (CSS media query);
 * "light" or "dark" pin it via <html data-theme="...">, which index.css respects.
 * The choice is remembered per browser.
 */
export type Theme = "system" | "light" | "dark";

const KEY = "jdc_theme";
export const THEMES: Theme[] = ["system", "light", "dark"];

export function storedTheme(): Theme {
  try {
    const value = localStorage.getItem(KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === "system") delete root.dataset.theme;
  else root.dataset.theme = theme;
  try {
    if (theme === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch {
    // storage blocked: the theme still applies for this visit
  }
}

export function nextTheme(theme: Theme): Theme {
  return THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
}
