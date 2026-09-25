import { useEffect, useRef, useState } from "react";

// Fast providers can return the first token before React ever paints the
// loading state, making "Thinking..." flash imperceptibly (or not at all)
// while slower providers show it clearly — not a gating bug, but an
// inconsistent user-visible experience across providers. Keeps `want: true`
// visible for at least `minMs` once it first becomes true, regardless of how
// quickly the caller flips it back to false.
export function useMinimumVisibleDuration(
  want: boolean,
  minMs: number,
): boolean {
  const [visible, setVisible] = useState(want);
  const shownAtRef = useRef<number | null>(want ? Date.now() : null);

  useEffect(() => {
    if (want) {
      shownAtRef.current ??= Date.now();
      setVisible(true);
      return;
    }

    const shownAt = shownAtRef.current;
    if (shownAt === null) {
      setVisible(false);
      return;
    }

    const remaining = minMs - (Date.now() - shownAt);
    if (remaining <= 0) {
      shownAtRef.current = null;
      setVisible(false);
      return;
    }

    const timer = setTimeout(() => {
      shownAtRef.current = null;
      setVisible(false);
    }, remaining);
    return () => clearTimeout(timer);
  }, [want, minMs]);

  return visible;
}
