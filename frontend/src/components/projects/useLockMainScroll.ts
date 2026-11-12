import { useEffect } from "react";

/** Stop the main work surface scrolling behind an open modal. */
export function useLockMainScroll(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    const mainEl = document.querySelector<HTMLElement>("main");
    if (!mainEl) return;
    const previous = mainEl.style.overflow;
    mainEl.style.overflow = "hidden";
    return () => {
      mainEl.style.overflow = previous;
    };
  }, [locked]);
}
