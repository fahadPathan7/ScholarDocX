import { Archive, ArchiveRestore, CalendarClock, Check, FileText, ListChecks, PenTool, Pin, Trash2 } from "lucide-react";
import { SketchCanvas } from "./SketchCanvas";
import {
  checklistProgress,
  dueBucket,
  formatDue,
  hasHiddenContent,
  parseChecklist,
  parseDue,
  parseSketch,
  parseTags,
  parseText,
  type Note,
} from "../../lib/stickyNotes";

const PREVIEW_ITEMS = 4;

/**
 * One note on the board (SCHOLARDOCX-0201).
 *
 * Two things changed here beyond looks. Checklist items are now tickable
 * straight from the card — the handler was already being passed in and simply
 * never wired up, so ticking a box meant opening the note, ticking, and
 * closing. And the card is a real button rather than an `<article onClick>`,
 * so it can be reached and opened with a keyboard at all.
 */
export function NoteCard({
  note,
  index,
  now,
  draggable = false,
  dragging = false,
  onOpen,
  onToggleItem,
  onTogglePin,
  onArchive,
  onDelete,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  note: Note;
  index: number;
  now: Date;
  /** Only under the manual sort — dragging under any other order would
   *  record a position the very next render throws away. */
  draggable?: boolean;
  dragging?: boolean;
  onOpen: (note: Note) => void;
  onToggleItem: (note: Note, itemId: string) => void;
  onTogglePin: (note: Note) => void;
  onArchive: (note: Note) => void;
  onDelete: (note: Note) => void;
  onDragStart?: (note: Note) => void;
  onDragOver?: (note: Note) => void;
  onDrop?: () => void;
  onDragEnd?: () => void;
}) {
  const items = parseChecklist(note);
  const sketch = parseSketch(note.body || "");
  const text = parseText(note.body || "");
  const tags = parseTags(note);
  const { done, total } = checklistProgress(note);
  const visibleItems = items.slice(0, PREVIEW_ITEMS);
  const bucket = dueBucket(note, now);
  const due = parseDue(note.due_at);
  const archived = Boolean(note.archived_at);

  // Stop a control's click from also opening the note behind it.
  const only = (run: () => void) => (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    run();
  };

  return (
    <article
      className={[
        "sticky-card",
        `color-${note.color || "sun"}`,
        `font-${note.font || "caveat"}`,
        `size-${note.font_size || "medium"}`,
        `tilt-${index % 4}`,
        bucket === "overdue" ? "is-overdue" : "",
        bucket === "today" ? "is-today" : "",
        archived ? "is-archived" : "",
        draggable ? "is-draggable" : "",
        dragging ? "is-dragging" : "",
      ].filter(Boolean).join(" ")}
      draggable={draggable}
      onDragStart={() => onDragStart?.(note)}
      onDragOver={(event) => {
        if (!draggable) return;
        // Without preventDefault the browser refuses the drop outright.
        event.preventDefault();
        onDragOver?.(note);
      }}
      onDrop={(event) => {
        if (!draggable) return;
        event.preventDefault();
        onDrop?.();
      }}
      onDragEnd={() => onDragEnd?.()}
    >
      <div className="sticky-card-actions">
        <button
          type="button"
          className={`sticky-action-btn ${note.is_pinned ? "active" : ""}`}
          onClick={only(() => onTogglePin(note))}
          aria-pressed={Boolean(note.is_pinned)}
          title={note.is_pinned ? "Unpin note" : "Pin note"}
          aria-label={note.is_pinned ? "Unpin note" : "Pin note"}
        >
          <Pin size={13} fill={note.is_pinned ? "currentColor" : "none"} />
        </button>
        <button
          type="button"
          className="sticky-action-btn"
          onClick={only(() => onArchive(note))}
          title={archived ? "Put back on the board" : "Archive note"}
          aria-label={archived ? "Restore note" : "Archive note"}
        >
          {archived ? <ArchiveRestore size={13} /> : <Archive size={13} />}
        </button>
        {archived ? (
          <button
            type="button"
            className="sticky-action-btn danger"
            onClick={only(() => onDelete(note))}
            title="Delete permanently"
            aria-label="Delete note permanently"
          >
            <Trash2 size={13} />
          </button>
        ) : null}
      </div>

      {/* The whole card opens the note. It is a button so it is focusable and
          responds to Enter and Space; the controls above sit outside it so
          they are separately reachable rather than nested inside a button. */}
      <button type="button" className="sticky-card-open" onClick={() => onOpen(note)}>
        <span className="sr-only">Open note</span>
      </button>

      <div className="sticky-card-head">
        <div className="note-title">{note.title || "Untitled"}</div>
      </div>

      {due ? (
        <div className={`sticky-due bucket-${bucket}`}>
          <CalendarClock size={12} />
          <span>{bucket === "overdue" ? `Overdue · ${formatDue(due, now)}` : formatDue(due, now)}</span>
        </div>
      ) : null}

      <div className="sticky-card-content">
        {text ? <p className="sticky-body">{text}</p> : null}
        {sketch ? <SketchCanvas paths={sketch} readOnly height="100%" /> : null}
        {note.is_checklist ? (
          <div className="sticky-check-list">
            {visibleItems.map((item) => (
              <button
                type="button"
                key={item.id}
                className={`check-item tickable ${item.done ? "checked" : ""}`}
                onClick={only(() => onToggleItem(note, item.id))}
                aria-pressed={item.done}
              >
                <span>{item.done ? <Check size={13} /> : null}</span>
                {item.text}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {tags.length ? (
        <div className="sticky-card-tags">
          {tags.slice(0, 3).map((tag) => (
            <span className="sticky-tag chip small" key={tag}>{tag}</span>
          ))}
          {tags.length > 3 ? <span className="sticky-tag chip small muted">+{tags.length - 3}</span> : null}
        </div>
      ) : null}

      <div className="sticky-card-meta">
        <div className="sticky-card-badges">
          {note.is_checklist ? (
            <div
              className={`sticky-badge sticky-badge-checklist ${done === total && total ? "complete" : ""}`}
              title={`${total} items · ${done} done`}
            >
              <ListChecks size={13} />
              <span className="sticky-badge-text">{done}/{total}</span>
            </div>
          ) : null}
          {text ? (
            <div className="sticky-badge sticky-badge-icon" title="Has a description">
              <FileText size={13} />
            </div>
          ) : null}
          {sketch ? (
            <div className="sticky-badge sticky-badge-icon" title="Has a sketch">
              <PenTool size={13} />
            </div>
          ) : null}
          {hasHiddenContent(note, PREVIEW_ITEMS) ? <div className="sticky-more">+ more</div> : null}
        </div>
        <small className="sticky-card-date">
          {new Date(note.updated_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
        </small>
      </div>
    </article>
  );
}
