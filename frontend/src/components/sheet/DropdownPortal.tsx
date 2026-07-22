/* ------------------------------------------------------------------ */
/*  DropdownPortal — renders a dropdown menu into document.body so it  */
/*  escapes ancestor `overflow: hidden` / `overflow-x: auto` clipping. */
/*                                                                    */
/*  On small screens the sheet toolbars scroll horizontally and every  */
/*  ancestor clips. An inline `position: absolute` menu gets cut off   */
/*  no matter how high its z-index is. Portaling to <body> and using   */
/*  `position: fixed` (anchored to the trigger button) is the only     */
/*  reliable fix. This mirrors the existing Modal.tsx / RowPeekPanel   */
/*  portal pattern.                                                    */
/*                                                                    */
/*  Responsibilities:                                                  */
/*  - Position the menu below + right-aligned to the trigger.          */
/*  - Clamp to the viewport so wide menus never overflow small screens.*/
/*  - Flip above the trigger when there is no room below.              */
/*  - Re-position on window resize and any ancestor scroll.            */
/*  - Close on outside click (excluding the trigger, which the toggle  */
/*    button handles itself).                                          */
/* ------------------------------------------------------------------ */

import { ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Coords = { top: number; left: number };

const GAP = 4; // gap between trigger and menu (matches the old marginTop: 4px)
const MARGIN = 8; // min distance from the viewport edge

export function DropdownPortal({
  triggerRef,
  children,
  className,
  onOutsideClick,
}: {
  /** The toggle button the menu anchors to. */
  triggerRef: React.RefObject<HTMLElement | null>;
  children: ReactNode;
  className?: string;
  /** Fired on mousedown outside both the menu and the trigger. */
  onOutsideClick?: () => void;
}) {
  const [coords, setCoords] = useState<Coords | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const place = useCallback(() => {
    const trig = triggerRef.current;
    const menu = menuRef.current;
    if (!trig) return;
    const r = trig.getBoundingClientRect();
    const menuW = menu ? menu.offsetWidth : 0;
    const menuH = menu ? menu.offsetHeight : 0;

    // Default: directly below the trigger, right-aligned to its right edge.
    let top = r.bottom + GAP;
    let left = r.right - menuW;

    // Horizontal clamp into the viewport.
    if (left < MARGIN) left = MARGIN;
    if (left + menuW > window.innerWidth - MARGIN) {
      left = Math.max(MARGIN, window.innerWidth - MARGIN - menuW);
    }

    // Flip above the trigger when there is no room below.
    if (top + menuH > window.innerHeight - MARGIN) {
      const upTop = r.top - GAP - menuH;
      if (upTop > MARGIN) top = upTop;
    }

    setCoords({ top, left });
  }, [triggerRef]);

  // Compute position synchronously before paint (no flash).
  useLayoutEffect(() => {
    place();
    window.addEventListener("resize", place);
    // capture: true so we catch scrolls on ANY ancestor (e.g. the scrolling toolbar).
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [place]);

  // Outside-click close. The trigger is excluded so the toggle button can
  // manage open/close itself without a double-toggle race.
  useEffect(() => {
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (menuRef.current?.contains(t)) return;
      if (triggerRef.current?.contains(t)) return;
      onOutsideClick?.();
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [onOutsideClick, triggerRef]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={menuRef}
      className={className}
      style={{
        position: "fixed",
        // Park off-screen (but laid out, so we can measure) until placed.
        top: coords ? coords.top : -9999,
        left: coords ? coords.left : -9999,
        zIndex: 10000,
        visibility: coords ? "visible" : "hidden",
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
