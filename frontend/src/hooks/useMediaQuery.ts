import { useEffect, useState } from "react";

/**
 * Subscribe to a CSS media query and re-render when the match changes.
 *
 * Returns `false` during the first render (SSR-safe / no layout flash for the
 * desktop-default markup), then synchronizes to the real match on mount and
 * on every subsequent change. Use this for behaviour that must react to the
 * viewport (e.g. switching the sidebar into a mobile drawer).
 *
 * For pure layout changes prefer CSS media queries; reserve this hook for
 * cases where the component tree itself must differ (e.g. rendering a
 * hamburger button vs. a collapse toggle).
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(query);
    // Sync immediately on mount so we don't keep the desktop default if we're
    // already on a mobile viewport.
    setMatches(mql.matches);

    const handler = (event: MediaQueryListEvent) => setMatches(event.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [query]);

  return matches;
}

/** Convenience breakpoint helpers aligned to the app's responsive scale. */
export const useIsMobile = () => useMediaQuery("(max-width: 1450px)");
