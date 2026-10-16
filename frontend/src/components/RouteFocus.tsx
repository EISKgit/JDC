import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

/**
 * After navigating to another page, move keyboard / screen-reader focus to the main
 * content, as a full page load would. Without this, focus stays on the clicked nav link
 * and screen-reader users aren't told the page changed.
 */
export function RouteFocus() {
  const { pathname } = useLocation();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false; // initial load: leave focus where the browser puts it
      return;
    }
    document.getElementById("main")?.focus();
  }, [pathname]);
  return null;
}
