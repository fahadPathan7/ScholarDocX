import { useEffect } from "react";
import { Archive, ArchiveRestore, CalendarClock, Check, Edit, Trash2, X } from "lucide-react";
import { SketchCanvas } from "./SketchCanvas";
import {
  checklistProgress,
  dueBucket,
  formatDue,
  parseChecklist,
  parseDue,
  parseSketch,
  parseTags,
  parseText,
  type Note,
} from "../../lib/stickyNotes";

const stamp = (value: string) =>
  `${new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} · ${new Date(value).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;

/**
 * Read view for a full note (SCHOLARDOCX-0201).
 *
 * Checklist items are tickable here too, so reading a note and working
 * through it are the same activity rather than requiring a switch into edit.
 */
export function NoteViewer({
  note,
  now,
  onEdit,
  onClose,
  onToggleItem,
  onArchive,
  onDelete,
}: {
  note: Note;
  now: Date;
  onEdit: (note: Note) => void;
  onClose: () => void;
  onToggleItem: (note: Note, itemId: string) => void;
  onArchive: (note: Note) => void;
  onDelete: (note: Note) => void;
}) {
  const text = parseText(note.body || "");
  const sketch = parseSketch(note.body || "");
  const items = parseChecklist(note);
  const tags = parseTags(note);
  const due = parseDue(note.due_at);
  const bucket = dueBucket(note, now);
  const { done, total } = checklistProgress(note);
  const archived = Boolean(note.archived_at);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "e" && !event.ctrlKey && !event.metaKey) onEdit(note);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onEdit, note]);

  return (
    <div className="modal-backdrop modal-backdrop-main" onClick={onClose}>
      <div
        className={`modal-panel sticky-view-modal color-${note.color || "sun"} font-${note.font || "caveat"} size-${note.font_size || "medium"}`}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-label={note.title || "Untitled note"}
      >
        <div className="modal-header">
          <div>
            <p className="eyebrow">{archived ? "Archived note" : "Full sticky note"}</p>
            <h2 className="sticky-view-title">{note.title || "Untitled note"}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} title="Close" aria-label="Close note">
            <X size={18} />
          </button>
        </div>

        <div className="modal-content sticky-view-content">
          {due ? (
            <div className={`sticky-due large bucket-${bucket}`}>
              <CalendarClock size={14} />
              <span>
                {bucket === "overdue" ? "Overdue — was due " : "Due "}
                {formatDue(due, now)} at {due.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
              </span>
            </div>
          ) : null}

          {tags.length ? (
            <div className="sticky-view-tags">
              {tags.map((tag) => <span className="sticky-tag chip" key={tag}>{tag}</span>)}
            </div>
          ) : null}

          {text ? (
            <div className="sticky-view-block">
              <p className="sticky-body">{text}</p>
            </div>
          ) : null}

          {note.is_checklist ? (
            <div className="sticky-view-block">
              <div className="sticky-view-block-head">
                <span>{done} of {total} done</span>
                <div className="sticky-progress" aria-hidden="true">
                  <i style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
                </div>
              </div>
              <div className="sticky-check-list expanded">
                {items.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className={`check-item tickable ${item.done ? "checked" : ""}`}
                    onClick={() => onToggleItem(note, item.id)}
                    aria-pressed={item.done}
                  >
                    <span>{item.done ? <Check size={13} /> : null}</span>
                    {item.text}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {sketch ? (
            <div className="sticky-view-block">
              <SketchCanvas paths={sketch} readOnly height={340} />
            </div>
          ) : null}
        </div>

        <div className="modal-footer sticky-view-footer">
          <div className="sticky-view-dates">
            <span className="sticky-view-date">Created: {stamp(note.created_at || note.updated_at)}</span>
            <span className="sticky-view-date">Updated: {stamp(note.updated_at)}</span>
          </div>
          <div className="sticky-view-main-actions">
            <button className="secondary" type="button" onClick={() => onArchive(note)}>
              {archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
              {archived ? "Restore" : "Archive"}
            </button>
            <button className="primary" type="button" onClick={() => onEdit(note)}>
              <Edit size={16} /> Edit note
            </button>
            <button
              className="icon-button compact sticky-view-delete-icon"
              type="button"
              onClick={() => onDelete(note)}
              aria-label="Delete note"
              title="Delete note"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
