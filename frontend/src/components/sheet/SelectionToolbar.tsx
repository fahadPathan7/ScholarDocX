import React from "react";
import { Copy as CopyIcon, Files, Trash2, X, Eye, Edit, Mail } from "lucide-react";

interface SelectionToolbarProps {
  selectedCount: number;
  onClear: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onCopy: () => void;
  onPeek?: () => void;
  onEdit?: () => void;
  onEmail?: () => void;
}

export const SelectionToolbar: React.FC<SelectionToolbarProps> = ({
  selectedCount,
  onClear,
  onDelete,
  onDuplicate,
  onCopy,
  onPeek,
  onEdit,
  onEmail
}) => {
  if (selectedCount === 0) return null;

  return (
    <div className="selection-toolbar">
      <div className="selection-toolbar-left">
        <span className="selection-count-badge">{selectedCount}</span>
        <span className="selection-count-label">
          {selectedCount} row{selectedCount > 1 ? "s" : ""} selected
        </span>
        <button className="selection-deselect-btn" onClick={onClear} title="Clear selection">
          <X size={12} /> Deselect
        </button>
      </div>
      <div className="selection-toolbar-actions" style={{ position: "relative" }}>
        {selectedCount === 1 && (
          <>
            <button className="sel-action-btn" onClick={onPeek} title="Peek details">
              <Eye size={13} /> View Details
            </button>
            <button className="sel-action-btn" onClick={onEdit} title="Edit row">
              <Edit size={13} /> Edit
            </button>
            <button className="sel-action-btn" onClick={onEmail} title="Compose email">
              <Mail size={13} /> Email
            </button>
          </>
        )}
        <button className="sel-action-btn" onClick={onCopy}>
          <CopyIcon size={13} /> Copy
        </button>
        <button className="sel-action-btn" onClick={onDuplicate}>
          <Files size={13} /> Duplicate
        </button>
        <button className="sel-action-btn sel-danger" onClick={onDelete}>
          <Trash2 size={13} /> Delete
        </button>
      </div>
    </div>
  );
};
