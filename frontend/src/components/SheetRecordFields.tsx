import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { FormEvent, KeyboardEvent } from "react";
import { Clipboard, Save, X } from "lucide-react";
import { FilePickerField } from "./FilePickerField";
import { API_BASE, RecordMap } from "../lib/api";
import { getToken } from "../lib/auth";
import type { ColumnDef, DateColorConfig, CellStyle } from "./sheet/sheetModel";
import { textStyleToCss, cellBoxToCss } from "./sheet/sheetModel";
import { CellStyleBar } from "./sheet/CellStyleBar";

const CELL_EDITOR_MIN_LINES = 3;
const CELL_EDITOR_MAX_LINES = 10;

/* One shared ResizeObserver for every cell's overflow detection —
   thousands of per-cell observers measurably slow large sheets. */
const overflowCallbacks = new WeakMap<Element, () => void>();
const sharedOverflowObserver = typeof ResizeObserver !== "undefined"
  ? new ResizeObserver((entries) => {
      for (const entry of entries) {
        overflowCallbacks.get(entry.target)?.();
      }
    })
  : null;

/* Muted pill palette for select options, aligned with the academic theme */
const SELECT_PILL_COLORS = [
  { bg: "rgba(47, 109, 122, 0.14)", fg: "#1f4f5a" },   // teal
  { bg: "rgba(217, 154, 61, 0.18)", fg: "#8a5a14" },   // gold
  { bg: "rgba(56, 163, 127, 0.16)", fg: "#1f6b52" },   // green
  { bg: "rgba(178, 79, 79, 0.14)", fg: "#8a3535" },    // red
  { bg: "rgba(111, 66, 193, 0.12)", fg: "#54348f" },   // violet
  { bg: "rgba(23, 63, 70, 0.12)", fg: "#173f46" },     // ink
];

function selectPillStyle(value: string, column: ColumnDef) {
  const options = column.options || [];
  let idx = options.indexOf(value);
  if (idx < 0) {
    // Stable fallback for values not in the declared options
    idx = 0;
    for (let i = 0; i < value.length; i++) idx = (idx * 31 + value.charCodeAt(i)) % 997;
  }
  return SELECT_PILL_COLORS[idx % SELECT_PILL_COLORS.length];
}

function resizeCellEditor(textarea: HTMLTextAreaElement) {
  const styles = window.getComputedStyle(textarea);
  const parsedLineHeight = Number.parseFloat(styles.lineHeight);
  const lineHeight = Number.isFinite(parsedLineHeight) ? parsedLineHeight : 22;
  const paddingBlock =
    (Number.parseFloat(styles.paddingTop) || 0) +
    (Number.parseFloat(styles.paddingBottom) || 0);
  const borderBlock = textarea.offsetHeight - textarea.clientHeight;
  const minHeight = lineHeight * CELL_EDITOR_MIN_LINES + paddingBlock + borderBlock;
  const maxHeight = lineHeight * CELL_EDITOR_MAX_LINES + paddingBlock + borderBlock;

  textarea.style.height = "auto";
  textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight + borderBlock, minHeight), maxHeight)}px`;
  textarea.style.overflowY = textarea.scrollHeight + borderBlock > maxHeight ? "auto" : "hidden";
}

export function TypedRecordField({
  column,
  value,
  files,
  onChange,
  onFileUploaded
}: {
  column: ColumnDef;
  value: string;
  files: RecordMap[];
  onChange: (value: string) => void;
  onFileUploaded: () => Promise<void>;
}) {
  switch (column.type) {
    case "file":
      return (
        <label className="field">
          <span>{column.name}</span>
          <FilePickerField
            value={value}
            files={files}
            onChange={onChange}
            onFileUploaded={onFileUploaded}
          />
        </label>
      );

    case "bool":
      return (
        <label className="field bool-field">
          <span>{column.name}</span>
          <div
            className={`bool-toggle${value === "Yes" ? " active" : ""}`}
            role="switch"
            aria-checked={value === "Yes"}
            tabIndex={0}
            onClick={() => onChange(value === "Yes" ? "No" : "Yes")}
            onKeyDown={(event) => {
              if (event.key === " " || event.key === "Enter") {
                event.preventDefault();
                onChange(value === "Yes" ? "No" : "Yes");
              }
            }}
          >
            <span className="bool-toggle-track">
              <span className="bool-toggle-thumb" />
            </span>
            <span className="bool-toggle-label">{value === "Yes" ? "Yes" : "No"}</span>
          </div>
        </label>
      );

    case "number":
      return (
        <label className="field">
          <span>{column.name}</span>
          <input
            type="number"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="0"
          />
        </label>
      );

    case "date":
      return (
        <label className="field">
          <span>{column.name}</span>
          <input
            type={column.name.toLowerCase().includes("time") ? "datetime-local" : "date"}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onClick={(event) => {
              if ("showPicker" in event.currentTarget) {
                (event.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
              }
            }}
          />
        </label>
      );

    case "select":
      return (
        <label className="field">
          <span>{column.name}</span>
          <select value={value} onChange={(event) => onChange(event.target.value)}>
            <option value="">Select</option>
            {(column.options || []).map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </label>
      );

    default:
      return (
        <label className="field">
          <span>{column.name}</span>
          <textarea
            rows={column.name.toLowerCase().includes("body") || column.name.toLowerCase().includes("notes") ? 4 : 2}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                event.currentTarget.closest("form")?.requestSubmit();
              }
            }}
          />
        </label>
      );
  }
}

/** Map cell textAlign to a flex justify-content (flex containers ignore text-align). */
function flexAlign(align: CellStyle["align"]): "flex-start" | "center" | "flex-end" {
  if (align === "center") return "center";
  if (align === "right") return "flex-end";
  return "flex-start";
}

export function CellRenderer({
  column,
  value,
  files = [],
  onSave,
  onFileUploaded,
  isEditing,
  onCloseEdit,
  dateColorConfig,
  openOnClick = true,
  cellStyle = {},
  onCellStyle,
  onCellClearFormatting,
}: {
  column: ColumnDef;
  value: string;
  files?: RecordMap[];
  onSave?: (value: string) => Promise<void> | void;
  onFileUploaded?: () => Promise<void>;
  isEditing?: boolean;
  onCloseEdit?: () => void;
  dateColorConfig?: DateColorConfig;
  /** When false, single click does not open the modal viewer (grid focuses instead). */
  openOnClick?: boolean;
  /** Per-cell text formatting (bold/italic/color/…). Applied to the inner span. */
  cellStyle?: CellStyle;
  /** Apply a partial cell style (full-cell viewer format bar). */
  onCellStyle?: (patch: CellStyle) => void;
  /** Clear all cell formatting (full-cell viewer format bar). */
  onCellClearFormatting?: () => void;
}) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [isSavingCell, setIsSavingCell] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [copyLabel, setCopyLabel] = useState("Copy");
  const [isOverflowing, setIsOverflowing] = useState(false);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const contentRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!viewerOpen) setDraft(value);
  }, [value, viewerOpen]);

  useEffect(() => {
    if (isEditing !== undefined) {
      setViewerOpen(isEditing);
      if (isEditing) setDraft(value);
    }
  }, [isEditing, value]);

  useLayoutEffect(() => {
    if (viewerOpen && editorRef.current) {
      resizeCellEditor(editorRef.current);
    }
  }, [draft, viewerOpen]);

  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content || !value) {
      setIsOverflowing(false);
      return;
    }

    const checkOverflow = () => {
      if (!content) return;

      const parentCell = content.closest('td');
      if (!parentCell) {
        setIsOverflowing(false);
        return;
      }

      const cellHeight = parentCell.clientHeight;
      const contentHeight = content.scrollHeight;

      // Show dots if content height > cell height (content is cut off)
      setIsOverflowing(contentHeight > cellHeight + 2);
    };

    // Initial check with delay for rendering
    const timeoutId = setTimeout(checkOverflow, 30);

    // Watch for size changes via the shared observer (one per app, not per cell)
    const parentCell = content.closest('td');
    const observed: Element[] = [];
    if (sharedOverflowObserver) {
      for (const el of [parentCell, content]) {
        if (!el) continue;
        overflowCallbacks.set(el, checkOverflow);
        sharedOverflowObserver.observe(el);
        observed.push(el);
      }
    }

    return () => {
      clearTimeout(timeoutId);
      for (const el of observed) {
        sharedOverflowObserver?.unobserve(el);
        overflowCallbacks.delete(el);
      }
    };
  }, [value]);

  const openViewer = () => {
    setDraft(value);
    setSaveError("");
    setViewerOpen(true);
  };
  const closeViewer = () => {
    setViewerOpen(false);
    if (onCloseEdit) onCloseEdit();
    setCopyLabel("Copy");
    setSaveError("");
  };
  const handlePreviewKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openViewer();
    }
  };
  const copyValue = async () => {
    try {
      await navigator.clipboard.writeText(draft);
      setCopyLabel("Copied");
      window.setTimeout(() => setCopyLabel("Copy"), 1600);
    } catch {
      setCopyLabel("Copy failed");
      window.setTimeout(() => setCopyLabel("Copy"), 1600);
    }
  };
  const saveValue = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!onSave || isSavingCell) return;
    setSaveError("");
    setIsSavingCell(true);
    try {
      await onSave(draft);
      closeViewer();
    } catch (error) {
      console.error(error);
      setSaveError("Could not save this cell.");
    } finally {
      setIsSavingCell(false);
    }
  };
  const handleEditorKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeViewer();
    }
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      saveValue();
    }
  };

  const renderEditor = () => {
    // The editor is a plain input — do NOT apply cell formatting here.
    // Formatting shows on the grid cell and in the read-only Peek panel.
    if (column.type === "number") {
      return (
        <input
          className="sheet-cell-viewer-input"
          type="number"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleEditorKeyDown}
          autoFocus
        />
      );
    }
    if (column.type === "url") {
      return (
        <input
          className="sheet-cell-viewer-input"
          type="url"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleEditorKeyDown}
          placeholder="https://..."
          autoFocus
        />
      );
    }
    if (column.type === "date") {
      return (
        <input
          className="sheet-cell-viewer-input"
          type={column.name.toLowerCase().includes("time") ? "datetime-local" : "date"}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onClick={(event) => {
            if ("showPicker" in event.currentTarget) {
              (event.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
            }
          }}
          onKeyDown={handleEditorKeyDown}
          autoFocus
        />
      );
    }
    if (column.type === "bool") {
      return (
        <select
          className="sheet-cell-viewer-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleEditorKeyDown}
          autoFocus
        >
          <option value="">Blank</option>
          <option value="Yes">Yes</option>
          <option value="No">No</option>
        </select>
      );
    }
    if (column.type === "select") {
      const options = column.options || [];
      const includesDraft = !draft || options.includes(draft);
      return (
        <select
          className="sheet-cell-viewer-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleEditorKeyDown}
          autoFocus
        >
          <option value="">Blank</option>
          {!includesDraft ? <option value={draft}>{draft}</option> : null}
          {options.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      );
    }
    if (column.type === "file") {
      return (
        <div className="sheet-cell-viewer-file-field">
          <FilePickerField
            value={draft}
            files={files}
            onChange={setDraft}
            onFileUploaded={onFileUploaded || (async () => {})}
          />
        </div>
      );
    }
    return (
      <textarea
        ref={editorRef}
        className="sheet-cell-viewer-editor"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={handleEditorKeyDown}
        autoFocus
      />
    );
  };

  const viewer = (
    <div className="sheet-cell-viewer-backdrop" onClick={closeViewer}>
      <form className="sheet-cell-viewer" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={`Edit value for ${column.name}`} onSubmit={saveValue}>
        <div className="sheet-cell-viewer-head">
          <div>
            <span>Edit cell</span>
            <h2>{column.name}</h2>
          </div>
          <div className="sheet-cell-viewer-actions">
            <button className="secondary" type="button" onClick={copyValue}>
              <Clipboard size={15} />
              {copyLabel}
            </button>
            <button className="icon-button compact" type="button" onClick={closeViewer} title="Close cell viewer">
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="sheet-cell-viewer-content">
          {renderEditor()}
          {saveError ? <p className="sheet-cell-viewer-error">{saveError}</p> : null}
        </div>
        <div className="sheet-cell-viewer-footer">
          <button className="secondary" type="button" onClick={closeViewer}>Cancel</button>
          <button className="primary" type="submit" disabled={!onSave || isSavingCell}>
            <Save size={15} />
            {isSavingCell ? "Saving..." : "Save cell"}
          </button>
        </div>
      </form>
    </div>
  );

  const interactiveProps = openOnClick
    ? {
        "aria-label": `Open full value for ${column.name}`,
        role: "button" as const,
        tabIndex: 0,
        onClick: openViewer,
        onKeyDown: handlePreviewKeyDown,
      }
    : {};

  if (column.type === "file") {
    const parts = value.split(", ").filter(Boolean);
    return (
      <>
        <span
          ref={contentRef}
          className="file-badge sheet-cell-preview sheet-cell-trigger"
          {...interactiveProps}
        >
          {parts.length ? (
            <>
              {parts.map((part, index) => {
                const fileName = part.split(" (")[0];
                const fileRecord = files.find((file) => part === `${file.display_name} (${file.relative_path})`);
                return (
                  <span key={part}>
                    {fileRecord ? (
                      <a
                        href={`${API_BASE}/files/${fileRecord.id}/content${getToken() ? `?token=${encodeURIComponent(getToken()!)}` : ""}`}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(event) => event.stopPropagation()}
                      >
                        {fileName}
                      </a>
                    ) : (
                      fileName
                    )}
                    {index < parts.length - 1 ? ", " : ""}
                  </span>
                );
              })}
              {isOverflowing && (
                <span className="sheet-cell-overflow-indicator" aria-hidden="true">
                  <span></span>
                  <span></span>
                  <span></span>
                </span>
              )}
            </>
          ) : (
            <span className="empty-cell">-</span>
          )}
        </span>
        {viewerOpen ? viewer : null}
      </>
    );
  }

  // Date Color logic
  let dateColorBubble = null;
  if (column.type === "date" && value && dateColorConfig) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const d = new Date(value);
    
    if (!isNaN(d.getTime())) {
      const diffTime = d.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      let indicatorColor = "";
      if (diffDays < 0) {
        indicatorColor = "var(--text-tertiary)"; // Past
      } else if (diffDays <= dateColorConfig.redDays) {
        indicatorColor = "var(--danger)"; // Urgent
      } else if (diffDays <= dateColorConfig.yellowDays) {
        indicatorColor = "var(--warning)"; // Upcoming
      } else {
        indicatorColor = "var(--success)"; // Far future
      }
      
      dateColorBubble = (
        <span 
          style={{
            display: 'inline-block',
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: indicatorColor,
            marginRight: '6px',
            flexShrink: 0
          }} 
          title={`${diffDays < 0 ? 'Past' : `In ${diffDays} day(s)`}`}
        />
      );
    }
  }

  // Select and bool values render as scannable status pills
  let pillContent = null;
  if (value && column.type === "select") {
    const pill = selectPillStyle(value, column);
    pillContent = (
      <span className="sheet-select-pill" style={{ backgroundColor: pill.bg, color: pill.fg }}>
        {value}
      </span>
    );
  } else if (value && column.type === "bool") {
    const isYes = value === "Yes" || value === "true" || value === "1";
    pillContent = (
      <span className={`sheet-bool-pill ${isYes ? "yes" : "no"}`}>
        {isYes ? "Yes" : "No"}
      </span>
    );
  }

  return (
    <>
      <span
        ref={contentRef}
        className="sheet-cell-preview sheet-cell-trigger"
        style={{
          ...textStyleToCss(cellStyle),
          ...cellBoxToCss(cellStyle),
          // Force block display when formatted — .sheet-cell-preview uses
          // display:-webkit-box which ignores textAlign and mis-renders bg.
          ...(Object.keys(cellStyle).length > 0 ? { display: 'block', WebkitLineClamp: 'unset', WebkitBoxOrient: 'unset' } : {}),
        }}
        {...interactiveProps}
      >
        {value ? (
          column.type === "url" ? (
            <a href={value} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()} style={{ color: "var(--ui-brand)", textDecoration: "underline" }}>
              {value}
            </a>
          ) : pillContent ? (
            pillContent
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: flexAlign(cellStyle.align), width: '100%' }}>
                {dateColorBubble}
                {value}
              </div>
              {isOverflowing && (
                <span className="sheet-cell-overflow-indicator" aria-hidden="true">
                  <span></span>
                  <span></span>
                  <span></span>
                </span>
              )}
            </>
          )
        ) : (
          <span className="empty-cell">-</span>
        )}
      </span>
      {viewerOpen ? createPortal(viewer, document.body) : null}
    </>
  );
}

export function rowClass(row: Record<string, string>) {
  const candidate = row["Follow-up date"] || row["Scheduled send time"] || row["Date"];
  if (!candidate) return "";
  const due = new Date(candidate);
  if (Number.isNaN(due.getTime())) return "";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.ceil((due.getTime() - today.getTime()) / 86400000);
  if (days <= 3) return "due-urgent";
  if (days <= 7) return "due-warning";
  if (days <= 10) return "due-watch";
  return "";
}
