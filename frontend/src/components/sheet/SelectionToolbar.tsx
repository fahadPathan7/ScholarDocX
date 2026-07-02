import React from "react";
import { formatTSV } from "./sheetPaste";
import { ColumnDef } from "./sheetModel";

interface SelectionToolbarProps {
  selectedCount: number;
  onClear: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onCopy: () => void;
}

export const SelectionToolbar: React.FC<SelectionToolbarProps> = ({
  selectedCount,
  onClear,
  onDelete,
  onDuplicate,
  onCopy
}) => {
  if (selectedCount === 0) return null;

  return (
    <div className="selection-toolbar">
      <div className="selection-toolbar-left">
        <span className="selection-count">{selectedCount} row{selectedCount > 1 ? "s" : ""} selected</span>
        <button className="text-button" onClick={onClear}>Clear selection</button>
      </div>
      <div className="selection-toolbar-actions">
        <button className="secondary-button" onClick={onCopy}>Copy</button>
        <button className="secondary-button" onClick={onDuplicate}>Duplicate</button>
        <button className="danger-button" onClick={onDelete}>Delete</button>
      </div>
    </div>
  );
};
