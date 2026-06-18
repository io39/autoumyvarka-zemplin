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
 * unchanged). Put the ref on a wrapper that sits where the scroll region starts
 * (just outside the ScrollArea); the returned `height` goes on the scroll
 * region's `style`.
 *
 * Recompute triggers: mount, window `resize`, the md breakpoint change, **and**
 * a `ResizeObserver` on the grid content — the Day/Week views are re-rendered
 * (not remounted) on date navigation, so the content height can change without a
 * resize event; the observer catches that (and Realtime block add/remove).
 */
export function useFillHeight<T extends HTMLElement>(marginPx = 24) {
  const ref = useRef<T>(null);
  const [height, setHeight] = useState<number | undefined>(undefined);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const mq = window.matchMedia("(min-width: 768px)");
    // The Radix viewport's first child is the grid content; its natural
    // border-box height is reported regardless of the clipping we apply, so
    // observing it is stable (setting our height doesn't change its size → no
    // observer feedback loop).
    const content = el
      .querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]')
      ?.firstElementChild as HTMLElement | null;

    const compute = () => {
      if (!mq.matches) {
        setHeight(undefined);
        return;
      }
      const top = el.getBoundingClientRect().top;
      const avail = Math.floor(window.innerHeight - top - marginPx);
      const contentH = content?.scrollHeight ?? el.scrollHeight;
      setHeight(contentH > avail ? Math.max(240, avail) : undefined);
    };

    compute();
    window.addEventListener("resize", compute);
    mq.addEventListener("change", compute);

    let ro: ResizeObserver | undefined;
    if (content && typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => compute());
      ro.observe(content);
    }

    return () => {
      window.removeEventListener("resize", compute);
      mq.removeEventListener("change", compute);
      ro?.disconnect();
    };
  }, [marginPx]);

  return { ref, height };
}
