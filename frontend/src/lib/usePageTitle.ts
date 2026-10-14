import { useEffect } from "react";

/** Sets the browser tab title, e.g. "Goals · JDC", so tabs and history are distinguishable. */
export function usePageTitle(title: string): void {
  useEffect(() => {
    document.title = `${title} · JDC`;
  }, [title]);
}
