"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Desktop-only (≥ md) height for the calendar scroll region so its bottom — and
 * its horizontal scrollbar — stays on screen:
 *
 * - If the content is **taller than the available viewport height**, return a
 *   definite height that fills to the viewport bottom (minus `marginPx`) → the
 *   grid scrolls internally and the bar pins to the bottom of the on-screen area.
 *   A definite height (not `max-height`) is required so the Radix `h-full`
 *   viewport actually clips its content instead of spilling past the scrollbar.
 * - If the content **fits**, return `undefined` → natural height, so the bar sits
 *   directly below the bookings with no empty filler.
 *
 * Below md it always returns `undefined` (natural height, page scrolls — mobile
 * unchanged). Put the ref on a wrapper that sits where the scroll region starts;
 * the returned `height` goes onto the scroll region's `style`.
 */
export function useFillHeight<T extends HTMLElement>(marginPx = 24) {
  const ref = useRef<T>(null);
  const [height, setHeight] = useState<number | undefined>(undefined);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const mq = window.matchMedia("(min-width: 768px)");
    const compute = () => {
      if (!mq.matches) {
        setHeight(undefined);
        return;
      }
      const top = el.getBoundingClientRect().top;
      const avail = Math.floor(window.innerHeight - top - marginPx);
      // The Radix viewport's scrollHeight is the full content height even once
      // we've constrained it, so this stays correct across recomputes.
      const viewport = el.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]');
      const content = viewport?.scrollHeight ?? el.scrollHeight;
      setHeight(content > avail ? Math.max(240, avail) : undefined);
    };
    compute();
    window.addEventListener("resize", compute);
    mq.addEventListener("change", compute);
    return () => {
      window.removeEventListener("resize", compute);
      mq.removeEventListener("change", compute);
    };
  }, [marginPx]);

  return { ref, height };
}
