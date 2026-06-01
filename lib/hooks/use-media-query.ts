"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Tracks a CSS media query via `useSyncExternalStore` (the React-recommended way
 * to read an external store). SSR-safe: the server snapshot is `false`, so the
 * server and first client render agree, then it reflects the real match. Used to
 * pick the order Sheet's side (bottom on mobile, right on desktop).
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query],
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
