import { useCallback, useEffect, useRef, useState } from "react";

export type Async<T> = { data: T | undefined; error: string | null; loading: boolean; reload: () => void };

/** Minimal data-fetching hook: re-runs when `deps` change, keeps stale data while reloading. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[], enabled = true): Async<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fnRef.current().then(
      (d) => !cancelled && (setData(d), setLoading(false)),
      (e: Error) => !cancelled && (setError(e.message), setLoading(false)),
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick, enabled]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload };
}

/** useState persisted in localStorage. */
export function useStoredState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);
  return [value, setValue] as const;
}

export function titleFromPath(path: string): string {
  const stem = path.split("/").pop()?.replace(/\.[^.]+$/, "") ?? path;
  return stem.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function relativeDate(isoDate: string): string {
  const then = new Date(isoDate + "T00:00:00");
  const days = Math.round((Date.now() - then.getTime()) / 86_400_000);
  if (Number.isNaN(days)) return isoDate;
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return then.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
