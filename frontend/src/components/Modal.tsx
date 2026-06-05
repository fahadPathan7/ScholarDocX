import { ReactNode } from "react";
import { createPortal } from "react-dom";

export function Modal({ children, onClose, zIndex = 1000 }: {
  children: ReactNode;
  onClose: () => void;
  zIndex?: number;
}) {
  return createPortal(
    <div
      className="modal-backdrop"
      style={{ zIndex }}
      onClick={onClose}
    >
      {children}
    </div>,
    document.body
  );
}
