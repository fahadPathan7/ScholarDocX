/* ------------------------------------------------------------------ */
/*  SheetMenu — one dropdown, used by every menu in the sheet chrome   */
/*                                                                     */
/*  The toolbar previously repeated the same trigger-button-plus-      */
/*  portal-plus-hand-written-panel-styles block for each menu, with    */
/*  the panel's appearance spelled out inline every time. That is why  */
/*  the menus had drifted apart from one another. One component, one   */
/*  stylesheet, and adding a menu is now a few lines.                  */
/*                                                                     */
/*  SCHOLARDOCX-0202.                                                  */
/* ------------------------------------------------------------------ */

import { useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { DropdownPortal } from "./DropdownPortal";

export function SheetMenu({
  label,
  icon,
  title,
  active = false,
  badge,
  width = 232,
  children,
}: {
  label: string;
  icon: ReactNode;
  title?: string;
  /** Something inside is switched on — the trigger says so without opening. */
  active?: boolean;
  badge?: string | number | null;
  width?: number;
  /** Receives a closer so an item can dismiss the menu after acting. */
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`sheet-btn sheet-menu-trigger${active ? " is-active" : ""}${open ? " is-open" : ""}`}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        title={title || label}
      >
        {icon}
        <span className="sheet-btn-label">{label}</span>
        {badge != null && badge !== "" ? <span className="sheet-btn-badge">{badge}</span> : null}
        <ChevronDown size={12} className="sheet-menu-caret" />
      </button>
      {open ? (
        <DropdownPortal triggerRef={triggerRef} onOutsideClick={() => setOpen(false)}>
          <div className="sheet-menu-panel" style={{ width }} role="menu">
            {children(() => setOpen(false))}
          </div>
        </DropdownPortal>
      ) : null}
    </>
  );
}

export const SheetMenuLabel = ({ children }: { children: ReactNode }) => (
  <div className="sheet-menu-label">{children}</div>
);

export const SheetMenuDivider = () => <div className="sheet-menu-divider" />;

export function SheetMenuItem({
  icon,
  children,
  onClick,
  selected = false,
  danger = false,
  hint,
}: {
  icon?: ReactNode;
  children: ReactNode;
  onClick: () => void;
  selected?: boolean;
  danger?: boolean;
  hint?: string;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className={`sheet-menu-item${selected ? " is-selected" : ""}${danger ? " is-danger" : ""}`}
      onClick={onClick}
      title={hint}
    >
      {icon ? <span className="sheet-menu-item-icon">{icon}</span> : null}
      <span className="sheet-menu-item-text">{children}</span>
    </button>
  );
}

/** A checkbox or radio row. `kind` only changes the control's shape. */
export function SheetMenuToggle({
  checked,
  onChange,
  children,
  kind = "checkbox",
  name,
  trailing,
}: {
  checked: boolean;
  onChange: () => void;
  children: ReactNode;
  kind?: "checkbox" | "radio";
  name?: string;
  trailing?: ReactNode;
}) {
  return (
    <label className="sheet-menu-item as-toggle">
      <input type={kind} name={name} checked={checked} onChange={onChange} />
      <span className="sheet-menu-item-text">{children}</span>
      {trailing ? <span className="sheet-menu-item-trailing">{trailing}</span> : null}
    </label>
  );
}
