import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";

/** The current time, re-read every `intervalMs`. Chips use it to age in front of the viewer
 *  (a frame can fall out of teal while you watch). `fixed` pins it for /_kit. */
export function useNow(intervalMs = 60_000, fixed?: number): number {
  const [now, setNow] = useState(() => fixed ?? Date.now());
  useEffect(() => {
    if (fixed != null) return;
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, fixed]);
  return fixed ?? now;
}

/** Reduced motion, either from the OS or forced (the kit's ?state=reduced). The spec's
 *  reduced paths drop movement AND the crossfades that carry it, so components read this
 *  instead of relying on Motion's transform-only reduction. */
export function useReduced(force?: boolean): boolean {
  const os = useReducedMotion();
  return force ?? !!os;
}

/** True below the given width. Subscribes to the media query rather than to resize, so it
 *  fires once per breakpoint crossing instead of on every frame of a drag. */
export function useNarrow(maxWidth = 639): boolean {
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && window.matchMedia(`(max-width: ${maxWidth}px)`).matches);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${maxWidth}px)`);
    const on = () => setNarrow(mq.matches);
    mq.addEventListener("change", on);
    on();
    return () => mq.removeEventListener("change", on);
  }, [maxWidth]);
  return narrow;
}
