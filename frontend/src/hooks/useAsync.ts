import { type Dispatch, type SetStateAction, useCallback, useEffect, useState } from "react";
import { ApiError } from "../api/client";

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  /** A message to show (with a Try again button), or null. */
  error: string | null;
  /** Load again from scratch (the Try again button). */
  retry: () => void;
  /** Update the loaded data locally after a change (e.g. an item was added). */
  setData: Dispatch<SetStateAction<T | null>>;
}

export function errorMessage(err: unknown, fallback = "Something went wrong"): string {
  return err instanceof ApiError ? err.message : fallback;
}

/**
 * Load data for a page: tracks loading / error, ignores answers that arrive after the
 * page is gone, and supports retrying. Replaces the same state machine that used to be
 * copied into every page.
 *
 * `load` is read once per attempt; pass `deps` if it depends on changing values.
 */
export function useAsync<T>(load: () => Promise<T>, deps: readonly unknown[] = []): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    load().then(
      (value) => {
        if (!active) return;
        setData(value);
        setLoading(false);
      },
      (err: unknown) => {
        if (!active) return;
        setError(errorMessage(err));
        setLoading(false);
      },
    );
    return () => {
      active = false;
    };
    // `load` is a new function every render; what it loads changes only with `deps`.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, ...deps]);

  const retry = useCallback(() => {
    setLoading(true);
    setError(null);
    setAttempt((n) => n + 1);
  }, []);

  return { data, loading, error, retry, setData };
}
