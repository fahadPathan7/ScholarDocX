import { useEffect, useRef } from "react";

/**
 * Scroll-reveal hook (dependency-free).
 *
 * Attaches an IntersectionObserver to the returned ref. When the element
 * scrolls into view, the `in-view` class is added once and the observer
 * disconnects. Pair with the `.reveal` styles in `landing-shared.css`.
 *
 * Honors `prefers-reduced-motion`: when reduced motion is requested, the
 * element is marked in-view immediately so content is always visible.
 */
export function useReveal<T extends HTMLElement = HTMLElement>(
  options?: IntersectionObserverInit
) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // If the user prefers reduced motion, reveal immediately without observing.
    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    if (prefersReduced || typeof IntersectionObserver === "undefined") {
      node.classList.add("in-view");
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("in-view");
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -10% 0px", ...options }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [options]);

  return ref;
}
