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
 */
import { ReactNode, useState } from "react";
import { createPortal } from "react-dom";

function resolvePortalTarget(scope: "main" | "body"): HTMLElement {
  if (scope === "main") {
    return document.querySelector(".main-content") as HTMLElement ?? document.body;
  }
  return document.body;
}

export function Modal({
  children,
  onClose,
  zIndex = 1000,
  scope = "main",
  compact = false,
}: {
  children: ReactNode;
  onClose: () => void;
  zIndex?: number;
  scope?: "main" | "body";
  /** Less top padding (48px) for dense admin/settings dialogs. Default 160px. */
  compact?: boolean;
}) {
  const [portalTarget] = useState(() => resolvePortalTarget(scope));
  const isMainScope = scope === "main" && (portalTarget.tagName === "MAIN" || portalTarget.classList.contains("main-content"));
  const backdropClass = isMainScope
    ? `modal-backdrop modal-backdrop-main${compact ? " modal-backdrop-compact" : ""}`
    : "modal-backdrop";

  return createPortal(
    <div
      className={backdropClass}
      style={{ zIndex }}
      onClick={onClose}
    >
      {children}
    </div>,
    portalTarget
  );
}
