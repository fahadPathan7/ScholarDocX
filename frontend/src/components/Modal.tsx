/**
 * Canonical modal backdrop for main-content modals.
 *
 * DO NOT copy the backdrop markup from other files — many still use a legacy
 * inline `<div className="modal-backdrop modal-backdrop-main">` without this
 * portal and will blur only `.section-body` (wrong).
 *
 * Contract (see AGENTS.md "Modal backdrop blur"):
 * - scope="main" (default): portal into `.main-content`, apply `.modal-backdrop-main`
 *   → blur covers work surface only; Sidebar + TopBar stay sharp.
 * - scope="body": portal into document.body, apply `.modal-backdrop` only
 *   → full viewport (Documents upload, App.tsx global modals).
 *
 * New modals in project/sheet views: wrap panel in <Modal onClose={…}>, never
 * add your own backdrop div.
 *
 * Accessibility (added SCHOLARDOCX-0217, purely additive):
 * - Escape closes the topmost open Modal (module-level stack, so stacked
 *   dialogs close one at a time, innermost first).
 * - Focus moves into the dialog on open (panel, else first focusable, else
 *   the backdrop itself), Tab/Shift+Tab stay trapped inside, and focus is
 *   restored to the previously focused element on close.
 * - role="dialog" + aria-modal="true"; pass `label` for an accessible name.
 * - data-modal-depth="nested" when zIndex >= 1060 (stacked modal), else
 *   "root" — CSS uses it to lighten the backdrop blur for stacked modals.
 */
import { ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

function resolvePortalTarget(scope: "main" | "body"): HTMLElement {
  if (scope === "main") {
    return document.querySelector(".main-content") as HTMLElement ?? document.body;
  }
  return document.body;
}

/** Stack of currently mounted modal backdrop elements, oldest first. */
const openModalStack: HTMLElement[] = [];

/** Focusable elements for the focus trap (visible, non-disabled controls). */
const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

function getFocusableInside(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => el.getClientRects().length > 0
  );
}

export function Modal({
  children,
  onClose,
  zIndex = 1000,
  scope = "main",
  compact = false,
  label,
}: {
  children: ReactNode;
  onClose: () => void;
  zIndex?: number;
  scope?: "main" | "body";
  /** Less top padding (48px) for dense admin/settings dialogs. Default 160px. */
  compact?: boolean;
  /** Accessible name for the dialog (aria-label). Omitted when not provided. */
  label?: string;
}) {
  const [portalTarget] = useState(() => resolvePortalTarget(scope));
  const backdropRef = useRef<HTMLDivElement>(null);
  // onClose is usually an inline arrow at the call site; keep it in a ref so
  // the mount-once effect below never re-runs (re-running would re-capture
  // document.activeElement — by then already inside the modal — and corrupt
  // the focus-restore target).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const isMainScope = scope === "main" && (portalTarget.tagName === "MAIN" || portalTarget.classList.contains("main-content"));
  const backdropClass = isMainScope
    ? `modal-backdrop modal-backdrop-main${compact ? " modal-backdrop-compact" : ""}`
    : "modal-backdrop";
  const depth = zIndex >= 1060 ? "nested" : "root";

  useEffect(() => {
    const backdrop = backdropRef.current;
    if (!backdrop) return;

    // Remember what was focused before the dialog opened so it can be
    // restored on close.
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    openModalStack.push(backdrop);

    // Move focus into the dialog: the panel when it can take focus, else the
    // first focusable control, else the backdrop itself (tabIndex=-1).
    const panel = backdrop.querySelector<HTMLElement>(".modal-panel");
    const initialTarget =
      panel && panel.tabIndex >= 0
        ? panel
        : getFocusableInside(backdrop)[0] ?? panel ?? backdrop;
    initialTarget?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      // Only the topmost open Modal responds, so stacked dialogs close one at
      // a time (innermost first).
      if (openModalStack[openModalStack.length - 1] !== backdrop) return;

      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key === "Tab") {
        const focusables = getFocusableInside(backdrop);
        if (focusables.length === 0) {
          event.preventDefault();
          backdrop.focus();
          return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;
        const focusInside = active instanceof HTMLElement && backdrop.contains(active);
        if (!event.shiftKey && (active === last || !focusInside)) {
          event.preventDefault();
          first.focus();
        } else if (event.shiftKey && (active === first || !focusInside)) {
          event.preventDefault();
          last.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);

    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      const idx = openModalStack.indexOf(backdrop);
      if (idx !== -1) openModalStack.splice(idx, 1);
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createPortal(
    <div
      ref={backdropRef}
      className={backdropClass}
      style={{ zIndex }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      data-modal-depth={depth}
      tabIndex={-1}
    >
      {children}
    </div>,
    portalTarget
  );
}
