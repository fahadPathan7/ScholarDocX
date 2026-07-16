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
}: {
  children: ReactNode;
  onClose: () => void;
  zIndex?: number;
  scope?: "main" | "body";
}) {
  const [portalTarget] = useState(() => resolvePortalTarget(scope));
  const isMainScope = scope === "main" && (portalTarget.tagName === "MAIN" || portalTarget.classList.contains("main-content"));

  return createPortal(
    <div
      className={isMainScope ? "modal-backdrop modal-backdrop-main" : "modal-backdrop"}
      style={{ zIndex }}
      onClick={onClose}
    >
      {children}
    </div>,
    portalTarget
  );
}
