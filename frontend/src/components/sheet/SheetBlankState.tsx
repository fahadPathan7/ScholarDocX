/* ------------------------------------------------------------------ */
/*  SheetBlankState — a sheet that has no columns yet                   */
/*                                                                     */
/*  This used to be one line of grey text: "Add columns first to start */
/*  tracking records." It described the situation and offered no way   */
/*  out of it — every toolbar action is disabled in this state, so a   */
/*  new sheet was a dead end unless you already knew where the column  */
/*  editor lived.                                                      */
/*                                                                     */
/*  SCHOLARDOCX-0202.                                                  */
/* ------------------------------------------------------------------ */

import { Plus, Settings, Table2 } from "lucide-react";

export function SheetBlankState({
  onAddColumn,
  onEditColumns,
}: {
  onAddColumn: () => void;
  onEditColumns: () => void;
}) {
  return (
    <div className="sheet-blank-state">
      <Table2 size={34} />
      <strong>This sheet has no columns yet.</strong>
      <p>
        Columns are the things you want to track — a university name, a deadline,
        an application status. Add a few and the grid appears.
      </p>
      <div className="sheet-blank-actions">
        <button type="button" className="sheet-btn is-primary" onClick={onAddColumn}>
          <Plus size={15} /> Add your first column
        </button>
        <button type="button" className="sheet-btn" onClick={onEditColumns}>
          <Settings size={15} /> Edit columns
        </button>
      </div>
    </div>
  );
}
