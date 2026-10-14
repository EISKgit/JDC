/**
 * The Ask JDC conversation survives moving between pages, but not closing the tab
 * (sessionStorage) and not logging out (cleared then), because answers quote the
 * journal and the next person on a shared computer shouldn't see them.
 */
const KEY = "jdc_ask_history";
const MAX_MESSAGES = 50;

export function loadAskHistory<T>(): T[] {
  try {
    const raw = sessionStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export function saveAskHistory<T>(messages: T[]): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(messages.slice(-MAX_MESSAGES)));
  } catch {
    // storage full or blocked: the conversation just won't survive navigation
  }
}

export function clearAskHistory(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // nothing to clear
  }
}
