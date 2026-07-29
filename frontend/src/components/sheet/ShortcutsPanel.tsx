/* ------------------------------------------------------------------ */
/*  ShortcutsPanel — the sheet's keyboard reference (SCHOLARDOCX-0202) */
/*                                                                     */
/*  The grid already supported arrow navigation, Tab wrapping,         */
/*  type-to-edit, Ctrl+D fill-down, copy/paste and undo. None of it    */
/*  was written down anywhere in the UI, so in practice most of it     */
/*  did not exist. The list itself is data in sheetGrid.ts.            */
/* ------------------------------------------------------------------ */

import { useEffect } from "react";
import { X } from "lucide-react";
import { Modal } from "../Modal";
import { SHEET_SHORTCUTS } from "./sheetGrid";

export function ShortcutsPanel({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <Modal onClose={onClose}>
      <div
        className="modal-panel sheet-shortcuts"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-label="Keyboard shortcuts"
      >
        <div className="modal-header">
          <div>
            <p className="eyebrow">Sheet</p>
            <h2>Keyboard shortcuts</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close" title="Close">
            <X size={18} />
          </button>
        </div>

        <div className="modal-content">
          <div className="sheet-shortcuts-grid">
            {SHEET_SHORTCUTS.map((group) => (
              <section className="sheet-shortcuts-group" key={group.title}>
                <h4>{group.title}</h4>
                <dl>
                  {group.items.map((item) => (
                    <div className="sheet-shortcut" key={item.keys}>
                      <dt>{item.keys}</dt>
                      <dd>{item.description}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
