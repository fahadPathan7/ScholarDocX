import React, { useEffect, useRef, useState } from "react";
import { PenLine } from "lucide-react";
import { ColumnDef } from "./sheetModel";

interface SelectionToolbarProps {
  selectedCount: number;
  columns: ColumnDef[];
  onClear: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onCopy: () => void;
  onSetValue: (columnName: string, value: string) => void;
}

export const SelectionToolbar: React.FC<SelectionToolbarProps> = ({
  selectedCount,
  columns,
  onClear,
  onDelete,
  onDuplicate,
  onCopy,
  onSetValue
}) => {
  const [showSetValue, setShowSetValue] = useState(false);
  const [targetColumn, setTargetColumn] = useState("");
  const [value, setValue] = useState("");
  const popoverRef = useRef<HTMLDivElement>(null);

  // Bulk set-value works for every editable type except files (picker flow)
  const editableColumns = columns.filter(c => c.type !== "group" && c.type !== "file");
  const targetDef = editableColumns.find(c => c.name === targetColumn);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setShowSetValue(false);
      }
    }
    if (showSetValue) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showSetValue]);

  if (selectedCount === 0) return null;

  const renderValueInput = () => {
    if (!targetDef) return null;
    switch (targetDef.type) {
      case "select":
        return (
          <select value={value} onChange={e => setValue(e.target.value)}>
            <option value="">Blank</option>
            {(targetDef.options || []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        );
      case "bool":
        return (
          <select value={value} onChange={e => setValue(e.target.value)}>
            <option value="">Blank</option>
            <option value="Yes">Yes</option>
            <option value="No">No</option>
          </select>
        );
      case "date":
        return <input type={targetDef.name.toLowerCase().includes("time") ? "datetime-local" : "date"} value={value} onChange={e => setValue(e.target.value)} />;
      case "number":
        return <input type="number" value={value} onChange={e => setValue(e.target.value)} placeholder="0" />;
      default:
        return <input type="text" value={value} onChange={e => setValue(e.target.value)} placeholder="Value" />;
    }
  };

  return (
    <div className="selection-toolbar">
      <div className="selection-toolbar-left">
        <span className="selection-count">{selectedCount} row{selectedCount > 1 ? "s" : ""} selected</span>
        <button className="text-button" onClick={onClear}>Clear selection</button>
      </div>
      <div className="selection-toolbar-actions" style={{ position: "relative" }}>
        <button className="secondary-button" onClick={() => { setShowSetValue(s => !s); setValue(""); if (!targetColumn && editableColumns.length > 0) setTargetColumn(editableColumns[0].name); }}>
          <PenLine size={13} style={{ marginRight: "4px", verticalAlign: "-2px" }} />Set value
        </button>
        <button className="secondary-button" onClick={onCopy}>Copy</button>
        <button className="secondary-button" onClick={onDuplicate}>Duplicate</button>
        <button className="danger-button" onClick={onDelete}>Delete</button>

        {showSetValue && (
          <div ref={popoverRef} className="set-value-popover">
            <div className="set-value-popover-title">Set one value on {selectedCount} row{selectedCount > 1 ? "s" : ""}</div>
            <label>
              Column
              <select
                value={targetColumn}
                onChange={e => { setTargetColumn(e.target.value); setValue(""); }}
              >
                {editableColumns.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
            </label>
            <label>
              Value
              {renderValueInput()}
            </label>
            <div className="set-value-popover-actions">
              <button className="text-button" onClick={() => setShowSetValue(false)}>Cancel</button>
              <button
                className="primary"
                disabled={!targetDef}
                onClick={() => {
                  if (!targetDef) return;
                  onSetValue(targetDef.name, value);
                  setShowSetValue(false);
                }}
              >
                Apply
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
